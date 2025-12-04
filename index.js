'use strict';

const ACTIVITY_NONE = 0;
const ACTIVITY_SEARCHING = 16;
const ACTIVITY_DANCING = 64;
const ACTIVITY_EATING = 65536;

const MAX_MOLD_MASS = 1000.0;
const STARTING_MOLD_MASS = 200.0;
const FOOD_MASS = 20.0;

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
        clientProfile.connection.send(JSON.stringify({
            messageType: 'clearChoices'
        }));
        this.menuBuilder(this.choices, clientProfile, print, println);
        for (let i = 0; i < this.choices.length; i++) {
            const label = this.choices[i].label;
            clientProfile.connection.send(JSON.stringify({
                messageType: 'choice',
                index: i,
                label: label
            }));
        }
    }

    handleKeyPress(keyPress, clientProfile, print, println) {
        const index = parseInt(keyPress);
        if (isNaN(index)) {
            println("Invalid choice: " + keyPress);
            return;
        }
        if (index < 0 || index >= this.choices.length) {
            println("Invalid choice: " + keyPress);
            return;
        }
        const choice = this.choices[index];
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
CREATE SEQUENCE IF NOT EXISTS mold_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS molds (
    id BIGINT NOT NULL,
    mass DECIMAL(6,2) NOT NULL,
    saturation DECIMAL(5,2) NOT NULL,
    activity INTEGER NOT NULL
);
CREATE SEQUENCE IF NOT EXISTS food_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE IF NOT EXISTS food (
    id BIGINT NOT NULL,
    mass DECIMAL(6,2) NOT NULL,
    predatorId BIGINT
);
`.trim());

    const moldDB2Obj = (dbRes) => {
        return {
            id: dbRes.id,
            mass: Number(dbRes.mass),
            saturation: Math.max(0.0, Math.min(100.0, Number(dbRes.saturation))),
            activity: dbRes.activity
        };
    }
    
    const getMoldList = async () => {
        const dbResList = (await client.query("SELECT * FROM molds")).rows;
        const objList = [];
        for (let i = 0; i < dbResList.length; i++) {
            objList.push(moldDB2Obj(dbResList[i]));
        }
        return objList;
    }

    const foodDB2Obj = (dbRes, moldList=null) => {
        let predator = null;

        if (moldList) {
            for (let i = 0; i < moldList.length; i++) {
                const moldObj = moldList[i];
                if (moldObj.id == dbRes.predatorId) {
                    predator = moldObj;
                    break;
                }
            }
        }
        
        return {
            id: dbRes.id,
            mass: Number(dbRes.mass),
            predator: predator
        };
    }

    const getMoldById = async (id) => {
        const dbRes = (await client.query("SELECT * FROM molds WHERE id=$1", [id])).rows[0];
        return moldDB2Obj(dbRes);
    }
    
    const getFoodList = async (moldList=null) => {
        if (!moldList) {
            moldList = await getMoldList();
        }
        const dbResList = (await client.query("SELECT * FROM food")).rows;
        const objList = [];
        for (let i = 0; i < dbResList.length; i++) {
            objList.push(foodDB2Obj(dbResList[i], moldList));
        }
        return objList;
    }

    const getFoodById = async (id, moldList=null) => {
        const dbRes = (await client.query("SELECT * FROM food WHERE id=$1", [id])).rows[0];
        return foodDB2Obj(dbRes, moldList);
    }
    
    const addMold = async (mass, saturation, activity) => {
        await client.query(
            "INSERT INTO molds (id, mass, saturation, activity) VALUES (nextval('mold_seq'), $1, $2, $3)",
            [mass, saturation, activity]
        );
    }
    
    const splitMoldById = async (id) => {
        const item = await getMoldById(id);
        const half = item.mass / 2.0;
        await client.query('UPDATE molds SET mass=$1 WHERE id=$2', [half, id]);
        await addMold(half, item.saturation, item.activity);
    }

    const getTotalMoldMass = async (moldList=null) => {
        let total = 0.0;

        if (!moldList) {
            moldList = await getMoldList();
        }
        
        for (let i = 0; i < moldList.length; i++) {
            total += moldList[i].mass;
        }
    }

    const getTotalFoodMass = async (foodList=null, moldList=null) => {
        let total = 0.0;

        if (!foodList) {
            foodList = await getFoodList(moldList);
        }
        
        for (let i = 0; i < foodList.length; i++) {
            total += foodList[i].mass;
        }

        return total;
    }

    const getTotalTankMass = async (moldList=null, foodList=null) => {
        if (!moldList) {
            moldList = await getMoldList();
        }

        if (!foodList) {
            foodList = await getFoodList(moldList);
        }

        return (await getTotalMoldMass(moldList)) + (await getTotalFoodMass(foodList, moldList));
    }

    const addFood = async (moldList=null, foodList=null) => {
        const massRemaining = Math.max(0.0, MAX_MOLD_MASS - (await getTotalTankMass(moldList, foodList)));
        const amount = Math.min(massRemaining, FOOD_MASS);

        if (amount >= 0.01) {
            await client.query(
                "INSERT INTO food (id, mass) VALUES (nextval('mold_seq'), $1)",
                [amount]
            );
            return amount;
        }

        return 0;
    }

    const initState = await client.query("SELECT * FROM molds;");

    if (initState.rowCount === 0) {
        await addMold(STARTING_MOLD_MASS, 100, ACTIVITY_NONE);
    }

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
                return "Caretaker_" + randVal.toString(16).toUpperCase();
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
            db: {
                getMoldList: getMoldList,
                getMoldById: getMoldById,
                getFoodList: getFoodById,
                addMold: addMold,
                addFood: addFood,
                splitMoldById: splitMoldById,
                getTotalMoldMass: getTotalMoldMass,
                getTotalFoodMass: getTotalFoodMass,
                getTotalTankMass: getTotalTankMass
            },
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
        if (key == null) return;
        const newEntry = {
            client: client,
            key: key
        };
        keyPressQueue.push(newEntry);
    }
}
