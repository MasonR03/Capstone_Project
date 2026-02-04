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

const { getPrismaClient, disconnectPrisma } = require('./persistence/prisma');

// Import the authoritative server
const { initializeServer } = require('./authoritative_server/js/game');

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
// Optional DB connection check (Prisma)
// ------------------------------
void (async () => {
  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    await prisma.$connect();
    console.log('✅ Database connected (Prisma)');
  } catch (err) {
    console.warn('⚠️ Database connection failed. Player persistence will be disabled until DB is reachable.');
  }
})();

// ------------------------------
// Start the server
// Read port from environment (or .env). Falls back to 8082.
// ------------------------------
const PORT = process.env.PORT || 8082;
server.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
});

// ------------------------------
// Graceful shutdown (best-effort)
// ------------------------------
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`\n${signal} received. Shutting down...`);
  try {
    server.close(() => {});
  } catch (err) {
    // ignore
  }
  await disconnectPrisma();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
