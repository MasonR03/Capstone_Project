const path = require('path');
const jsdom = require('jsdom');
const express = require('express');
const app = express();
const http = require('http');
const { Server } = require('socket.io');
const server = http.createServer(app);
const io = new Server(server, {
  // adjust as needed for your client origin/port
  cors: { origin: 'http://localhost:8081', methods: ['GET','POST'] }
});
// Use the parser class directly to avoid calling the module's async helper
// which expects a filename when invoked. This prevents calling the
// exported function with undefined (which was triggering readFile(undefined)).
const Datauri = require('datauri/parser');

const datauri = new Datauri();
const { JSDOM } = jsdom;

app.use(express.static(__dirname + '/public'));

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/index.html');
});

function setupAuthoritativePhaser() {
  JSDOM.fromFile(path.join(__dirname, 'authoritative_server/index.html'), {
    // To run the scripts in the html file
    runScripts: "dangerously",
    // Also load supported external resources
    resources: "usable",
    // So requestAnimatinFrame events fire
    pretendToBeVisual: true
  }).then((dom) => {
    dom.window.URL.createObjectURL = (blob) => {
      if (!blob) return;
      try {
        // Attempt to read internal buffer (the authoritative server runs in jsdom
        // and the Blob implementation stores the buffer on an internal symbol).
        const symbolKey = Object.getOwnPropertySymbols(blob)[0];
        const internal = symbolKey && blob[symbolKey];
        const rawBuffer = internal && internal._buffer;
        if (!rawBuffer) return;

        // Derive a file extension from the mime type if possible (e.g. 'image/png' -> '.png')
        const mime = blob.type || '';
        const ext = mime.includes('/') ? '.' + mime.split('/')[1] : mime || '';

        return datauri.format(ext, rawBuffer).content;
      } catch (err) {
        console.error('Failed to create data URI from blob:', err && err.message || err);
        return;
      }
    };
    dom.window.URL.revokeObjectURL = (objectURL) => {};
    dom.window.gameLoaded = () => {
      server.listen(8082, function () {
        console.log(`Listening on ${server.address().port}`);
      });
    };
    dom.window.io = io;
  }).catch((error) => {
    console.log(error.message);
  });
}

setupAuthoritativePhaser();
