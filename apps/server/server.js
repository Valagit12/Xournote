import express from 'express';
import * as http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import path from 'path';
import { fileURLToPath } from 'url';
import { generateId, parseIncomingMessage, parseOutgoingMessage } from 'xournote-shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_MESSAGE_SIZE = 200_000;
const MAX_NOTEBOOKS = 10;
const IDLE_TTL_MS = 24 * 60 * 60 * 1000;
const EMPTY_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const app = express();

const clientBuildPath = process.env.CLIENT_BUILD_PATH
    || path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildPath));
app.use((req, res) => res.sendFile(path.join(clientBuildPath, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const notebooks = new Map();
let nextNotebookId = 1;

const createNotebook = () => {
    const id = nextNotebookId++;
    const notebook = {
        id,
        pages: [{ id: generateId('page'), text: '', strokes: [] }],
        createdAt: Date.now(),
        lastEditedAt: Date.now(),
    };
    notebooks.set(id, notebook);
    return notebook;
};

const getPage = (notebook, pageId) => {
    if (!pageId) return notebook.pages[0];
    return notebook.pages.find((p) => p.id === pageId) || notebook.pages[0];
};

const sendTo = (ws, payload) => {
    if (ws.readyState !== WebSocket.OPEN) {
        console.warn('sendTo: socket not open, dropping message', payload.type);
        return;
    }
    ws.send(JSON.stringify(payload));
};

const broadcast = (notebookId, payload, excludedClient = null) => {
    const parsed = parseOutgoingMessage(payload);
    if (!parsed.success) {
        console.warn('Dropping outbound broadcast: invalid shape', parsed.error.format());
        return;
    }
    const data = JSON.stringify(parsed.data);
    wss.clients.forEach((client) => {
        if (client === excludedClient) return;
        if (client.readyState === WebSocket.OPEN && client.notebookId === notebookId) {
            client.send(data);
        }
    });
};

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const url = new URL(req.url, `http://${req.headers.host}`);
    const notebookParam = url.searchParams.get('notebook');
    const requestedId = notebookParam ? Number(notebookParam) : null;

    if (requestedId && notebooks.has(requestedId)) {
        ws.notebookId = requestedId;
        const notebook = notebooks.get(requestedId);
        sendTo(ws, { type: 'init', data: { pages: notebook.pages } });
    } else if (requestedId) {
        sendTo(ws, { type: 'notebook:status', status: 'not_found' });
        ws.close();
        return;
    } else if (notebooks.size >= MAX_NOTEBOOKS) {
        sendTo(ws, { type: 'notebook:status', status: 'limit_reached' });
        ws.close();
        return;
    } else {
        const notebook = createNotebook();
        ws.notebookId = notebook.id;
        sendTo(ws, { type: 'notebook:status', status: 'created', data: { id: notebook.id } });
        sendTo(ws, { type: 'init', data: { pages: notebook.pages } });
    }

    console.log(`Client connected to notebook ${ws.notebookId}`);

    ws.on('message', (message) => {
        if (message.length > MAX_MESSAGE_SIZE) {
            console.warn('Message dropped: exceeds max size');
            return;
        }

        const notebook = notebooks.get(ws.notebookId);
        if (!notebook) return;

        try {
            const parsedRaw = JSON.parse(message.toString());
            const safe = parseIncomingMessage(parsedRaw);
            if (!safe.success) {
                console.warn('Dropping inbound message: invalid shape', safe.error.format());
                return;
            }
            const parsed = safe.data;

            notebook.lastEditedAt = Date.now();

            switch (parsed.type) {
                case 'page:add': {
                    const newPage =
                        parsed.data && parsed.data.id
                            ? parsed.data
                            : { id: generateId('page'), text: '', strokes: [] };
                    notebook.pages.push({ id: newPage.id, text: newPage.text || '', strokes: newPage.strokes || [] });
                    broadcast(ws.notebookId, { type: 'page:add', data: newPage });
                    break;
                }
                case 'text:update': {
                    const page = getPage(notebook, parsed.pageId);
                    if (!page) break;
                    page.text = parsed.data;
                    broadcast(ws.notebookId, { type: 'text:update', pageId: page.id, data: page.text }, ws);
                    break;
                }
                case 'stroke:add': {
                    const page = getPage(notebook, parsed.pageId);
                    if (!page) break;
                    page.strokes.push(parsed.data);
                    broadcast(ws.notebookId, { type: 'stroke:add', pageId: page.id, data: parsed.data });
                    break;
                }
                case 'stroke:remove': {
                    const page = getPage(notebook, parsed.pageId);
                    if (!page) break;
                    const strokeId = parsed.strokeId || (parsed.data && parsed.data.id);
                    if (!strokeId) break;
                    page.strokes = page.strokes.filter((s) => s.id !== strokeId);
                    broadcast(ws.notebookId, { type: 'stroke:remove', pageId: page.id, strokeId, data: { id: strokeId } });
                    break;
                }
                case 'canvas:clear': {
                    const page = getPage(notebook, parsed.pageId);
                    if (!page) break;
                    page.strokes = [];
                    broadcast(ws.notebookId, { type: 'canvas:clear', pageId: page.id });
                    break;
                }
                default:
                    console.warn('Unknown message type received', parsed.type);
            }
        } catch (error) {
            console.error('Error parsing message', error);
        }
    });

    ws.on('close', () => {
        console.log(`Client disconnected from notebook ${ws.notebookId}`);
    });
});

const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [id, notebook] of notebooks) {
        const idleTooLong = now - notebook.lastEditedAt > IDLE_TTL_MS;
        const emptyTooLong = notebook.pages.every((p) => !p.text && p.strokes.length === 0)
            && now - notebook.createdAt > EMPTY_TTL_MS;

        if (idleTooLong || emptyTooLong) {
            wss.clients.forEach((client) => {
                if (client.notebookId === id && client.readyState === WebSocket.OPEN) {
                    client.close();
                }
            });
            notebooks.delete(id);
            console.log(`Notebook ${id} cleaned up (${idleTooLong ? 'idle' : 'empty'})`);
        }
    }
}, CLEANUP_INTERVAL_MS);

wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
