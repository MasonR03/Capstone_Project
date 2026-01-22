// ~~~ Socket connection (delayed until login) ~~~
let socket = null;

// ~~~ Ping tracking ~~~
let currentPing = 0;
let pingInterval = null;

// ~~~ Global client state ~~~
let entityManager = null;   // ClientEntityManager instance
let myId = null;            // Player name (set from login)
let socketId = null;        // socket.id from server
let pendingStarPositions = null; // Store star positions received before scene creation
let UIHud = null; // controller from UI.init

// ~~~ Movement sync state ~~~
const SNAP_THRESHOLD = 10000;     // squared distance; snap if error > 100 units

// Initialize socket connection after login
function initializeSocket() {
  if (socket) return; // Already initialized
  
  socket = io({
    transports: ['websocket']
  });

  // Set myId from playerName (from login.js)
  socket.on('connect', function() {
    socketId = socket.id;
    // Use the player name from login as the myId for display purposes
    // Note: window.playerName is set by login.js before this script runs
    if (!myId && typeof window.playerName !== 'undefined' && window.playerName) {
      myId = window.playerName;
    } else if (!myId) {
      myId = socket.id;
    }
    console.log('✅ Connected to server');
    console.log('🆔 My player ID (name):', myId);
    console.log('🔌 Socket ID:', socketId);
    
    // Send player name to server for identification
    socket.emit('setPlayerName', myId);

    // Start ping measurement
    startPingMeasurement();
  });

  // Set up other socket listeners
  setupSocketListeners();
}

// Ping measurement using socket.io's built-in ping
function startPingMeasurement() {
  // Clear any existing interval
  if (pingInterval) clearInterval(pingInterval);

  // Measure ping every second
  pingInterval = setInterval(() => {
    if (socket && socket.connected) {
      const start = Date.now();
      socket.emit('ping', () => {
        currentPing = Date.now() - start;
      });
    }
  }, 1000);
}

// Expose ping for debug tools
function getCurrentPing() {
  return currentPing;
}

// Make it globally accessible
window.getCurrentPing = getCurrentPing;

// Set up global handler for stars that works before Phaser scene is created
function setupSocketListeners() {
  socket.on('starsLocation', function (starsInfo) {
    console.log('📍 Global: Star locations received from server:', starsInfo);
    latestStars = starsInfo || latestStars; // For the mini-map to pick up on star location
    if (starSprites && starSprites.length > 0) {
      // Stars already created, update them directly
      starsInfo.forEach((star, index) => {
        if (starSprites[index]) {
          starSprites[index].setPosition(star.x, star.y);
          console.log('⭐ Global: Star', star.id, 'updated to position:', star.x, star.y);
        }
      });
    } else {
      // Stars not created yet, store for later
      console.log('📌 Global: Storing star positions for when sprites are created');
      pendingStarPositions = starsInfo;
    }
  });

  socket.on('updateScore', function (scores) {
    serverScores = scores || { red: 0, blue: 0 };
    UIHud && UIHud.updateScores(serverScores);
  });
}

// Border buffer distance - how far from edge to stop ships
const BORDER_BUFFER = 20;

// server broadcast scores (we'll also edit this locally for solo mode)
let serverScores = { red: 0, blue: 0 };

// HUD stats for me
let localPlayerStats = {
  hp: 100,
  maxHp: 100,
  xp: 0,
  maxXp: 100
};

// input refs and HUD refs
let cursors;
// (UI is now in public/ui.js)
let starSprites = [];  // Array to hold multiple star sprites

// local fallback player (DISABLED for multiplayer - causes double ship issue)
let localPlayerSprite = null;

let latestStars = [];   // <= stars array for minimap

// world bounds we'll reuse
const WORLD_W = 2000;
const WORLD_H = 2000;

// ~~~ Phaser client config ~~~
const clientConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

let game = null;

// Wait for login before starting the game
document.addEventListener('DOMContentLoaded', function() {
  // Check if login is complete every 100ms
  const loginCheckInterval = setInterval(function() {
    if (typeof window.loginComplete !== 'undefined' && window.loginComplete === true && typeof window.playerName !== 'undefined' && window.playerName) {
      clearInterval(loginCheckInterval);
      console.log('🎮 Login complete. Initializing game and socket...');
      
      // Now initialize socket with player name
      initializeSocket();
      
      // Start the game
      game = new Phaser.Game(clientConfig);
    }
  }, 100);
  
  // Safety timeout after 30 seconds (in case of issues)
  setTimeout(function() {
    if (!game) {
      console.warn('⚠️ Login timeout - starting game anyway');
      if (!socket) initializeSocket();
      game = new Phaser.Game(clientConfig);
      clearInterval(loginCheckInterval);
    }
  }, 30000);
});

// ~~~ Preload ~~~
function preload() {
  console.log('Preloading assets...');

  this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.image('star', 'assets/star_gold.png');
  // this.load.image('otherPlayer', 'assets/enemyBlack5.png'); // optional

  this.load.on('complete', () => {
    console.log('Assets loaded successfully');
  });

  this.load.on('loaderror', (file) => {
    console.error('Error loading asset:', file.key, file.url);
  });
}

// ~~~ Create ~~~
function create() {
  const self = this;

  // Create graphics object for debug gridlines
  this.debugGridGraphics = this.add.graphics();
  this.debugGridGraphics.setDepth(-1); // Behind everything else
  this.debugGridGraphics.setVisible(false); // Hidden by default

  // Initialize EntityManager
  entityManager = new ClientEntityManager(this);

  // Initialize debug tools
  DebugTools.init(game, () => {
    // Callback to get current player and all players
    const localShip = entityManager ? entityManager.getLocalShip() : null;
    const allSprites = {};
    const names = {};
    if (entityManager) {
      entityManager.forEach((ship, id) => {
        allSprites[id] = ship.sprite;
        names[id] = ship.playerName;
      });
    }
    if (localShip) {
      return {
        player: localShip,
        allPlayers: allSprites,
        playerNames: names
      };
    }
    return { allPlayers: allSprites, playerNames: names };
  }, this.debugGridGraphics);

  // physics world size
  this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
  this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

  // Draw debug gridlines (100x100 squares)
  drawDebugGrid(this.debugGridGraphics, WORLD_W, WORLD_H);

  // Add dark red border visualization
  const borderWidth = 30;
  const borderColor = 0x880000;

  // Top border
  this.add.rectangle(WORLD_W / 2, borderWidth / 2, WORLD_W, borderWidth, borderColor);
  // Bottom border
  this.add.rectangle(WORLD_W / 2, WORLD_H - borderWidth / 2, WORLD_W, borderWidth, borderColor);
  // Left border
  this.add.rectangle(borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor);
  // Right border
  this.add.rectangle(WORLD_W - borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor);

  // group of networked players (from server if/when we get them)
  this.playersGroup = this.physics.add.group();

  // Sets up the ui
  // OLD: this.ui = UI.create(...)
  this.minimap = MiniMap.create(this, WORLD_W, WORLD_H, { size: 160, radius: 70, margin: 20 });


  // — UI init —
  UIHud = window.UI && window.UI.init(this, {
    world: { width: WORLD_W, height: WORLD_H },
    minimap: { radius: 70 } // you can tweak later
  });
  if (!UIHud) {
    console.warn('UI module not found. Did you include public/ui.js before clientGame.js?');
  } else {
    UIHud.updateScores(serverScores);
  }

  // create 5 star sprites (visual only, server handles collection)
  // Initialize at default positions, server will update with actual positions
  for (let i = 0; i < 5; i++) {
    const star = this.add.image(
      WORLD_W / 2 + (i * 100 - 200),  // Spread them out initially
      WORLD_H / 2,
      'star'
    );
    star.setOrigin(0.5, 0.5);
    star.setDepth(0); // Behind players
    starSprites.push(star);
    console.log('⭐ Initial star', i, 'created at:', star.x, star.y);
  }

  // If we received star positions before creating sprites (from global handler), apply them now
  if (pendingStarPositions) {
    console.log('📍 Applying pending star positions from global handler');
    pendingStarPositions.forEach((star, index) => {
      if (starSprites[index]) {
        starSprites[index].setPosition(star.x, star.y);
        console.log('⭐ Star', star.id, 'updated to position:', star.x, star.y);
      }
    });
    pendingStarPositions = null;
  }

  // keyboard controls
  cursors = this.input.keyboard.addKeys({
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN
  });

  // fullscreen toggle with F
  this.input.keyboard.on('keydown-F', () => {
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
    }
  });

  // For multiplayer, camera will follow authoritative sprite when it's created
  // Set initial camera position to center of world while waiting for player
  this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
  this.cameras.main.setZoom(1.0);

  // Add a test rectangle to ensure rendering is working
  const testRect = this.add.rectangle(WORLD_W / 2, WORLD_H / 2, 100, 100, 0x000080);
  testRect.setStrokeStyle(2, 0xffffff);
  console.log('Test rectangle added at world center:', testRect.x, testRect.y);
  // Write word 'center' on rectangle.
  const centerText = this.add.text(testRect.x, testRect.y, 'CENTER', {
    font: '16px Orbitron, sans-serif',
    fill: '#ffffff'
  });
  centerText.setOrigin(0.5, 0.5);

  // ~~~ SOCKET HANDLERS ~~~
  socket.on('currentPlayers', function (players) {
    // Use socket.id directly if myId isn't set yet
    if (!myId) {
      myId = socket.id;
      console.log('Setting myId from socket.id:', myId);
    }

    console.log('Received currentPlayers event with', Object.keys(players).length, 'players');
    console.log('My socket ID is:', myId, 'Socket.id is:', socket.id);
    console.log('Player IDs received:', Object.keys(players));

    // Use EntityManager to initialize all ships
    entityManager.initializeFromServer(players, socket.id, self.cameras.main);

    // Double-check we found our player
    if (!entityManager.getLocalShip()) {
      console.warn('WARNING: Did not find our player in currentPlayers!');
      console.warn('Our ID:', myId, 'Socket ID:', socket.id);
      console.warn('Available IDs:', entityManager.getAllIds());

      // Fallback: follow the first player if we can't find ours
      const firstId = entityManager.getAllIds()[0];
      if (firstId) {
        const firstShip = entityManager.getShip(firstId);
        if (firstShip) {
          console.log('Fallback: Following first available player:', firstId);
          firstShip.setCamera(self.cameras.main);
        }
      }
    }
  });

  socket.on('newPlayer', function (playerInfo) {
    entityManager.addOrUpdateShip(playerInfo);
  });

  socket.on('playerDisconnected', function (playerId) {
    entityManager.removeShip(playerId);
  });

  // Keep backward compatibility for single star updates (if needed)
  socket.on('starLocation', function (starInfo) {
    console.log('📍 Single star location received (legacy):', starInfo);
  });

  socket.on('playerUpdates', function (data) {
    // Support both old format (direct players object) and new format (with timestamp)
    const serverPlayers = data.players || data;

    // Log periodically to avoid spam
    if (!self.lastUpdateLog || Date.now() - self.lastUpdateLog > 1000) {
      console.log('playerUpdates: Updating', Object.keys(serverPlayers).length, 'players');
      console.log('My ID is:', myId, 'Socket.id is:', socket.id);
      self.lastUpdateLog = Date.now();
    }

    // Process updates through EntityManager
    entityManager.processServerUpdate(serverPlayers, {
      onLocalPlayerUpdate: function(serverP) {
        // Update local HUD stats for our player
        if (serverP.hp !== undefined)    localPlayerStats.hp = serverP.hp;
        if (serverP.maxHp !== undefined) localPlayerStats.maxHp = serverP.maxHp;
        if (serverP.xp !== undefined)    localPlayerStats.xp = serverP.xp;
        if (serverP.maxXp !== undefined) localPlayerStats.maxXp = serverP.maxXp;

        UIHud && UIHud.updateHpXp({
          hp: localPlayerStats.hp,
          maxHp: localPlayerStats.maxHp,
          xp: localPlayerStats.xp,
          maxXp: localPlayerStats.maxXp
        });
      }
    });

    // Handle late-joining camera setup
    if (!self.cameraSet && entityManager.hasShip(socket.id)) {
      const localShip = entityManager.getShip(socket.id);
      if (localShip) {
        console.log('Late camera setup for:', localShip.getDisplayName());
        localShip.setCamera(self.cameras.main);
        entityManager.setLocalPlayer(socket.id);
        self.cameraSet = true;
        myId = socket.id;
      }
    }

    // Tell UI to redraw minimap with newest players/stars
    UIHud && UIHud.updateMinimap({
      players: entityManager.getMinimapData(),
      myId,
      stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
    });
  });
}

// ~~~ Update ~~~
function update() {
  // Calculate delta time for physics
  const now = Date.now();
  if (!this.lastUpdateTime) this.lastUpdateTime = now;
  const dt = Math.min((now - this.lastUpdateTime) / 1000, 0.05); // Cap at 50ms to prevent huge jumps
  this.lastUpdateTime = now;

  // SEND INPUT STATE TO SERVER (only when connected with valid ID)
  if (myId && socket && socket.connected) {
    const inputPayload = {
      left: cursors.left.isDown,
      right: cursors.right.isDown,
      up: cursors.up.isDown,
      down: cursors.down.isDown
    };
    socket.emit('playerInput', inputPayload);

    // Apply client-side prediction for local player
    entityManager.applyLocalPrediction(inputPayload, dt);
  }

  // Update all ships (interpolation for remote players)
  entityManager.updateAll();

  // Re-anchor minimap in case the camera resizes (fullscreen, etc.)
  MiniMap.anchor(this.minimap, this, { size: 160, margin: 20 });

  // Feed latest data so it follows the player and clamps off-screen dots
  // Get sprites for backward compatibility with MiniMap
  const spriteMap = {};
  entityManager.forEach((ship, id) => {
    spriteMap[id] = ship.sprite;
  });
  MiniMap.update(this.minimap, spriteMap, latestStars, myId);

  // Keep HUD aligned & refreshed
  UIHud && UIHud.tick(this.cameras.main);
  UIHud && UIHud.updateMinimap?.({
    players: entityManager.getMinimapData(),
    myId,
    stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
  });
}

// ~~~ Helpers ~~~
function safeDiv(n, d) {
  if (!d || d === 0) return 0;
  return n / d;
}

// Draw debug gridlines (100x100 squares)
function drawDebugGrid(graphics, worldWidth, worldHeight) {
  graphics.clear();
  graphics.lineStyle(1, 0x444444, 0.3);

  // Draw lines
  for (let x = 0; x <= worldWidth; x += 100) {
    graphics.moveTo(x, 0);
    graphics.lineTo(x, worldHeight);
  }

  for (let y = 0; y <= worldHeight; y += 100) {
    graphics.moveTo(0, y);
    graphics.lineTo(worldWidth, y);
  }

  // Add coordinate labels at grid intersections (every 500 units)
  graphics.lineStyle(1, 0x666666, 0.5); // Slightly brighter for major gridlines
  for (let x = 0; x <= worldWidth; x += 500) {
    for (let y = 0; y <= worldHeight; y += 500) {
      if (x > 0) {
        graphics.moveTo(x, 0);
        graphics.lineTo(x, worldHeight);
      }
      if (y > 0) {
        graphics.moveTo(0, y);
        graphics.lineTo(worldWidth, y);
      }
    }
  }

  graphics.strokePath();
}

