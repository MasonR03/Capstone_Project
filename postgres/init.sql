-- Initializes the Orbitfall player persistence schema on first DB startup.
-- This runs only when the Postgres data directory is empty.

CREATE TABLE IF NOT EXISTS "PlayerProfile" (
  "id" TEXT PRIMARY KEY,
  "username" TEXT NOT NULL UNIQUE,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "maxXp" INTEGER NOT NULL DEFAULT 100,
  "starsCollected" INTEGER NOT NULL DEFAULT 0,
  "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

