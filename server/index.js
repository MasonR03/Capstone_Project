const path = require('path');
const express = require('express');
const http = require('http');
const session = require('express-session');
const connectPgSimple = require('connect-pg-simple');
const { Server } = require('socket.io');
// Load environment variables from .env if present
try {
  require('dotenv').config();
} catch (err) {
  // dotenv not installed or failed to load; proceed using process.env
}

const { getPrismaClient, disconnectPrisma } = require('./persistence/prisma');
const authRoutes = require('./auth/routes');

// Import the authoritative server
const { initializeServer } = require('./authoritative_server/js/game');

const app = express();
const server = http.createServer(app);

// ------------------------------
// Session middleware
// ------------------------------
const PgStore = connectPgSimple(session);

const sessionMiddleware = session({
  store: new PgStore({
    conString: process.env.DATABASE_URL,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'orbitfall-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
  },
});

app.use(sessionMiddleware);
app.use(express.json());

// ------------------------------
// Socket.IO with session sharing
// ------------------------------
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Share express-session with Socket.IO
io.engine.use(sessionMiddleware);

// ------------------------------
// Auth API routes
// ------------------------------
app.use('/api', authRoutes);

// ------------------------------
// Client config endpoint
// ------------------------------
app.get('/api/config', (req, res) => {
  res.json({
    debug: process.env.DEBUG === 'true'
  });
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
// Optional DB connection check (Prisma)
// ------------------------------
void (async () => {
  const prisma = getPrismaClient();
  if (!prisma) return;

  try {
    await prisma.$connect();
    console.log('✅ Database connected (Prisma)');

    // Best-effort safety net: ensure the PlayerProfile table exists even if the
    // Postgres volume was created before postgres/init.sql was mounted.
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "PlayerProfile" (
          "id" TEXT PRIMARY KEY,
          "username" TEXT NOT NULL UNIQUE,
          "email" TEXT UNIQUE,
          "passwordHash" TEXT,
          "xp" INTEGER NOT NULL DEFAULT 0,
          "maxXp" INTEGER NOT NULL DEFAULT 100,
          "starsCollected" INTEGER NOT NULL DEFAULT 0,
          "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
          "lastSeenAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log('✅ PlayerProfile table ready');
    } catch (schemaErr) {
      console.warn(
        '⚠️ Failed to ensure PlayerProfile table exists. Player persistence may not work as expected.'
      );
      console.warn(schemaErr);
    }
    

    // Ensure session table exists
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "session" (
          "sid" VARCHAR NOT NULL COLLATE "default",
          "sess" JSON NOT NULL,
          "expire" TIMESTAMP(6) NOT NULL,
          CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
      `);
      console.log('✅ Session table ready');
    } catch (sessionErr) {
      console.warn('⚠️ Failed to ensure session table exists.');
      console.warn(sessionErr);
    }
  } catch (err) {
    console.warn('⚠️ Database connection failed. Player persistence will be disabled until DB is reachable.');
    console.warn(err);
  }
})();

// ------------------------------
// Start the server
// Read port from environment (or .env). Falls back to 8082.
// ------------------------------
const PORT = process.env.PORT || 8082;
let gameServerInitialized = false;

function startAuthoritativeGameServer() {
  if (gameServerInitialized) return;
  initializeServer(io);
  gameServerInitialized = true;
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the running server or start with a different port, e.g. PowerShell: $env:PORT=8086; npm run server`
    );
    process.exit(1);
  }

  console.error('Failed to start game server.');
  console.error(err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Game server running at http://localhost:${PORT}`);
  startAuthoritativeGameServer();
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
