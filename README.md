# Orbit Fall

A 2D arcade-style multiplayer space game built with Phaser 3 and Socket.IO.

## Overview

This project demonstrates a Phaser 3 based client and an "authoritative" Node.js server runner together with Socket.IO for networking. The authoritative server can host the game logic and serve a headless HTML runner for automated or server-driven gameplay.

## Features

- Local multiplayer demo using Socket.IO
- Phaser 3 based client (in `public/`)
- Authoritative HTML runner (in `server/authoritative_server/`) executed via a jsdom-based server runner
- Simple, moddable codebase intended for learning and prototyping networked gameplay

## Tech stack

- Node.js (server runtime)
- npm (package management)
- Express (static assets / minimal HTTP server)
- Socket.IO (real-time networking)
- Phaser 3 (game engine)
- jsdom (used by the authoritative server runner)

## Getting started

Prerequisites
- Node.js 14+ (LTS recommended)
- npm (bundled with Node.js)

Install dependencies

```powershell
npm install
```

Run the server

Start the authoritative server and the HTTP listener using the npm script or Node directly:

```powershell
npm run server
# or
node .\server\index.js
```

When the server finishes loading it will log a message such as:

```
Listening on 8082
```

Visit the client

Open your browser and point to the port specified using local host,

```
http://localhost:[PORT]

```

## Running the project

- Development server: `node .\server\index.js` (or `npm run server`)
- Default authoritative server port: 8082 (configurable via env var - see Configuration)

Notes
- The authoritative server runs a jsdom instance to load an HTML runner from `server/authoritative_server/`. This allows server-side scripts to exercise the same HTML/JS that the client uses.

## Development workflow

1. Install dependencies (`npm install`).
2. Start the server (`npm run server` or `node .\server\index.js`).
3. Open the client in a browser or run automated server-side tests that load the authoritative runner.

If you change client code under `public/`, refresh the browser to pick up changes. If you change server code, restart the server.


## Troubleshooting

- "Port already in use": stop the process occupying the port or set `PORT` to another value before starting the server:

```powershell
$env:PORT=3000; node .\server\index.js
```

- "Missing dependencies": run `npm install` and ensure there are no install errors.
- Check the console logs produced by `server/index.js` for stack traces and helpful error messages.

## Controls

- Arrow keys
  - Left: Turn Left (Counter-Clockwise)
  - Right: Turn Right (Clockwise)
  - Up: Thrust Forward
  - Down: Reverse Thrust

## Contributing

1. Fork the repository and create a feature branch.
2. Run and test your changes locally.
3. Open a pull request with a clear description of your changes.



