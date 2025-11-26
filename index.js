'use strict';

var needsToExit = false;

function throwExit() {
    console.log("Throwing exit signal...");
    needsToExit = true;
}

var signals = {
    'SIGHUP': 1,
    'SIGINT': 2,
    'SIGTERM': 15
};

Object.keys(signals).forEach((signal) => {
    process.on(signal, () => {
        console.log(`Server heard ${signal} signal!`);
        throwExit();
    });
});

try {
    // Web service
    (async () => {
        const express = require('express');
        const app = express();
        const port = 3000;
        const path = require('path');

        app.use(express.static(path.join(__dirname, 'public')));
        app.use('/node_modules/@xterm/xterm', express.static(path.join(__dirname, 'node_modules/@xterm/xterm')));

        app.listen(port, () => {
            console.log(`Slime mold front-end ready at http://localhost:${port}/`);
        });
    })();
} catch(err) {
    console.error(err);
    throwExit();
}

// App
(async () => {
    const pg = require('pg');
    const { Client } = pg;

    const client = new Client()
    await client.connect()
    console.log("Successfully connected to database!");

    await client.query(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    mass DECIMAL(6,2),
    saturation DECIMAL(5,2),
    activity INTEGER
);
`.trim());

    const WebSocket = require('ws');
    const wss = new WebSocket.Server({ port: 8080 });

    wss.on('connection', async (ws) => {
        console.log('New client connected');

        // For storing miscellaneous metadata about the connection
        const clientProfile = {};

        ws.on('message', async (message) => {
            const response = await handleClientPacket(client, clientProfile, JSON.parse(message));
            if (response) ws.send(JSON.stringify(response));
        });

        ws.on('close', () => {
            console.log('Client disconnected');
        });
    });

    // Await some exit condition
    while (!needsToExit) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("Closing node...");
    await client.end();
    process.exit(0);
})();

async function handleClientPacket(sql, client, packet) {
    //
}
