// ~~~ Socket connection ~~~
const socket = io({
  transports: ['websocket']
});

// ~~~ Global client state ~~~
const clientPlayers = {};   // playerId -> Phaser sprite
let myId = null;            // socket.id for me

// Set myId as soon as socket connects
socket.on('connect', function() {
  myId = socket.id;
  console.log('✅ Connected to server with ID:', myId);
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
let hpBg, hpFill, xpBg, xpFill, scoreText;
let starSprite;

// local fallback player (DISABLED for multiplayer - causes double ship issue)
let localPlayerSprite = null;

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

  // create a star sprite (visual only, server handles collection)
  starSprite = this.add.image(WORLD_W / 2, WORLD_H / 2, 'star');
  starSprite.setOrigin(0.5, 0.5);
  starSprite.setDepth(0); // Behind players
  console.log('⭐ Initial star sprite created at:', starSprite.x, starSprite.y);

  // keyboard controls
  cursors = this.input.keyboard.addKeys({
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN
  });

  // ~~~ HUD setup ~~~
  const cam = this.cameras.main;
  const cx = cam.width / 2;

  hpBg = this.add.rectangle(
    cx,
    cam.height - 80,
    200,
    20,
    0x222222
  ).setScrollFactor(0);

  hpFill = this.add.rectangle(
    cx,
    cam.height - 80,
    200,
    20,
    0xff3333
  ).setScrollFactor(0);

  xpBg = this.add.rectangle(
    cx,
    cam.height - 50,
    200,
    10,
    0x222222
  ).setScrollFactor(0);

  xpFill = this.add.rectangle(
    cx,
    cam.height - 50,
    200,
    10,
    0x00ccff
  ).setScrollFactor(0);

  scoreText = this.add.text(
    20,
    20,
    "Score: R 0 | B 0",
    {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }
  ).setScrollFactor(0);

  // fullscreen toggle with F
  this.input.keyboard.on('keydown-F', () => {
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
    }
  });

  // ~~~ LOCAL FALLBACK PLAYER ~~~
  // DISABLED for multiplayer - local sprite causes double ship issue
  // The server handles all physics and we only display authoritative sprites

  // Uncomment below only for offline/local play:
  /*
  localPlayerSprite = this.physics.add
    .image(WORLD_W / 2 + 100, WORLD_H / 2, 'ship')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);

  localPlayerSprite.setDrag(0);
  localPlayerSprite.setAngularDrag(0);
  localPlayerSprite.setMaxVelocity(400);

  // camera follows local player
  this.cameras.main.startFollow(localPlayerSprite, true, 0.1, 0.1);
  this.cameras.main.setZoom(1.0);

  // ⭐ LOCAL OVERLAP LOGIC ⭐
  // if local player touches the star, collectStar gets called
  this.physics.add.overlap(localPlayerSprite, starSprite, () => {
    collectStar(self);
  });
  */

  // For multiplayer, camera will follow authoritative sprite when it's created
  // Set initial camera position to center of world while waiting for player
  this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
  this.cameras.main.setZoom(1.0);

  // Add a test rectangle to ensure rendering is working
  const testRect = this.add.rectangle(WORLD_W / 2, WORLD_H / 2 - 100, 100, 100, 0x00ff00);
  testRect.setStrokeStyle(2, 0xffffff);
  console.log('Test rectangle added at world center:', testRect.x, testRect.y);

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

  socket.on('starLocation', function (starInfo) {
    // when we get a server starLocation in the future,
    // trust that instead of local random
    console.log('📍 Star location received from server:', starInfo);
    if (starSprite) {
      starSprite.setPosition(starInfo.x, starInfo.y);
      console.log('⭐ Star sprite updated to position:', starInfo.x, starInfo.y);
    } else {
      console.error('❌ Star sprite not yet created!');
    }
  });

  socket.on('updateScore', function (scores) {
    // sync from server
    serverScores = scores;
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

      // Update local HUD stats for our player
      if (id === myId) {
        // authoritative HUD stats
        if (serverP.hp !== undefined)    localPlayerStats.hp = serverP.hp;
        if (serverP.maxHp !== undefined) localPlayerStats.maxHp = serverP.maxHp;
        if (serverP.xp !== undefined)    localPlayerStats.xp = serverP.xp;
        if (serverP.maxXp !== undefined) localPlayerStats.maxXp = serverP.maxXp;
      }
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

  // HUD UPDATE
  const hpPct = safeDiv(localPlayerStats.hp, localPlayerStats.maxHp);
  hpFill.width = 200 * hpPct;

  const xpPct = safeDiv(localPlayerStats.xp, localPlayerStats.maxXp);
  xpFill.width = 200 * xpPct;

  // use whichever score we currently have (local bump or from server)
  scoreText.setText(
    `Score: R ${serverScores.red || 0} | B ${serverScores.blue || 0}`
  );
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

// called when star collection happens (server authoritative)
function collectStar(scene) {
  // bump red team score locally
  serverScores.red = (serverScores.red || 0) + 10;

  // move star somewhere else in the world (client-side rng for now)
  const newX = Phaser.Math.Between(50, WORLD_W - 50);
  const newY = Phaser.Math.Between(50, WORLD_H - 50);
  starSprite.setPosition(newX, newY);

  // could also award XP/HP here if you want:
  localPlayerStats.xp = Math.min(
    localPlayerStats.xp + 5,
    localPlayerStats.maxXp
  );
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
      // Draw thicker lines at 500 unit intervals
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
