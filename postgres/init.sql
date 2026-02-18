-- Initializes the Orbitfall player persistence schema on first DB startup.
-- This runs only when the Postgres data directory is empty.

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

-- Session table for connect-pg-simple (express-session store)
CREATE TABLE IF NOT EXISTS "session" (
  "sid" VARCHAR NOT NULL COLLATE "default",
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
