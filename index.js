'use strict';

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

// App
(async () => {
    const pg = require('pg');
    const { Client } = pg;

    const client = new Client()
    await client.connect()
    console.log("Hello world!");
    await client.end();
})();
