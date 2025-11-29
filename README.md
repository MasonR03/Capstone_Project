# Orbit Fall

A 2D arcade-style multiplayer space game built with Phaser 3 and Socket.IO.

## Overview
This project is live at https://orbitfall.space/

This project demonstrates a Phaser 3 based client and an "authoritative" Node.js server runner together with Socket.IO for networking. The authoritative server can host the game logic and serve a headless HTML runner for automated or server-driven gameplay. Pilot a spaceship and collect stars to gain points for your team. More features coming soon!

## Features

- Local multiplayer demo using Socket.IO
- Phaser 3 based client (in `public/`)
- Authoritative HTML runner (in `server/authoritative_server/`)
- In-game debug display

## Tech stack

- Node.js (server runtime)
- npm (package management)
- Express (static assets / minimal HTTP server)
- Socket.IO (real-time networking)
- Phaser 3 (game engine)
- jsdom (used by the server runner)

## Getting started

1. Prerequisites
  - Node.js 14+
  - npm (bundled with Node.js)

2. Install dependencies

  ```powershell
  npm install
  ```

3. Run the server

  ```powershell
  npm run server
  # or
  node .\server\index.js
  ```

  - When the server finishes loading it will log a message such as:

  ```
  Game server running at http://localhost:[PORT]
  ```


4. Visit the client
  - Open your browser and point to the port specified, for example:

  ```
  http://localhost:[PORT]
  ```


## Troubleshooting

  - Configure the port via an environment variable or a `.env` file

  - Create a `.env` file in the project root with a `PORT` value (an example `.env` is included):

  ```text
  PORT=3000
  ```

  - The server will read `PORT` from the environment, so you can also start the server with an inline environment variable (PowerShell example):

  ```powershell
  $env:PORT=3000; npm run server
  # or
  $env:PORT=3000; node .\server\index.js
  ```

- "Missing dependencies": run `npm install` and ensure there are no install errors.

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

## Development workflow

1. Install dependencies (`npm install`).
2. Start the server (`npm run server` or `node .\server\index.js`).
3. Open the client in a browser or run automated server-side tests that load the authoritative runner.

If you change client code under `public/`, refresh the browser to pick up changes. If you change server code, restart the server.

