// Authoritative server using arcade-physics instead of Phaser headless (less overhead)
// Uses arcade-physics package for proper physics simulation and Socket.IO for multiplayer

const { ArcadePhysics } = require('arcade-physics');
const UI = require('./ui');

const players = {};
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
  if (Object.keys(players).length === 0 && (gameState.scores.red !== 0 || gameState.scores.blue !== 0)) {
    gameState.scores.red = 0;
    gameState.scores.blue = 0;
    console.log('🔄 All players disconnected. Resetting scores to zero.');
    UI.emitScore(io, { ...gameState.scores });
  }
}

// Physics world
let physics = null;
const playerBodies = new Map(); // Map socket.id -> Body
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
  if (!activeSockets) {
    return;
  }

  const activeIds = new Set(activeSockets.keys());
  Object.keys(players).forEach((playerId) => {
    if (!activeIds.has(playerId)) {
      console.warn('🧹 Removing stale player without active socket:', playerId);

      // Clean up physics body
      const body = playerBodies.get(playerId);
      if (body) {
        body.destroy();
        playerBodies.delete(playerId);
      }

      delete players[playerId];
      io.emit('playerDisconnected', playerId);
    }
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

  // Create static bodies for stars
  gameState.stars.forEach((star, index) => {
    const starBody = physics.add.staticBody(star.x, star.y, 30, 30);
    starBody.starId = star.id;
    starBodies.push(starBody);
  });

  console.log('✅ Physics world initialized');

  // Handle client connections
  io.on('connection', (socket) => {
    removeStalePlayers(io);
    console.log('🎮 User connected:', socket.id.substring(0, 8));

    // Create player
    const startX = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
    const startY = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;

    players[socket.id] = {
      playerId: socket.id,
      playerName: null,  // Will be set when client sends setPlayerName
      x: startX,
      y: startY,
      rotation: 0,
      velocityX: 0,
      velocityY: 0,
      angularVelocity: 0,
      team: Math.random() < 0.5 ? 'red' : 'blue',
      input: { left: false, right: false, up: false, down: false },
      hp: 100,
      maxHp: 100,
      xp: 0,
      maxXp: 100
    };

    // Create physics body for player (53x40 matching client ship size)
    const playerBody = physics.add.body(startX, startY, 53, 40);
    playerBody.setDrag(0);
    playerBody.setMaxVelocity(400);
    playerBody.playerId = socket.id;
    playerBodies.set(socket.id, playerBody);

    // Set up collision detection between this player and all stars
    starBodies.forEach((starBody) => {
      physics.add.overlap(playerBody, starBody, (player, star) => {
        handleStarCollection(io, player, star);
      });
    });

    const activeSocketCount = io.sockets?.sockets?.size ?? 0;
    console.log('📊 Total active players:', Object.keys(players).length);
    console.log('🔌 Active sockets:', activeSocketCount);
    console.log('📋 Player IDs:', Object.keys(players));

    // Send current state to new player
    socket.emit('currentPlayers', players);
    console.log('📤 Sending star locations to new player:', gameState.stars);
    UI.emitStars(socket, gameState.stars);
    UI.emitScore(socket, gameState.scores);

    // Notify others
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle player name from client
    socket.on('setPlayerName', (playerName) => {
      if (players[socket.id] && playerName) {
        players[socket.id].playerName = playerName;
        console.log('👤 Player', socket.id.substring(0, 8), 'set name to:', playerName);
      }
    });

    // Handle input
    socket.on('playerInput', (input) => {
      if (players[socket.id]) {
        players[socket.id].input = input;

        // Debug log when input is received
        if (!socket.lastInputLog || Date.now() - socket.lastInputLog > 1000) {
          if (input.left || input.right || input.up || input.down) {
            console.log('📥 Received input from', players[socket.id]?.playerName || socket.id.substring(0, 8), ':', input);
            socket.lastInputLog = Date.now();
          }
        }
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      const playerName = players[socket.id]?.playerName || socket.id.substring(0, 8);
      console.log('👋 User disconnected:', playerName);

      // Clean up physics body
      const body = playerBodies.get(socket.id);
      if (body) {
        body.destroy();
        playerBodies.delete(socket.id);
      }

      // Clean up the player
      if (players[socket.id]) {
        delete players[socket.id];
        console.log('✅ Player removed from game state');
        console.log('📊 Active players remaining:', Object.keys(players).length);
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
  const player = players[playerBody.playerId];
  if (!player) return;

  const star = gameState.stars.find(s => s.id === starBody.starId);
  if (!star) return;

  const playerName = player.playerName || player.playerId;
  console.log('⭐⭐⭐ STAR', star.id, 'COLLECTED by', playerName, '! Team:', player.team);

  // score
  gameState.scores[player.team] += 10;

  // XP gain (clamped to max)
  player.xp = Math.min((player.xp || 0) + XP_PER_STAR, player.maxXp || 100);

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

  // Update each player using their physics body
  playerBodies.forEach((body, playerId) => {
    const player = players[playerId];
    if (!player) return;

    // Debug log every second for ALL players
    if (frameCount % 60 === 0) {
      const vel = Math.round(body.velocity.length());
      if (vel > 0 || player.input.up || player.input.down || player.input.left || player.input.right) {
        console.log('🎮 Frame', frameCount,
          '- Player', player.playerName || player.playerId.substring(0, 8),
          'at (', Math.round(body.x), Math.round(body.y), ')',
          'vel:', vel,
          'input:', JSON.stringify(player.input));
      }
    }

    const input = player.input;

    // Rotation using physics body's angular velocity
    // Convert degrees/sec to radians/sec: 300 deg/s * (π/180) ≈ 5.236 rad/s
    const angularSpeed = 300 * (Math.PI / 180);
    if (input.left) {
      body.setAngularVelocity(-angularSpeed);
    } else if (input.right) {
      body.setAngularVelocity(angularSpeed);
    } else {
      body.setAngularVelocity(0);
    }

    // Acceleration using physics body
    if (input.up) {
      // Use arcade-physics velocityFromRotation method
      const angle = body.rotation + 1.5;
      physics.velocityFromRotation(angle, 200, body.acceleration);
    } else if (input.down) {
      // Deceleration - apply braking force
      const currentVel = body.velocity.length();
      if (currentVel > 50) {
        // Normal deceleration for higher speeds
        const decelX = -body.velocity.x * 0.1;
        const decelY = -body.velocity.y * 0.1;
        body.setAcceleration(decelX * 10, decelY * 10);
      } else if (currentVel > 5) {
        // Aggressive deceleration when below 50 velocity
        const decelX = -body.velocity.x * 0.3;
        const decelY = -body.velocity.y * 0.3;
        body.setAcceleration(decelX * 10, decelY * 10);
      } else {
        // When nearly stopped, set velocity to zero
        body.setVelocity(0, 0);
        body.setAcceleration(0, 0);
      }
    } else {
      body.setAcceleration(0, 0);
    }

    // Bounds checking with buffer
    if (body.x < BORDER_BUFFER) {
      body.x = BORDER_BUFFER;
      body.setVelocityX(0);
    } else if (body.x > WORLD_WIDTH - BORDER_BUFFER) {
      body.x = WORLD_WIDTH - BORDER_BUFFER;
      body.setVelocityX(0);
    }

    if (body.y < BORDER_BUFFER) {
      body.y = BORDER_BUFFER;
      body.setVelocityY(0);
    } else if (body.y > WORLD_HEIGHT - BORDER_BUFFER) {
      body.y = WORLD_HEIGHT - BORDER_BUFFER;
      body.setVelocityY(0);
    }

    // Sync player state from physics body
    player.x = body.x;
    player.y = body.y;
    player.rotation = body.rotation;
    player.velocityX = body.velocity.x;
    player.velocityY = body.velocity.y;
    player.angularVelocity = body.angularVelocity;
  });

    // --- Fallback overlap detection (server-side, distance based) ---
  // This makes sure stars get collected even if the arcade-physics overlap isn't triggering.
  playerBodies.forEach((body) => {
    starBodies.forEach((starBody) => {
      const dx = body.x - starBody.x;
      const dy = body.y - starBody.y;
      const dist2 = dx*dx + dy*dy;
      const R = 32; // pickup radius ~ sprite size
      const canTriggerAgain = (starPickupCooldown.get(starBody.starId) ?? -99999) < (frameCount - 5);

      if (dist2 <= R*R && canTriggerAgain) {
        starPickupCooldown.set(starBody.starId, frameCount);
        handleStarCollection(io, body, starBody);
      }
    });
  });


  // Physics world handles collision detection automatically via overlap colliders
  physics.world.postUpdate(Date.now(), delta);

  // Broadcast player updates
  io.emit('playerUpdates', players);

  // Sends a UI snapshot ~ every 10sec
  if (frameCount % 6 === 0) {
    UI.emitUiState(io, players, gameState);
  }
}

module.exports = { initializeServer };
