'use strict';

const term = document.getElementById("terminal");
const choiceDiv = document.getElementById("choice-div");
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
    else if (data.messageType === 'clearChoices') {
        while (choiceDiv.childElementCount) {
            choiceDiv.removeChild(choiceDiv.firstChild);
        }
    }
    else if (data.messageType === 'choice') {
        const button = document.createElement("button");
        button.className = "term-button";
        button.textContent = data.label;
        button.metadata_index = parseInt(data.index);

        button.addEventListener("click", () => {
            if (!socket) return;
            const index = button.metadata_index;
            socket.send(JSON.stringify({
                messageType: 'keyPress',
                key: index
            }));
        });

        choiceDiv.appendChild(button);
    }
});

