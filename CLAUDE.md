# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Start the server:**
```bash
node server/index.js
```
The server runs on port 8082 and serves both the game client (browser) and handles authoritative game logic.

**Install dependencies:**
```bash
npm install
```

## Architecture

This is a multiplayer Phaser 3 game with authoritative server architecture:

### Server-side (`server/`)
- **`server/index.js`**: Express server with Socket.IO handling client connections. Serves static files and manages websocket communication on port 8082.
- **`server/authoritative_server/`**: Contains headless Phaser game instance running server-side physics and game logic. The authoritative game state lives here.
  - Uses Phaser.HEADLESS mode for physics simulation without rendering
  - Manages player positions, collisions, scoring, and star pickups
  - Broadcasts state updates to all connected clients

### Client-side (`server/public/`)
- **`server/public/clientGame.js`**: Browser Phaser instance that:
  - Receives authoritative state from server via Socket.IO
  - Sends player input to server
  - Renders game visuals and HUD (HP, XP bars, scores)
  - Falls back to local-only mode if server unavailable
  - Camera follows player with 2000x2000 world bounds

### Key Game Flow
1. Client connects via Socket.IO → Server creates player in authoritative state
2. Client sends input (arrow keys) → Server updates physics
3. Server broadcasts positions → Clients render sprites
4. Star pickup on server → Updates scores, moves star, broadcasts to all clients

### Shared Assets
Assets in `server/authoritative_server/assets/` are served at `/assets` route for both server physics and client rendering.

## Tech Stack
- **Phaser 3**: Game framework for both server (headless) and client
- **Socket.IO**: Real-time bidirectional communication
- **Express**: HTTP server and static file serving
- **jsdom**: DOM environment for server-side Phaser (canvas module required)