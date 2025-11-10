# Repository Guidelines

## Project Structure & Module Organization
Game code lives under `server/`. `server/index.js` wires Express, Socket.IO, and env loading, while `authoritativeServer.js` maintains physics and score state. Client sprites, HUD logic, and debug helpers live in `server/public/` (assets under `server/public/assets/`). The deterministic HTML runner plus AI hooks sit in `server/authoritative_server/`; use it when profiling gameplay without a browser.

## Build, Test, and Development Commands
Run `npm install` once per environment. Start the stack with `npm run server`, which logs the bound host and reads `PORT` from `.env` (defaults to `8082`). Use `PORT=4000 npm run server` to align with tunnels, and restart Node whenever files under `server/` change. Static assets are served directly, so refreshing the browser is enough after editing anything in `public/`.

## Coding Style & Naming Conventions
All files use CommonJS, 2-space indentation, single quotes, and explicit semicolons (`server/public/clientGame.js`). Favor camelCase identifiers and align socket event names (`playerInput`, `playerUpdates`) between server and client modules. Phaser lifecycle functions remain regular functions to preserve `this`, while utility callbacks should be arrow functions. Keep logging concise—emoji prefixes are acceptable but group noisy logs behind debug toggles.

## Testing Guidelines
Automated tests are not yet wired; `npm test` intentionally fails so it cannot silently pass. For smoke tests, run the server, open two browser tabs at `http://localhost:PORT`, and verify movement, score sync, and console output. When debugging authoritative behavior, load `server/authoritative_server/index.html` through jsdom or a headless browser and monitor the emitted Socket.IO events. Document any manual steps or scripts you relied on inside the PR description.

## Commit & Pull Request Guidelines
Recent commits use short imperative subjects (e.g., “update port for testing”). Keep summaries under ~72 characters, mention the subsystem, and squash local WIP before pushing. Pull requests should explain motivation, summarize gameplay impact, list verification steps (logs, screenshots, or clips), and link issues. Avoid mixing refactors with feature work unless required for the same change.

## Security & Configuration Tips
Store only non-sensitive values (like `PORT`) in `.env` and never commit local secrets. Update `.env.example` and the README whenever a new variable is introduced. If deploying behind HTTPS or proxies, adjust the Socket.IO `cors.origin` list in `server/index.js` before shipping.
