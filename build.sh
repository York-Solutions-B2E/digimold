#!/usr/bin/env sh

if [ ! -d node_modules ]; then
    npm i
fi

node index.js
