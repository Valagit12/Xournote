const express = require('express');
const http = require('http'); // upgrade to https later
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const state = {
    text: '',
    strokes: [],
};

const broadcast = (payload) => {
    const data = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
};

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.send(JSON.stringify({ type: 'init', data: state }));

    ws.on('message', (message) => {
        try {
            const parsed = JSON.parse(message.toString());

            switch (parsed.type) {
                case 'text:update':
                case 'update': {
                    if (typeof parsed.data !== 'string') break;
                    state.text = parsed.data;
                    broadcast({ type: 'text:update', data: state.text });
                    broadcast({ type: 'update', data: state.text });
                    break;
                }
                case 'stroke:add': {
                    if (!parsed.data || !Array.isArray(parsed.data.points)) break;
                    state.strokes.push(parsed.data);
                    broadcast({ type: 'stroke:add', data: parsed.data });
                    break;
                }
                case 'canvas:clear': {
                    state.strokes = [];
                    broadcast({ type: 'canvas:clear' });
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

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});
