'use strict';

(async () => {
    const pg = require('pg');
    const { Client } = pg;

    const client = new Client()
    await client.connect()
    console.log("Hello world!");
    await client.end();
})();
