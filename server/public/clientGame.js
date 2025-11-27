// ~~~ Socket connection ~~~
const socket = io({
  transports: ['websocket']
});

// ~~~ Global client state ~~~
const clientPlayers = {};   // playerId -> Phaser sprite
let myId = null;            // socket.id for me
let pendingStarPositions = null; // Store star positions received before scene creation
let UIHud = null; // controller from UI.init

// Set myId as soon as socket connects
socket.on('connect', function() {
  myId = socket.id;
  console.log('✅ Connected to server with ID:', myId);
});

// Set up global handler for stars that works before Phaser scene is created
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

const game = new Phaser.Game(clientConfig);

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

  // Initialize debug tools
  DebugTools.init(game, () => {
    // Callback to get current player and all players
    if (myId && clientPlayers[myId]) {
      return {
        player: clientPlayers[myId],
        allPlayers: clientPlayers
      };
    }
    // No local sprite in multiplayer mode
    return { allPlayers: clientPlayers };
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
    fontSize: '16px',
    fill: '#ffffff',
    fontFamily: 'monospace'
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

    Object.keys(players).forEach(function (id) {
      // Create/update sprites for all players
      const sprite = addOrUpdatePlayerSprite(self, players[id]);

      // If this is our player, set up camera follow (check both myId and socket.id)
      if (id === myId || id === socket.id) {
        console.log('Found my player! Setting camera to follow:', id);
        myId = id; // Ensure myId is set

        if (sprite) {
          self.cameras.main.startFollow(sprite, true, 0.1, 0.1);
          console.log('Camera now following sprite at:', sprite.x, sprite.y);
        } else {
          console.error('ERROR: Could not find sprite for camera follow!');
        }
      }
    });

    // Double-check we found our player
    if (!clientPlayers[myId] && !clientPlayers[socket.id]) {
      console.warn('WARNING: Did not find our player in currentPlayers!');
      console.warn('Our ID:', myId, 'Socket ID:', socket.id);
      console.warn('Available IDs:', Object.keys(clientPlayers));

      // Fallback: follow the first player if we can't find ours
      const firstPlayerId = Object.keys(clientPlayers)[0];
      if (firstPlayerId) {
        console.log('Fallback: Following first available player:', firstPlayerId);
        self.cameras.main.startFollow(clientPlayers[firstPlayerId], true, 0.1, 0.1);
      }
    }
  });

  socket.on('newPlayer', function (playerInfo) {
    addOrUpdatePlayerSprite(self, playerInfo);
  });

  socket.on('playerDisconnected', function (playerId) {
    if (clientPlayers[playerId]) {
      clientPlayers[playerId].destroy();
      delete clientPlayers[playerId];
    }
  });

  // Keep backward compatibility for single star updates (if needed)
  socket.on('starLocation', function (starInfo) {
    console.log('📍 Single star location received (legacy):', starInfo);
  });

  socket.on('playerUpdates', function (serverPlayers) {
    // Log periodically to avoid spam
    if (!self.lastUpdateLog || Date.now() - self.lastUpdateLog > 1000) {
      console.log('playerUpdates: Updating', Object.keys(serverPlayers).length, 'players');
      console.log('My ID is:', myId, 'Socket.id is:', socket.id);
      console.log('Player IDs from server:', Object.keys(serverPlayers));
      self.lastUpdateLog = Date.now();
    }

    Object.keys(serverPlayers).forEach(function (id) {
      const serverP = serverPlayers[id];

      // Create sprite if it doesn't exist (handles late-joining players)
      if (!clientPlayers[id]) {
        console.log('Late player join detected, creating sprite for:', id);
        addOrUpdatePlayerSprite(self, serverP);

        // Check if this is our player and set camera
        if (id === socket.id && !self.cameraSet) {
          console.log('This is MY player! Setting camera to follow:', id);
          self.cameras.main.startFollow(clientPlayers[id], true, 0.1, 0.1);
          self.cameraSet = true;
          myId = id;
        }
      }

      // Update all sprites with server authoritative positions
      if (clientPlayers[id]) {
        const sprite = clientPlayers[id];
        // Server is the single source of truth for positions
        sprite.x = serverP.x;
        sprite.y = serverP.y;
        sprite.rotation = serverP.rotation;

        // Make sure sprite stays visible
        if (!sprite.visible) {
          console.warn('Sprite was invisible, making visible:', id);
          sprite.setVisible(true);
        }
      }

      // Update local HUD stats for our player (and refresh HP/XP bar)
      if (id === myId) {
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

    // tell UI to redraw minimap with newest players/stars
    UIHud && UIHud.updateMinimap({
      players: serverPlayers,
      myId,
      stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
    });
  });
}

// ~~~ Update ~~~
function update(time, delta) {
  // LOCAL MOVEMENT DISABLED for multiplayer
  // Server handles all physics - client only sends input and displays results
  // This prevents the double ship issue where local and server ships were both rendered

  // SEND INPUT STATE TO SERVER (only when connected with valid ID)
  if (myId && socket.connected) {
    const inputPayload = {
      left: cursors.left.isDown,
      right: cursors.right.isDown,
      up: cursors.up.isDown,
      down: cursors.down.isDown
    };
    socket.emit('playerInput', inputPayload);
  }

  // Re-anchor minimap in case the camera resizes (fullscreen, etc.)
  MiniMap.anchor(this.minimap, this, { size: 160, margin: 20 });

  // Feed latest data so it follows the player and clamps off-screen dots
  MiniMap.update(this.minimap, clientPlayers, latestStars, myId);

  // Keep HUD aligned & refreshed (your existing HUD API)
  UIHud && UIHud.tick(this.cameras.main);
  UIHud && UIHud.updateMinimap?.({
    players: clientPlayers,
    myId,
    stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
  });
}

// ~~~ Helpers ~~~
function addOrUpdatePlayerSprite(scene, playerInfo) {
  let sprite = clientPlayers[playerInfo.playerId];

  if (!sprite) {
    console.log('Creating sprite for player:', playerInfo.playerId, 'at', playerInfo.x, playerInfo.y);

    try {
      // Try to use the ship texture
      if (scene.textures.exists('ship')) {
        sprite = scene.add.sprite(playerInfo.x, playerInfo.y, 'ship');
        sprite.setDisplaySize(53, 40);
        console.log('Ship texture loaded successfully');
      } else {
        // Fallback: create a colored rectangle if texture not found
        console.warn('Ship texture not found, using fallback rectangle');
        sprite = scene.add.rectangle(playerInfo.x, playerInfo.y, 53, 40);
      }

      sprite.setOrigin(0.5, 0.5);

      // tint by team
      if (playerInfo.team === 'red') {
        sprite.setTint(0xff4444);
      } else if (playerInfo.team === 'blue') {
        sprite.setTint(0x4444ff);
      }

      // Make sure sprite is visible
      sprite.setVisible(true);
      sprite.setDepth(1);
      sprite.setActive(true);

      clientPlayers[playerInfo.playerId] = sprite;

      // Set initial position and rotation
      sprite.x = playerInfo.x;
      sprite.y = playerInfo.y;
      sprite.rotation = playerInfo.rotation || 0;

      console.log('Sprite created successfully for:', playerInfo.playerId, 'Sprite object:', sprite);
    } catch (error) {
      console.error('Error creating sprite:', error);
    }
  }
  // Position updates will happen in playerUpdates handler

  return sprite;
}

// Note: collectStar(...) stays unused in multiplayer mode
function collectStar(scene, starIndex) {
  // local demo only
}

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
