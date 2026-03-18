import express from 'express';
import * as http from 'http';
import WebSocket, { WebSocketServer } from 'ws';

import path from 'path';
import { fileURLToPath } from 'url';
import { generateId, parseIncomingMessage, parseOutgoingMessage } from 'xournote-shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const clientBuildPath = process.env.CLIENT_BUILD_PATH
    || path.join(__dirname, '..', 'client', 'build');
app.use(express.static(clientBuildPath));
app.use((req, res) => res.sendFile(path.join(clientBuildPath, 'index.html')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const MAX_MESSAGE_SIZE = 200_000;
const state = {
    pages: [
        {
            id: generateId('page'),
            text: '',
            strokes: [],
        },
    ],
};

const getPage = (pageId) => {
    if (!pageId) return state.pages[0];
    return state.pages.find((p) => p.id === pageId) || state.pages[0];
};

const broadcast = (payload) => {
    const parsed = parseOutgoingMessage(payload);
    if (!parsed.success) {
        console.warn('Dropping outbound broadcast: invalid shape', parsed.error.format());
        return;
    }
    const data = JSON.stringify(parsed.data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });

    console.log('New client connected');

    const initPayload = { type: 'init', data: state };
    const parsedInit = parseOutgoingMessage(initPayload);
    if (parsedInit.success) {
        ws.send(JSON.stringify(parsedInit.data));
    } else {
        console.warn('Init payload failed validation', parsedInit.error.format());
    }

    ws.on('message', (message) => {
        if (message.length > MAX_MESSAGE_SIZE) {
            console.warn('Message dropped: exceeds max size');
            return;
        }
        try {
            const parsedRaw = JSON.parse(message.toString());
            const safe = parseIncomingMessage(parsedRaw);
            if (!safe.success) {
                console.warn('Dropping inbound message: invalid shape', safe.error.format());
                return;
            }
            const parsed = safe.data;

            switch (parsed.type) {
                case 'page:add': {
                    const newPage =
                        parsed.data && parsed.data.id
                            ? parsed.data
                            : { id: generateId('page'), text: '', strokes: [] };
                    state.pages.push({ id: newPage.id, text: newPage.text || '', strokes: newPage.strokes || [] });
                    broadcast({ type: 'page:add', data: newPage });
                    break;
                }
                case 'text:update':
                case 'update': {
                    const page = getPage(parsed.pageId);
                    if (!page) break;
                    page.text = parsed.data;
                    broadcast({ type: 'text:update', pageId: page.id, data: page.text });
                    broadcast({ type: 'update', pageId: page.id, data: page.text });
                    break;
                }
                case 'stroke:add': {
                    const page = getPage(parsed.pageId);
                    if (!page) break;
                    page.strokes.push(parsed.data);
                    broadcast({ type: 'stroke:add', pageId: page.id, data: parsed.data });
                    break;
                }
                case 'stroke:remove': {
                    const page = getPage(parsed.pageId);
                    if (!page) break;
                    const strokeId = parsed.strokeId || (parsed.data && parsed.data.id);
                    if (!strokeId) break;
                    page.strokes = page.strokes.filter((s) => s.id !== strokeId);
                    broadcast({ type: 'stroke:remove', pageId: page.id, strokeId, data: { id: strokeId } });
                    break;
                }
                case 'canvas:clear': {
                    const page = getPage(parsed.pageId);
                    if (!page) break;
                    page.strokes = [];
                    broadcast({ type: 'canvas:clear', pageId: page.id });
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
        console.log('Client disconnected');
    });
});

const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            ws.terminate();
            return;
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('close', () => {
    clearInterval(interval);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
