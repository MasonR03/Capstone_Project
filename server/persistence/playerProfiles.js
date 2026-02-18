const { getPrismaClient } = require('./prisma');

const USERNAME_MAX_LEN = 20;

function logPersistenceError(context, username, err) {
  const code =
    err && typeof err === 'object' && 'code' in err && typeof err.code === 'string' ? err.code : null;
  const message =
    err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : String(err);

  const suffix = code ? ` (code ${code})` : '';
  console.warn(`[persistence] ${context} for username "${username}"${suffix}: ${message}`);
}

function normalizeUsername(input) {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed.length > USERNAME_MAX_LEN) return trimmed.slice(0, USERNAME_MAX_LEN);
  return trimmed;
}

async function getOrCreateProfile(username) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const now = new Date();

  try {
    const profile = await prisma.playerProfile.upsert({
      where: { username },
      update: {
        gamesPlayed: { increment: 1 },
        lastSeenAt: now
      },
      create: {
        username,
        gamesPlayed: 1,
        lastSeenAt: now
      }
    });
    return profile;
  } catch (err) {
    logPersistenceError('Failed to upsert PlayerProfile', username, err);
    return null;
  }
}

async function updateProfile(username, data) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const now = new Date();

  try {
    return await prisma.playerProfile.update({
      where: { username },
      data: {
        ...data,
        lastSeenAt: now
      }
    });
  } catch (err) {
    // If the profile doesn't exist (or another error), avoid crashing the game server.
    // Try a best-effort create for first-time users.
    try {
      return await prisma.playerProfile.create({
        data: {
          username,
          ...(Number.isFinite(data?.xp) ? { xp: Math.max(0, Math.floor(data.xp)) } : null),
          ...(Number.isFinite(data?.maxXp) ? { maxXp: Math.max(1, Math.floor(data.maxXp)) } : null),
          lastSeenAt: now,
          gamesPlayed: 1
        }
      });
    } catch (createErr) {
      logPersistenceError('Failed to update PlayerProfile', username, createErr);
      return null;
    }
  }
}

async function recordStarCollected(username, { xp, maxXp } = {}) {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const now = new Date();
  const safeXp = Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : undefined;
  const safeMaxXp = Number.isFinite(maxXp) ? Math.max(1, Math.floor(maxXp)) : undefined;

  try {
    return await prisma.playerProfile.update({
      where: { username },
      data: {
        starsCollected: { increment: 1 },
        ...(safeXp !== undefined ? { xp: safeXp } : null),
        ...(safeMaxXp !== undefined ? { maxXp: safeMaxXp } : null),
        lastSeenAt: now
      }
    });
  } catch (err) {
    // If the profile doesn't exist yet, create it (best-effort).
    try {
      return await prisma.playerProfile.create({
        data: {
          username,
          xp: safeXp ?? 0,
          maxXp: safeMaxXp ?? 100,
          starsCollected: 1,
          gamesPlayed: 1,
          lastSeenAt: now
        }
      });
    } catch (createErr) {
      logPersistenceError('Failed to record star', username, createErr);
      return null;
    }
  }
}

module.exports = {
  normalizeUsername,
  getOrCreateProfile,
  updateProfile,
  recordStarCollected,
  USERNAME_MAX_LEN
};
