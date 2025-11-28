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

const menuStates = new Map();

class PlayerMenuChoice {
    constructor(label, func) {
        this.label = label;
        this.func = func;
    }
}

class PlayerMenuState {
    constructor(menuBuilder) {
        this.menuBuilder = menuBuilder;
        this.choices = [];
    }

    load(clientProfile, print, println) {
        this.menuBuilder(this.choices, clientProfile, print, println);
        for (let i = 0; i < this.choices.length; i++) {
            println("" + (i+1) + " -> " + this.choices[i].label);
        }
    }

    handleKeyPress(keyPress, clientProfile, print, println) {
        const index = parseInt(keyPress);
        if (isNaN(index)) {
            println("Invalid choice: " + keyPress);
            return;
        }
        if (index < 1 || index > this.choices.length) {
            println("Invalid choice: " + keyPress);
            return;
        }
        const choice = this.choices[index-1];
        choice.func(clientProfile, print, println);
    }
}

function loadMenu(key, clientProfile, print, println, silent=false) {
    const menu = menuStates.get(key);
    clientProfile.menuState = menu;
    if (silent) {
        menu.load(clientProfile, () => {}, () => {});
    }
    else {
        menu.load(clientProfile, print, println);
    }
}

function defMenu(key, menuBuilder) {
    const menu = new PlayerMenuState(menuBuilder);
    menuStates.set(key, menu);
}

defMenu('rootMenu', (choices, clientProfile, print, println) => {
    choices.length = 0;
    choices.push(new PlayerMenuChoice("Select A", (clientProfile, print, println) => {
        println("You chose A!");
    }));
    choices.push(new PlayerMenuChoice("Select B", (clientProfile, print, println) => {
        println("You chose B!");
    }));
    choices.push(new PlayerMenuChoice("Select C", (clientProfile, print, println) => {
        println("You chose C!");
    }));
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

const connections = [];

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
        const clientProfile = {
            db: client,
            connection: ws
        };

        connections.push(clientProfile);

        ws.on('message', async (message) => {
            /*const response =*/ await handleClientPacket(clientProfile, JSON.parse(message));
            //if (response) ws.send(JSON.stringify(response));
        });

        ws.on('close', () => {
            connections.splice(connections.indexOf(clientProfile), 1);
            console.log('Client disconnected');
        });

        const print = (msg) => {
            if (msg === null || msg === undefined) return;
            ws.send(JSON.stringify({
                messageType: 'print',
                content: msg
            }));
        }

        const println = (msg) => {
            if (msg === null || msg === undefined) return;
            print(msg + '\n');
        }

        loadMenu('rootMenu', clientProfile, print, println, true);
    });

    // Await some exit condition
    while (!needsToExit) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("Closing node...");
    await client.end();
    process.exit(0);
})();

async function handleClientPacket(client, packet) {
    const print = (msg) => {
        if (msg === null || msg === undefined) return;
        client.connection.send(JSON.stringify({
            messageType: 'print',
            content: msg
        }));
    }

    const println = (msg) => {
        if (msg === null || msg === undefined) return;
        print(msg + '\n');
    }

    if (packet.messageType === 'requestState') {
        client.menuState.load(client, print, println);
    }
    else {
        const key = packet.key;
        if (!key) return;
        client.menuState.handleKeyPress(key, client, print, println);
    }
}
