/**
 * stats.js
 *
 * Base ship stats and per-ship progression helpers.
 */

export const CLASS_STATS = {
  starter: {
    key: 'starter',
    name: 'Starter',
    spriteKey: 'ship_starter',
    maxHp: 110,
    speed: 210,
    accel: 190,
    unlockCost: 0,
    unlockedByDefault: true
  },

  hunter: {
    key: 'hunter',
    name: 'Hunter',
    spriteKey: 'ship_hunter',
    maxHp: 90,
    speed: 260,
    accel: 220,
    unlockCost: 25,
    unlockedByDefault: false
  },

  tanker: {
    key: 'tanker',
    name: 'Tanker',
    spriteKey: 'ship_tanker',
    maxHp: 160,
    speed: 180,
    accel: 160,
    unlockCost: 25,
    unlockedByDefault: false
  }
};

/**
 * Create default progress for one ship.
 *
 * @returns {Object}
 */
export function createDefaultShipProgress() {
  return {
    level: 1,
    xp: 0,
    maxXp: 100,
    unspentStatPoints: 0,
    upgrades: {
      maxHp: 0,
      speed: 0,
      accel: 0
    }
  };
}

/**
 * Default player progress.
 */
export const PLAYER_PROGRESS_DEFAULTS = {
  points: 0,
  unlockedShips: ['starter'],
  selectedShip: 'starter',
  shipProgress: {
    starter: createDefaultShipProgress(),
    hunter: createDefaultShipProgress(),
    tanker: createDefaultShipProgress()
  }
};

/**
 * Get XP required for a level.
 *
 * @param {number} level
 * @returns {number}
 */
export function getXpRequiredForLevel(level) {
  return 100 + ((Math.max(1, level) - 1) * 50);
}

/**
 * Clone progress safely.
 *
 * @param {Object} progress
 * @returns {Object}
 */
export function cloneProgress(progress = PLAYER_PROGRESS_DEFAULTS) {
  return {
    points: progress.points ?? 0,
    unlockedShips: Array.isArray(progress.unlockedShips)
      ? [...progress.unlockedShips]
      : ['starter'],
    selectedShip: progress.selectedShip || 'starter',
    shipProgress: {
      starter: {
        level: progress.shipProgress?.starter?.level ?? 1,
        xp: progress.shipProgress?.starter?.xp ?? 0,
        maxXp: progress.shipProgress?.starter?.maxXp ?? 100,
        unspentStatPoints: progress.shipProgress?.starter?.unspentStatPoints ?? 0,
        upgrades: {
          maxHp: progress.shipProgress?.starter?.upgrades?.maxHp ?? 0,
          speed: progress.shipProgress?.starter?.upgrades?.speed ?? 0,
          accel: progress.shipProgress?.starter?.upgrades?.accel ?? 0
        }
      },
      hunter: {
        level: progress.shipProgress?.hunter?.level ?? 1,
        xp: progress.shipProgress?.hunter?.xp ?? 0,
        maxXp: progress.shipProgress?.hunter?.maxXp ?? 100,
        unspentStatPoints: progress.shipProgress?.hunter?.unspentStatPoints ?? 0,
        upgrades: {
          maxHp: progress.shipProgress?.hunter?.upgrades?.maxHp ?? 0,
          speed: progress.shipProgress?.hunter?.upgrades?.speed ?? 0,
          accel: progress.shipProgress?.hunter?.upgrades?.accel ?? 0
        }
      },
      tanker: {
        level: progress.shipProgress?.tanker?.level ?? 1,
        xp: progress.shipProgress?.tanker?.xp ?? 0,
        maxXp: progress.shipProgress?.tanker?.maxXp ?? 100,
        unspentStatPoints: progress.shipProgress?.tanker?.unspentStatPoints ?? 0,
        upgrades: {
          maxHp: progress.shipProgress?.tanker?.upgrades?.maxHp ?? 0,
          speed: progress.shipProgress?.tanker?.upgrades?.speed ?? 0,
          accel: progress.shipProgress?.tanker?.upgrades?.accel ?? 0
        }
      }
    }
  };
}

/**
 * Get progress for one ship.
 *
 * @param {Object} progress
 * @param {string} shipKey
 * @returns {Object}
 */
export function getSelectedShipProgress(progress, shipKey) {
  return cloneProgress(progress).shipProgress[shipKey] || createDefaultShipProgress();
}

/**
 * Get stats for a ship with upgrades applied.
 *
 * @param {string} shipKey
 * @param {Object} progress
 * @returns {Object|null}
 */
export function getShipStats(shipKey, progress = PLAYER_PROGRESS_DEFAULTS) {
  const base = CLASS_STATS[shipKey];
  if (!base) return null;

  const shipProg = getSelectedShipProgress(progress, shipKey);
  const upgrades = shipProg.upgrades || {};

  return {
    ...base,
    maxHp: base.maxHp + ((upgrades.maxHp || 0) * 10),
    speed: base.speed + ((upgrades.speed || 0) * 8),
    accel: base.accel + ((upgrades.accel || 0) * 8)
  };
}