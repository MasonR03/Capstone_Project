// Authoritative server using arcade-physics instead of Phaser headless (less overhead)
// Uses arcade-physics package for proper physics simulation and Socket.IO for multiplayer

const { ArcadePhysics } = require('arcade-physics');
const UI = require('./ui');
const EntityManager = require('./managers/EntityManager');
const BulletManager = require('./managers/BulletManager');
const ShootingStarManager = require('./managers/ShootingStarManager');
const {
  normalizeUsername,
  getOrCreateProfile,
  updateProfile
} = require('../../persistence/playerProfiles');

// EntityManager and BulletManager instances (initialized in initializeServer)
let entityManager = null;
let bulletManager = null;

// Global constants (can be accessed via EntityManager .worldConfig)
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const BORDER_BUFFER = 20;

/**
 * Ship class definitions.
 */
const SHIP_CLASSES = {
  starter: { maxHp: 110, speed: 210, accel: 190 },
  hunter: { maxHp: 90, speed: 260, accel: 220 },
  tanker: { maxHp: 160, speed: 180, accel: 160 }
};

const DEFAULT_CLASS = 'starter';

/**
 * Resolve final ship stats from class and progress.
 *
 * @param {string} classKey
 * @param {Object} progress
 * @returns {{maxHp:number,speed:number,accel:number}}
 */
function getResolvedShipStats(classKey, progress = {}) {
  const safeKey = SHIP_CLASSES[classKey] ? classKey : DEFAULT_CLASS;
  const base = SHIP_CLASSES[safeKey];

  const shipProgress = progress?.shipProgress?.[safeKey] || {
    upgrades: {
      maxHp: 0,
      speed: 0,
      accel: 0
    }
  };

  const upgrades = shipProgress.upgrades || {};

  return {
    maxHp: base.maxHp + ((upgrades.maxHp || 0) * 10),
    speed: base.speed + ((upgrades.speed || 0) * 8),
    accel: base.accel + ((upgrades.accel || 0) * 8)
  };
}

function clampHpToMax(hp, maxHp) {
  const safeMaxHp = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0;
  const safeHp = Number.isFinite(hp) ? hp : safeMaxHp;

  return Math.max(0, Math.min(safeHp, safeMaxHp));
}

// Weapon config (server-side)
const WEAPON_CONFIG = {
  bulletSpeed: 500,
  bulletLifetime: 2000,
  fireRate: 250,
  bulletDamage: 15
};

const BOOST_CONFIG = {
  cooldownMs: 3000,
  impulse: 360,
  durationMs: 450,
  maxSpeedMultiplier: 1.65
};

// Respawn delay in ms
const RESPAWN_DELAY = 3000;

// Game state
const gameState = {};

// Physics world
let physics = null;

function removeStalePlayers(io) {
  const activeSockets = io?.sockets?.sockets;
  if (!activeSockets || !entityManager) {
    return;
  }

  const activeIds = new Set(activeSockets.keys());
  const staleIds = entityManager.removeStaleShips(activeIds);

  staleIds.forEach((playerId) => {
    console.warn('🧹 Removing stale player without active socket:', playerId);
    io.emit('playerDisconnected', playerId);
  });
}

function initializeServer(io) {
  console.log('✅ Initializing authoritative server with arcade-physics...');

  // Initialize arcade-physics
  physics = new ArcadePhysics({
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    gravity: { x: 0, y: 0 } // Top-down, zero gravity
  });

  // Initialize EntityManager
  entityManager = new EntityManager(physics, {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    borderBuffer: BORDER_BUFFER
  });

  // Initialize BulletManager
  bulletManager = new BulletManager(
    { width: WORLD_WIDTH, height: WORLD_HEIGHT },
    WEAPON_CONFIG
  );

  console.log('✅ Physics world initialized');

  // Reject sockets without a valid session
  io.use((socket, next) => {
    const session = socket.request.session;
    if (session && session.username) {
      next();
    } else {
      next(new Error('Authentication required'));
    }
  });

  // Handle client connections
  io.on('connection', (socket) => {
    removeStalePlayers(io);

    const username = normalizeUsername(socket.request.session.username);
    console.log('🎮 User connected:', socket.id.substring(0, 8), '(' + username + ')');

    socket.data.username = username;
    socket.data.profileLoaded = false;
    socket.data.profileLoadPromise = null;

    // Create player ship using EntityManager
    const startX = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
    const startY = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;

        const initialProgress = {
      points: 0,
      unlockedShips: ['starter'],
      selectedShip: 'starter',
      shipProgress: {
        starter: {
          level: 1,
          xp: 0,
          maxXp: 100,
          unspentStatPoints: 0,
          upgrades: {
            maxHp: 0,
            speed: 0,
            accel: 0
          }
        },
        hunter: {
          level: 1,
          xp: 0,
          maxXp: 100,
          unspentStatPoints: 0,
          upgrades: {
            maxHp: 0,
            speed: 0,
            accel: 0
          }
        },
        tanker: {
          level: 1,
          xp: 0,
          maxXp: 100,
          unspentStatPoints: 0,
          upgrades: {
            maxHp: 0,
            speed: 0,
            accel: 0
          }
        }
      }
    };

    const classConfig = getResolvedShipStats(DEFAULT_CLASS, initialProgress);

    const ship = entityManager.createShip(socket.id, startX, startY, {
      team: 'neutral',
      classKey: DEFAULT_CLASS,
      maxSpeed: classConfig.speed,
      acceleration: classConfig.accel,
      maxHp: classConfig.maxHp,
      hp: classConfig.maxHp,
      boostCooldownMs: BOOST_CONFIG.cooldownMs,
      boostImpulse: BOOST_CONFIG.impulse,
      boostDurationMs: BOOST_CONFIG.durationMs,
      boostMaxSpeedMultiplier: BOOST_CONFIG.maxSpeedMultiplier
    });

    socket.data.playerProgress = initialProgress;

    // Set player name from session (already authenticated)
    ship.setPlayerName(username);

    const activeSocketCount = io.sockets?.sockets?.size ?? 0;
    console.log('📊 Total active players:', entityManager.getCount());
    console.log('🔌 Active sockets:', activeSocketCount);
    console.log('📋 Player IDs:', entityManager.getAllIds());

    // Send current state to new player
    socket.emit('currentPlayers', entityManager.serializeAll());

    // Notify others
    socket.broadcast.emit('newPlayer', ship.serialize());

    // Handle ping for latency measurement
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    // Auto-load profile on connection (replaces old setPlayerName-triggered load)
    if (username) {
      socket.data.profileLoadPromise = getOrCreateProfile(username)
        .then((profile) => {
          socket.data.profileLoaded = true;
          if (!profile) return;

          const currentShip = entityManager.getShip(socket.id);
          if (!currentShip) return;

          const safeMaxXp = Number.isFinite(profile.maxXp) ? Math.max(1, Math.floor(profile.maxXp)) : currentShip.maxXp;
          const safeXp = Number.isFinite(profile.xp)
            ? Math.max(0, Math.min(safeMaxXp, Math.floor(profile.xp)))
            : currentShip.xp;

          currentShip.maxXp = safeMaxXp;
          currentShip.xp = safeXp;

          socket.emit('profileLoaded', {
            username: profile.username,
            xp: currentShip.xp,
            maxXp: currentShip.maxXp,
            starsCollected: profile.starsCollected,
            gamesPlayed: profile.gamesPlayed
          });
        })
        .catch((err) => {
          console.warn('⚠️ Failed to load profile for', username, err);
          socket.data.profileLoaded = true;
        });
    }

     /**
     * Handle class selection and progress sync from client.
     */
    socket.on('chooseClass', (payload) => {
      const ship = entityManager.getShip(socket.id);
      if (!ship) return;

      const requestedKey = typeof payload === 'string' ? payload : payload?.classKey;
      const safeKey = SHIP_CLASSES[requestedKey] ? requestedKey : DEFAULT_CLASS;

      const progress = payload?.progress || socket.data.playerProgress || {
        starterUpgrades: {
          maxHp: 0,
          speed: 0,
          accel: 0
        }
      };

      socket.data.playerProgress = progress;

      const cfg = getResolvedShipStats(safeKey, progress);

      ship.classKey = safeKey;
      ship.stats.maxSpeed = cfg.speed;
      ship.stats.acceleration = cfg.accel;
      ship.maxHp = cfg.maxHp;

      // Progress/class sync must not heal damage; only keep HP legal if maxHp changes.
      ship.hp = clampHpToMax(ship.hp, ship.maxHp);

      if (ship.body) {
        ship.syncBoostVelocityCap();
      }

      console.log(
        '🚀 Player',
        ship.getDisplayName(),
        'synced class:',
        safeKey,
        'stats:',
        cfg
      );
    });


    // Handle input
    socket.on('playerInput', (input) => {
      const ship = entityManager.getShip(socket.id);
      if (ship) {
        ship.handleInput(input);

        // Debug log when input is received
        if (!socket.lastInputLog || Date.now() - socket.lastInputLog > 1000) {
          if (input.left || input.right || input.up || input.down) {
            console.log('📥 Received input from', ship.getDisplayName(), ':', input);
            socket.lastInputLog = Date.now();
          }
        }
      }
    });

    // Handle shooting
    socket.on('playerShoot', () => {
      const ship = entityManager.getShip(socket.id);
      if (!ship || ship.hp <= 0) return;

      const bullet = bulletManager.tryFire(socket.id, ship.x, ship.y, ship.rotation);
      if (bullet) {
        io.emit('bulletFired', bullet.serialize());
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const ship = entityManager.getShip(socket.id);
      const playerName = ship ? ship.getDisplayName() : socket.id.substring(0, 8);
      console.log('👋 User disconnected:', playerName);

      const username = socket.data.username || (ship && ship.playerName) || null;
      if (username && ship) {
        void updateProfile(username, {
          xp: Number.isFinite(ship.xp) ? Math.max(0, Math.floor(ship.xp)) : 0,
          maxXp: Number.isFinite(ship.maxXp) ? Math.max(1, Math.floor(ship.maxXp)) : 100
        });
      }

      // Clean up bullets belonging to this player
      bulletManager.removeByOwner(socket.id);

      // Clean up the player (EntityManager handles physics body cleanup)
      if (entityManager.removeShip(socket.id)) {
        console.log('✅ Player removed from game state');
        console.log('📊 Active players remaining:', entityManager.getCount());
      }

      // Notify all clients
      io.emit('playerDisconnected', socket.id);

      // Sweep any lingering players whose sockets are gone
      removeStalePlayers(io);

    });
  });

  // Shooting star manager
  const shootingStarManager = new ShootingStarManager(io, {
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT
  });

  // Game loop (60 FPS)
  let frameCount = 0;
  let lastTime = Date.now();

  setInterval(() => {
    const currentTime = Date.now();
    const delta = currentTime - lastTime;
    lastTime = currentTime;

    shootingStarManager.update(delta);
    updateGame(io, frameCount, delta);
    frameCount++;
  }, 1000 / 60);

  console.log('Server ready!');
}


/**
 * Mark a ship as killed and schedule its respawn.
 *
 * @param {import('socket.io').Server} io
 * @param {string} victimId
 * @param {string|null} killerId
 */
function handleShipKilled(io, victimId, killerId) {
  const deadShip = entityManager.getShip(victimId);
  if (!deadShip) return;

  console.log('💀 Ship destroyed:', victimId, 'by', killerId || '(environment)');
  io.emit('playerKilled', { victimId, killerId });

  setTimeout(() => {
    const ship = entityManager.getShip(victimId);
    if (!ship) return;

    ship.hp = ship.maxHp;
    const newX = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
    const newY = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;
    ship.x = newX;
    ship.y = newY;
    if (ship.body) {
      ship.body.x = newX;
      ship.body.y = newY;
      ship.body.setVelocity(0, 0);
    }
    ship.lastCollisionDamageAt = 0;
    ship._atBarrier = false;
    ship.barrierHitThisFrame = false;
    ship.lastBoostAt = 0;
    ship.boostActiveUntil = 0;
    ship.boostQueued = false;

    io.emit('playerRespawned', {
      playerId: victimId,
      x: newX,
      y: newY,
      hp: ship.hp,
      maxHp: ship.maxHp
    });

    console.log('🔄 Ship respawned:', victimId);
  }, RESPAWN_DELAY);
}

function updateGame(io, frameCount, delta) {
  if (frameCount % 60 === 0) {
    removeStalePlayers(io);
  }

  // Update physics world
  physics.world.update(Date.now(), delta);

  // Debug log every second for ALL players
  if (frameCount % 60 === 0) {
    entityManager.forEach((ship) => {
      if (!ship.body) return;
      const vel = Math.round(ship.body.velocity.length());
      if (vel > 0 || ship.input.up || ship.input.down || ship.input.left || ship.input.right) {
        console.log('🎮 Frame', frameCount,
          '- Player', ship.getDisplayName(),
          'at (', Math.round(ship.body.x), Math.round(ship.body.y), ')',
          'vel:', vel,
          'input:', JSON.stringify(ship.input));
      }
    });
  }

  // Update all ships (apply movement and sync from physics)
  entityManager.updateAll();

  // Update bullets and check collisions
  const bulletResult = bulletManager.update(delta, entityManager.ships);

  // Handle bullet hits
  bulletResult.destroyed.forEach((hit) => {
    io.emit('bulletHit', {
      bulletId: hit.bulletId,
      ownerId: hit.ownerId,
      shipId: hit.shipId,
      damage: hit.damage,
      killed: hit.killed
    });

    if (hit.killed) {
      handleShipKilled(io, hit.shipId, hit.ownerId);
    }
  });

  // Handle ship-vs-ship and ship-vs-barrier collisions
  const collisionEvents = entityManager.processCollisions(Date.now());
  collisionEvents.forEach((evt) => {
    if (evt.killed) {
      const killerId = evt.source === 'ship' ? evt.otherId : null;
      handleShipKilled(io, evt.shipId, killerId);
    }
  });

  // Broadcast bullet removals
  if (bulletResult.removed.length > 0) {
    io.emit('bulletsRemoved', bulletResult.removed);
  }

  // Physics world handles collision detection automatically via overlap colliders
  physics.world.postUpdate(Date.now(), delta);

  // Broadcast player updates with timestamp for client interpolation
  io.emit('playerUpdates', { players: entityManager.serializeAll(), timestamp: Date.now() });

  // Broadcast bullet positions every 3 frames (~20 Hz) to save bandwidth
  if (frameCount % 3 === 0 && bulletManager.getCount() > 0) {
    io.emit('bulletUpdates', bulletManager.serializeAll());
  }

  // Sends a UI snapshot ~ every 10sec
  if (frameCount % 6 === 0) {
    UI.emitUiState(io, entityManager.serializeAll(), gameState);
  }
}

module.exports = { initializeServer };
