'use strict';

const term = new Terminal({
    cols: 80,
    cursorBlink: true,
    rows: 25
});
term.open(document.getElementById('terminal'));

var socket = new WebSocket("ws://localhost:8080");
var offeredCaret = false;

socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
        messageType: 'requestState'
    }));
});

socket.addEventListener("close", () => {
    socket = null;
});

socket.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.messageType === 'print') {
        const content = data.content.replace(/\n/g, "\r\n");
        if (offeredCaret) {
            term.write('\r');
        }
        term.write(content);
        if (offeredCaret) {
            term.write("> ");
        }
    }
});

// Startup done; open prompt
term.write("> ");
offeredCaret = true;
term.focus();

term.onKey((event) => {
    if (!socket) return;
    term.write(event.key);
    term.write("\r\n> ");
    offeredCaret = true;
    socket.send(JSON.stringify({
        messageType: 'keyPress',
        key: event.key
    }));
});
