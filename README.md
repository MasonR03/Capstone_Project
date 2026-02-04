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
- Prisma + PostgreSQL (optional player persistence)

## Getting started

1. Prerequisites
  - Node.js 14+
  - npm (bundled with Node.js)
  - Docker / Docker Compose
2. Install dependencies

  ```powershell
  npm install
  ```

3. Run the server

  ```powershell
  npm run server
  ```

  - In local development, if `DATABASE_URL` is not set (or points to localhost but the DB isn’t running) and Docker Compose is available, this will:
    - start Postgres (`docker compose up -d db`)
    - sync the schema (`prisma db push`)

  - To skip the DB bootstrap, set `SKIP_DB_BOOTSTRAP=1` or run `npm run server:raw`.

  - When the server finishes loading it will log a message such as:

  ```
  Game server running at http://localhost:[PORT]
  ```


4. Visit the client
  - Open your browser and point to the port specified, for example:

  ```
  http://localhost:[PORT]
  ```

## Player persistence (username + stats)

When `DATABASE_URL` is set and the DB is reachable, the server will persist a small profile keyed by `username`:

- `xp` / `maxXp`
- `starsCollected`
- `gamesPlayed`

The profile is loaded the first time the client emits `setPlayerName`, and is updated on star pickup and disconnect.

## Reset DB on EC2 reboot (optional, destructive)

By default the EC2 Postgres data is stored in a named Docker volume (`orbitfall_pgdata`), so it survives reboots.

If you want the DB to be wiped automatically on host reboot (dev/ephemeral environments only), set a GitHub
Actions environment variable:

```text
RESET_DB_ON_REBOOT=1
```

On deploy, this installs an `@reboot` cron entry that runs `scripts/reset-db-on-reboot.sh` on the EC2 host.


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

