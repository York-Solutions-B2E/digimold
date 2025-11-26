'use strict';

const term = new Terminal({
    cols: 80,
    cursorBlink: true,
    rows: 25
});
term.open(document.getElementById('terminal'));
term.write("> ");
term.focus();

term.onKey((event) => {
    term.write(event.key);
    term.write("\r\n> ");
});
