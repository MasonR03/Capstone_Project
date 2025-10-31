# Capstone Project

Phaser project with an authoritative server component.

## Overview

This repository contains a small multiplayer/Phaser demo with an "authoritative" server-side HTML runner (using jsdom) and client assets.

## Quickstart (PowerShell)

1. Install dependencies:

```powershell
npm install
```

2. Start the server:

```powershell
node .\server\index.js
```

3. Watch the server output. The authoritative server triggers the HTTP listener and will log a message like:

```
Listening on 8082
```

When you see that message the server is accepting connections on port 8082.

Note: the server starts listening on port 8082 once the embedded jsdom runner calls `gameLoaded` (see `server/index.js`).

## Project layout

- `server/` - server-side code and the authoritative server HTML
  - `server/index.js` - Express + jsdom runner + socket.io setup (listens on port 8082 after game load)
  - `server/authoritative_server/` - authoritative HTML and assets used by the jsdom runner
- `public/` - client-facing static build (browser-playable client)
- `package.json` - project dependencies and scripts
- `.gitignore` - repository ignores

## Ports

- Authoritative server: 8082 (server logs this when ready).

## Troubleshooting

- If `node .\server\index.js` exits with an error, read the console stack trace. Common causes:
  - Missing dependencies: run `npm install`
  - Port already in use: free the port or change it in `server/index.js`.

## Notes

- The server uses `jsdom` to run the authoritative Phaser client in a headless DOM; `gameLoaded` in that DOM triggers the HTTP server to start listening.
- If you want the server to start immediately without waiting for the DOM event, modify `server/index.js` to call `server.listen(...)` directly.
