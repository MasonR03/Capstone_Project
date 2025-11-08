const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
// Load environment variables from .env if present
try {
  require('dotenv').config();
} catch (err) {
  // dotenv not installed or failed to load; proceed using process.env
}

// Import the authoritative server
const { initializeServer } = require('./authoritativeServer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// ------------------------------
// Serve your public client files
// ------------------------------
// (update the path if public is outside server/)
app.use(express.static(path.join(__dirname, 'public')));

// Serve shared assets (ships, stars, etc.)
app.use(
  '/assets',
  express.static(path.join(__dirname, 'authoritative_server', 'assets'))
);

// ------------------------------
// Default route for the browser game
// ------------------------------
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ------------------------------
// Initialize the authoritative game server
// ------------------------------
initializeServer(io);

// ------------------------------
// Start the server
// Read port from environment (or .env). Falls back to 8082.
// ------------------------------
const PORT = process.env.PORT || 8082;
server.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
});
