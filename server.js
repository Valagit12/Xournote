const express = require('express');
const http = require('http'); // upgrade to https later

const WebSocket = require('ws');
const cors = require('cors');


const app = express();
app.use(cors());


const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let document = "";

wss.on('connection', (ws) => {
    console.log('New Client');

    ws.send(JSON.stringify({ type: 'init', data: document }));

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            if (parsedMessage.type === 'update') {
                document = parsedMessage.data;

                wss.clients.forEach((client) => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'update', data: document }));
                    }
                });
            }
        } catch (error) {
            console.error('Error parsing message ', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnect');
    });
});

const PORT = 8080;
server.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});