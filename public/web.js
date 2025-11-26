'use strict';

const term = new Terminal({
    cols: 80,
    cursorBlink: true,
    rows: 25
});
term.open(document.getElementById('terminal'));

const socket = new WebSocket("ws://localhost:8080");

socket.addEventListener("open", () => {
    // TODO: Send request for full info update
});

socket.addEventListener("message", (event) => {
    console.log(JSON.parse(event.data));
});

// Startup done; open prompt
term.write("> ");
term.focus();

term.onKey((event) => {
    term.write(event.key);
    term.write("\r\n> ");
});
