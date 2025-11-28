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

        app.listen(port, () => {
            console.log(`Slime mold front-end ready at http://localhost:${port}/`);
        });
    })();
} catch(err) {
    console.error(err);
    throwExit();
}

const connections = [];
const keyPressQueue = [];
var tickCount = 0;

function createPrints(connection) {
    const print = (msg) => {
        if (msg === null || msg === undefined) return;
        connection.send(JSON.stringify({
            messageType: 'print',
            content: msg
        }));
    }

    const println = (msg) => {
        if (msg === null || msg === undefined) {
            print('\n');
            return;
        }
        print(msg + '\n');
    }

    return {
        print: print,
        println: println
    };
}

function printGenericToAll(msg, ln=false) {
    for (let i = 0; i < connections.length; i++) {
        if (!connections[i]) continue;
        try {
            const conn = connections[i].connection;
            const prints = createPrints(conn);
            if (ln) {
                prints.println(msg);
            }
            else {
                prints.print(msg);
            }
        } catch (err) {
            console.error(err);
        }
    }
}

function printToAll(msg) {
    printGenericToAll(msg);
}

function printlnToAll(msg) {
    printGenericToAll(msg, true);
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
        const clientName = (() => {
            const min = 0x1000;
            const max = 65535;
            const span = max - min;
            let taken = true;
            let rand = min;
            const randToName = (randVal) => {
                return "Caretaker_" + randVal.toString(16);
            }
            while (taken) {
                rand = Math.floor(span * Math.random()) + min;
                taken = false;
                for (let i = 0; i < connections.length; i++) {
                    if (!connections[i]) continue;
                    if (randToName(rand) === connections[i].name) {
                        taken = true;
                        break;
                    }
                }
            }
            return randToName(rand);
        })();
        const clientProfile = {
            name: clientName,
            db: client,
            connection: ws
        };

        connections.push(clientProfile);

        ws.on('message', async (message) => {
            await handleClientPacket(clientProfile, JSON.parse(message));
        });

        ws.on('close', () => {
            printlnToAll(clientProfile.name + " has left the room!");
            connections.splice(connections.indexOf(clientProfile), 1);
            console.log('Client disconnected');
        });

        const openPrints = createPrints(ws);
        openPrints.println("You are " + clientProfile.name + "!");
        printlnToAll(clientProfile.name + " has joined the room!");
        const numberOfOthers = connections.length - 1;
        const numberOfOthersMsg = (numberOfOthers === 0) ? "You are alone." : ("There are " + numberOfOthers + " other caretakers here.");
        openPrints.println(`
You find yourself in a well-lit room, built like a classroom or lab.
${numberOfOthersMsg}
In the center of the room is a tinted glass box, with an umbrella-like roof, elevated slightly above the open top of the box.
Inside the box, you see a pet slime mold.
`.trim().replace(/[\n\s]+/g, ' '));
        loadMenu('rootMenu', clientProfile, openPrints.print, openPrints.println, true);
    });

    setInterval(() => {
        while (keyPressQueue.length > 0) {
            const keyPress = keyPressQueue.shift();
            const keyClient = keyPress.client;
            const key = keyPress.key;
            const keyPrints = createPrints(keyClient.connection);
            keyClient.menuState.handleKeyPress(key, keyClient, keyPrints.print, keyPrints.println);
        }

        tickCount++;
        if (tickCount > 12) {
            tickCount -= 12;
            //TODO: Iterate global events, and updates
            //printlnToAll("Tick!");
        }
    }, 250);

    // Await some exit condition
    while (!needsToExit) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("Closing node...");
    await client.end();
    process.exit(0);
})();

async function handleClientPacket(client, packet) {
    const packetPrints = createPrints(client.connection);

    if (packet.messageType === 'requestState') {
        client.menuState.load(client, packetPrints.print, packetPrints.println);
    }
    else {
        const key = packet.key;
        if (!key) return;
        const newEntry = {
            client: client,
            key: key
        };
        keyPressQueue.push(newEntry);
    }
}
