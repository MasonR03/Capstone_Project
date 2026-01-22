// Authoritative server using arcade-physics instead of Phaser headless (less overhead)
// Uses arcade-physics package for proper physics simulation and Socket.IO for multiplayer

const { ArcadePhysics } = require('arcade-physics');
const UI = require('./ui');
const EntityManager = require('./managers/EntityManager');

// EntityManager instance (initialized in initializeServer)
let entityManager = null;

// Global constants (can be accessed via EntityManager .worldConfig)
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const BORDER_BUFFER = 20;
const XP_PER_STAR = 10;

// Cooldown so a star can't trigger multiple times in the same instant
const starPickupCooldown = new Map(); // starId -> lastTriggerFrame

// Game state
const gameState = {
  scores: { red: 0, blue: 0 },
  stars: []
};

function resetScoresIfNoPlayers(io) {
  if (entityManager && entityManager.getCount() === 0 && (gameState.scores.red !== 0 || gameState.scores.blue !== 0)) {
    gameState.scores.red = 0;
    gameState.scores.blue = 0;
    console.log('🔄 All players disconnected. Resetting scores to zero.');
    UI.emitScore(io, { ...gameState.scores });
  }
}

// Physics world
let physics = null;
const starBodies = [];

// Initialize 5 stars at random positions
for (let i = 0; i < 5; i++) {
  gameState.stars.push({
    id: i,
    x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
    y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50
  });
}

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

  resetScoresIfNoPlayers(io);
}

function initializeServer(io) {
  console.log('✅ Initializing authoritative server with arcade-physics...');
  console.log('⭐ Initial star positions:', gameState.stars);

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

  // Create static bodies for stars
  gameState.stars.forEach((star) => {
    const starBody = physics.add.staticBody(star.x, star.y, 30, 30);
    starBody.starId = star.id;
    starBodies.push(starBody);
  });

  console.log('✅ Physics world initialized');

  // Handle client connections
  io.on('connection', (socket) => {
    removeStalePlayers(io);
    console.log('🎮 User connected:', socket.id.substring(0, 8));

    // Create player ship using EntityManager
    const startX = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
    const startY = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;

    const ship = entityManager.createShip(socket.id, startX, startY, {
      team: Math.random() < 0.5 ? 'red' : 'blue'
    });

    // Set up collision detection between this player and all stars
    entityManager.setupStarCollisions(socket.id, starBodies, (player, star) => {
      handleStarCollection(io, player, star);
    });

    const activeSocketCount = io.sockets?.sockets?.size ?? 0;
    console.log('📊 Total active players:', entityManager.getCount());
    console.log('🔌 Active sockets:', activeSocketCount);
    console.log('📋 Player IDs:', entityManager.getAllIds());

    // Send current state to new player
    socket.emit('currentPlayers', entityManager.serializeAll());
    console.log('📤 Sending star locations to new player:', gameState.stars);
    UI.emitStars(socket, gameState.stars);
    UI.emitScore(socket, gameState.scores);

    // Notify others
    socket.broadcast.emit('newPlayer', ship.serialize());

    // Handle ping for latency measurement
    socket.on('ping', (callback) => {
      if (typeof callback === 'function') {
        callback();
      }
    });

    // Handle player name from client
    socket.on('setPlayerName', (playerName) => {
      const ship = entityManager.getShip(socket.id);
      if (ship && playerName) {
        ship.setPlayerName(playerName);
        console.log('👤 Player', socket.id.substring(0, 8), 'set name to:', playerName);
      }
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

    // Handle disconnect
    socket.on('disconnect', () => {
      const ship = entityManager.getShip(socket.id);
      const playerName = ship ? ship.getDisplayName() : socket.id.substring(0, 8);
      console.log('👋 User disconnected:', playerName);

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

  // Game loop (60 FPS)
  let frameCount = 0;
  let lastTime = Date.now();

  setInterval(() => {
    const currentTime = Date.now();
    const delta = currentTime - lastTime;
    lastTime = currentTime;

    updateGame(io, frameCount, delta);
    frameCount++;
  }, 1000 / 60);

  console.log('Server ready!');
}

function handleStarCollection(io, playerBody, starBody) {
  // Get ship from EntityManager using the body's shipId
  const ship = entityManager.getShip(playerBody.shipId);
  if (!ship) return;

  const star = gameState.stars.find(s => s.id === starBody.starId);
  if (!star) return;

  const playerName = ship.getDisplayName();
  console.log('⭐⭐⭐ STAR', star.id, 'COLLECTED by', playerName, '! Team:', ship.team);

  // score
  gameState.scores[ship.team] += 10;

  // XP gain (uses Ship's gainXP method)
  ship.gainXP(XP_PER_STAR);

  // move star
  const oldPos = { x: star.x, y: star.y };
  star.x = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
  star.y = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;

  // update star physics body
  starBody.x = star.x;
  starBody.y = star.y;
  starBody.updateCenter();

  console.log('⭐ Star', star.id, 'moved from', oldPos, 'to', { x: star.x, y: star.y });

  // broadcast UI updates
  UI.emitScore(io, { ...gameState.scores });
  UI.emitStars(io, gameState.stars);
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

  // --- Fallback overlap detection (server-side, distance based) ---
  // This makes sure stars get collected even if the arcade-physics overlap isn't triggering.
  entityManager.forEach((ship) => {
    if (!ship.body) return;
    starBodies.forEach((starBody) => {
      const dx = ship.body.x - starBody.x;
      const dy = ship.body.y - starBody.y;
      const dist2 = dx*dx + dy*dy;
      const R = 32; // pickup radius ~ sprite size
      const canTriggerAgain = (starPickupCooldown.get(starBody.starId) ?? -99999) < (frameCount - 5);

      if (dist2 <= R*R && canTriggerAgain) {
        starPickupCooldown.set(starBody.starId, frameCount);
        handleStarCollection(io, ship.body, starBody);
      }
    });
  });

  // Physics world handles collision detection automatically via overlap colliders
  physics.world.postUpdate(Date.now(), delta);

  // Broadcast player updates with timestamp for client interpolation
  io.emit('playerUpdates', { players: entityManager.serializeAll(), timestamp: Date.now() });

  // Sends a UI snapshot ~ every 10sec
  if (frameCount % 6 === 0) {
    UI.emitUiState(io, entityManager.serializeAll(), gameState);
  }
}

module.exports = { initializeServer };
