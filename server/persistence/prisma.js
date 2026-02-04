let prismaSingleton = null;
let prismaInitError = null;

function getPrismaClient() {
  if (prismaSingleton) return prismaSingleton;
  if (prismaInitError) return null;

  if (!process.env.DATABASE_URL) {
    return null;
  }

  let PrismaClient = null;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch (err) {
    prismaInitError = err;
    console.warn('[persistence] @prisma/client not installed; DB persistence disabled.');
    return null;
  }

  try {
    prismaSingleton = new PrismaClient();
  } catch (err) {
    prismaInitError = err;
    console.warn('[persistence] Failed to initialize PrismaClient; DB persistence disabled.');
    return null;
  }

  return prismaSingleton;
}

async function disconnectPrisma() {
  if (!prismaSingleton) return;
  try {
    await prismaSingleton.$disconnect();
  } catch (err) {
    // Best-effort only.
  } finally {
    prismaSingleton = null;
  }
}

module.exports = { getPrismaClient, disconnectPrisma };

