'use strict';

const term = document.getElementById("terminal");
term.append(document.createElement("p"));

function appendToTerminal(content) {
    term.lastChild.append(content);
}

function appendNewLineToTerminal() {
    term.append(document.createElement("p"));
}

function print(msg) {
    const endsInNewline = msg.endsWith('\n');
    const lines = msg.trim().split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
            appendToTerminal(document.createTextNode(line));
        }
        if (i < lines.length - 1) {
            appendNewLineToTerminal();
        }
    }
    if (endsInNewline) {
        appendNewLineToTerminal();
    }
    setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
    }, 300);
}

var socket = new WebSocket("ws://localhost:8080");

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
        print(data.content);
    }
});

document.addEventListener("keydown", function(event) {
    if (!socket) return;
    const key = event.key;
    if (
        key === '0' || key === '1' || key === '2' || key === '3' || key === '4' ||
            key === '5' || key === '6' || key === '7' || key === '8' || key === '9'
    ) {
        socket.send(JSON.stringify({
            messageType: 'keyPress',
            key: event.key
        }));
    }
});
