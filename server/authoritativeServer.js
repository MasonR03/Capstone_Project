// Simple authoritative server without Phaser
// Uses basic physics and Socket.IO for multiplayer

const players = {};
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const BORDER_BUFFER = 20;

// Game state
const gameState = {
  scores: { red: 0, blue: 0 },
  stars: []
};

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
      delete players[playerId];
      io.emit('playerDisconnected', playerId);
    }
  });
}

function initializeServer(io) {
  console.log('✅ Initializing authoritative server...');
  console.log('⭐ Initial star positions:', gameState.stars);

  // Handle client connections
  io.on('connection', (socket) => {
    removeStalePlayers(io);
    console.log('🎮 User connected:', socket.id);

    // Create player
    players[socket.id] = {
      playerId: socket.id,
      x: Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50,
      y: Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50,
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

    const activeSocketCount = io.sockets?.sockets?.size ?? 0;
    console.log('📊 Total active players:', Object.keys(players).length);
    console.log('🔌 Active sockets:', activeSocketCount);
    console.log('📋 Player IDs:', Object.keys(players));

    // Send current state to new player
    socket.emit('currentPlayers', players);
    console.log('📤 Sending star locations to new player:', gameState.stars);
    socket.emit('starsLocation', gameState.stars);
    socket.emit('updateScore', gameState.scores);

    // Notify others
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // Handle input
    socket.on('playerInput', (input) => {
      if (players[socket.id]) {
        players[socket.id].input = input;

        // Debug log when input is received
        if (!socket.lastInputLog || Date.now() - socket.lastInputLog > 1000) {
          if (input.left || input.right || input.up || input.down) {
            console.log('📥 Received input from', socket.id.substring(0, 8), ':', input);
            socket.lastInputLog = Date.now();
          }
        }
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log('👋 User disconnected:', socket.id);

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
  setInterval(() => {
    updateGame(io, frameCount);
    frameCount++;
  }, 1000 / 60);

  console.log('✅ Authoritative server ready!');
}

function updateGame(io, frameCount) {
  if (frameCount % 60 === 0) {
    removeStalePlayers(io);
  }

  // Update each player
  Object.values(players).forEach((player, index) => {
    // Debug log every second for ALL players
    if (frameCount % 60 === 0) {
      const vel = Math.round(Math.sqrt(player.velocityX ** 2 + player.velocityY ** 2));
      if (vel > 0 || player.input.up || player.input.down || player.input.left || player.input.right) {
        console.log('🎮 Frame', frameCount,
          '- Player', player.playerId.substring(0, 8),
          'at (', Math.round(player.x), Math.round(player.y), ')',
          'vel:', vel,
          'input:', JSON.stringify(player.input));
      }
    }

    const input = player.input;

    // Rotation (300 degrees/sec = 5 degrees per frame at 60fps)
    if (input.left) {
      player.angularVelocity = -300; // degrees per second
    } else if (input.right) {
      player.angularVelocity = 300; // degrees per second
    } else {
      player.angularVelocity = 0;
    }
    // Convert to radians per frame: (degrees/sec) * (1/60 sec/frame) * (π/180 rad/degree)
    player.rotation += (player.angularVelocity / 60) * (Math.PI / 180);

    // Acceleration (matching client's velocityFromRotation with acceleration 200)
    if (input.up) {
      // Client uses rotation + 1.5 radians, acceleration 200 pixels/sec²
      // Apply acceleration to velocity (velocity is in pixels/sec)
      const accelMagnitude = 200; // pixels per second squared
      const dt = 1/60; // time step
      const angle = player.rotation + 1.5;
      player.velocityX += Math.cos(angle) * accelMagnitude * dt;
      player.velocityY += Math.sin(angle) * accelMagnitude * dt;
    } else if (input.down) {
      // Deceleration - apply braking force proportional to velocity
      const currentVel = Math.sqrt(player.velocityX ** 2 + player.velocityY ** 2);
      if (currentVel > 5) {
        // Apply deceleration proportional to current velocity (like drag)
        const decelFactor = 0.05; // Deceleration factor per frame
        player.velocityX *= (1 - decelFactor);
        player.velocityY *= (1 - decelFactor);
      } else {
        // Stop completely when very slow
        player.velocityX = 0;
        player.velocityY = 0;
      }
    }

    // No drag - ships coast in space (matching client setDrag(0))
    // Only decelerate when down key is explicitly pressed

    // Max speed (matching client's setMaxVelocity(400))
    const maxSpeed = 400;
    const speed = Math.sqrt(player.velocityX ** 2 + player.velocityY ** 2);
    if (speed > maxSpeed) {
      player.velocityX = (player.velocityX / speed) * maxSpeed;
      player.velocityY = (player.velocityY / speed) * maxSpeed;
    }

    // Update position (velocities are in pixels/second, convert to pixels/frame)
    player.x += player.velocityX / 60;
    player.y += player.velocityY / 60;

    // Bounds checking
    if (player.x < BORDER_BUFFER) {
      player.x = BORDER_BUFFER;
      player.velocityX = 0;
    }
    if (player.x > WORLD_WIDTH - BORDER_BUFFER) {
      player.x = WORLD_WIDTH - BORDER_BUFFER;
      player.velocityX = 0;
    }
    if (player.y < BORDER_BUFFER) {
      player.y = BORDER_BUFFER;
      player.velocityY = 0;
    }
    if (player.y > WORLD_HEIGHT - BORDER_BUFFER) {
      player.y = WORLD_HEIGHT - BORDER_BUFFER;
      player.velocityY = 0;
    }

    // Check collision with all stars
    gameState.stars.forEach((star, starIndex) => {
      const dx = player.x - star.x;
      const dy = player.y - star.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Debug: Log when player is close to any star
      if (distance < 100 && frameCount % 30 === 0) {
        console.log('🎯 Player', player.playerId.substring(0, 8),
                    'near star', star.id, '! Distance:', Math.round(distance),
                    'Player:', Math.round(player.x), Math.round(player.y),
                    'Star:', star.x, star.y);
      }

      if (distance < 30) {
        // Player collected a star
        console.log('⭐⭐⭐ STAR', star.id, 'COLLECTED by', player.playerId, '! Team:', player.team);
        gameState.scores[player.team] += 10;

        // Move this star to a new random position
        const oldPos = { x: star.x, y: star.y };
        star.x = Math.floor(Math.random() * (WORLD_WIDTH - 100)) + 50;
        star.y = Math.floor(Math.random() * (WORLD_HEIGHT - 100)) + 50;
        console.log('⭐ Star', star.id, 'moved from', oldPos, 'to', { x: star.x, y: star.y });

        // Broadcast updates
        console.log('📡 Broadcasting score update:', gameState.scores);
        io.emit('updateScore', gameState.scores);
        console.log('📡 Broadcasting new star locations:', gameState.stars);
        io.emit('starsLocation', gameState.stars);
      }
    });
  });

  // Broadcast player updates
  io.emit('playerUpdates', players);
}

module.exports = { initializeServer };
