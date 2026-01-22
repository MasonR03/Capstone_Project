// Multiplayer client w/ login-gated start + keyboard class picker + HUD + stars + camera follow

// ~~~~ Socket (delayed until login) ~~~~
let socket = null;

// ~~~~ Ping tracking ~~~~
let currentPing = 0;
let pingInterval = null;

// ~~~~ Global client state ~~~~
let entityManager = null;   // ClientEntityManager instance
const clientPlayers = {};   // playerId -> Phaser sprite (backward compat)
const playerNames = {};     // playerId -> player name
const playerNameTexts = {}; // playerId -> Phaser text object

let myId = null;            // display id (player name)
let socketId = null;        // socket.id from server

let pendingStarPositions = null; // stars before scene exists
let UIHud = null;                // controller from UI.init

// ~~~~ Movement sync state ~~~~
const SNAP_THRESHOLD = 10000;     // squared distance; snap if error > 100 units

// ~~~~ Class gate ~~~~
let classChosen = false;
let chosenClassKey = null;

// ~~~~ Ship classes ~~~~
const SHIP_CLASSES = {
  hunter: {
    name: 'Hunter',
    spriteKey: 'ship_hunter',
    stats: { maxHp: 90, speed: 260, accel: 220 }
  },
  tanker: {
    name: 'Tanker',
    spriteKey: 'ship_tanker',
    stats: { maxHp: 160, speed: 180, accel: 160 }
  }
};
const DEFAULT_CLASS = 'hunter';

// ~~~~ Score + HUD stats ~~~~
let serverScores = { red: 0, blue: 0 };

let localPlayerStats = {
  hp: 100,
  maxHp: 100,
  xp: 0,
  maxXp: 100
};

// ~~~~ Input refs ~~~~
let cursors;

// ~~~~ Stars ~~~~
let starSprites = [];
let latestStars = [];

// ~~~~ World bounds ~~~~
const WORLD_W = 2000;
const WORLD_H = 2000;

// ~~~~ Camera follow gate ~~~~
let cameraFollowSet = false;

// ~~~~ Phaser client config ~~~~
const clientConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: { debug: false, gravity: { y: 0 } }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

let game = null;

// ~~~~ Start after login ~~~~
document.addEventListener('DOMContentLoaded', function () {
  const loginCheckInterval = setInterval(function () {
    if (
      typeof window.loginComplete !== 'undefined' &&
      window.loginComplete === true &&
      typeof playerName !== 'undefined' &&
      playerName
    ) {
      clearInterval(loginCheckInterval);
      console.log('🎮 Login complete. Initializing socket + game...');

      initializeSocket();
      game = new Phaser.Game(clientConfig);
    }
  }, 100);

  setTimeout(function () {
    if (!game) {
      console.warn('⚠️ Login timeout - starting game anyway');
      if (!socket) initializeSocket();
      game = new Phaser.Game(clientConfig);
      clearInterval(loginCheckInterval);
    }
  }, 30000);
});

// ~~~~ Socket init ~~~~
function initializeSocket() {
  if (socket) return;

  socket = io({ transports: ['websocket'] });

  socket.on('connect', function () {
    socketId = socket.id;

    if (!myId && typeof playerName !== 'undefined' && playerName) myId = playerName;
    else if (!myId) myId = socket.id;

    console.log('✅ Connected to server');
    console.log('🆔 My player name:', myId);
    console.log('🔌 Socket ID:', socketId);

    socket.emit('setPlayerName', myId);

    // Start ping measurement
    startPingMeasurement();

    // send class (if already chosen)
    if (classChosen && chosenClassKey) {
      emitChooseClass(chosenClassKey);
    }
  });

  setupSocketListeners();
}

// Ping measurement
function startPingMeasurement() {
  if (pingInterval) clearInterval(pingInterval);

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
window.getCurrentPing = getCurrentPing;

// ~~~~ Socket listeners ~~~~
function setupSocketListeners() {
  socket.on('starsLocation', function (starsInfo) {
    console.log('📍 Star locations received:', starsInfo);
    latestStars = starsInfo || latestStars;

    if (starSprites && starSprites.length > 0) {
      (starsInfo || []).forEach((star, index) => {
        if (starSprites[index]) starSprites[index].setPosition(star.x, star.y);
      });
    } else {
      pendingStarPositions = starsInfo;
    }
  });

  socket.on('updateScore', function (scores) {
    serverScores = scores || { red: 0, blue: 0 };
    UIHud && UIHud.updateScores(serverScores);
  });
}

// ~~~~ Preload ~~~~
function preload() {
  console.log('Preloading assets...');

  // ships
  this.load.image('ship_hunter', 'assets/HunterShip.png');
  this.load.image('ship_tanker', 'assets/TankerShip.png');

  // star + hud
  this.load.image('star', 'assets/Star.png');
  this.load.image('hudBars', 'assets/Bar.png');

  this.load.on('complete', () => console.log('Assets loaded successfully'));
  this.load.on('loaderror', (file) => console.error('Error loading asset:', file.key, file.url));

  //level menu tbd
  this.load.image('menuIn',  'assets/MenuSliderIn.png');
  this.load.image('menuOut', 'assets/MenuSliderOut.png');

}

// ~~~~ Create ~~~~
function create() {
  console.log('clientGame.js create() is running!');

  const self = this;

  // world bounds
  this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
  this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

  // red border visuals
  addWorldBorders(this);

  // camera start
  this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
  this.cameras.main.setZoom(1.0);

  // minimap
  this.minimap = MiniMap.create(this, WORLD_W, WORLD_H, { size: 160, radius: 70, margin: 20 });

  // HUD
  UIHud = window.UI && window.UI.init(this, {
    world: { width: WORLD_W, height: WORLD_H },
    minimap: { radius: 70 }
  });
  if (!UIHud) {
    console.warn('UI module not found. Did you include public/ui/ui.js before clientGame.js?');
  } else {
    UIHud.updateScores(serverScores);
  }

  // Initialize debug tools
  DebugTools.init(game, () => {
    const mySprite = clientPlayers[socketId];
    return {
      player: mySprite,
      allPlayers: clientPlayers,
      playerNames: playerNames
    };
  });

  // movement keys
  cursors = this.input.keyboard.addKeys({
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    up: Phaser.Input.Keyboard.KeyCodes.UP,
    down: Phaser.Input.Keyboard.KeyCodes.DOWN
  });

  // fullscreen toggle
  this.input.keyboard.on('keydown-F', () => {
    if (this.scale.isFullscreen) this.scale.stopFullscreen();
    else this.scale.startFullscreen();
  });

  // stars
  for (let i = 0; i < 5; i++) {
    const star = this.add.image(WORLD_W / 2 + (i * 100 - 200), WORLD_H / 2, 'star');
    star.setOrigin(0.5, 0.5);
    star.setDepth(0);
    star.setScale(1.15);
    star.setAlpha(1.0);

    this.tweens.add({
      targets: star,
      scale: 1.35,
      alpha: 0.75,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    starSprites.push(star);
  }

  // apply pending stars
  if (pendingStarPositions) {
    pendingStarPositions.forEach((star, index) => {
      if (starSprites[index]) starSprites[index].setPosition(star.x, star.y);
    });
    pendingStarPositions = null;
  }

  // class picker (keyboard)
  openClassPickerKeyboard(this, (pickedKey) => {
    chosenClassKey = SHIP_CLASSES[pickedKey] ? pickedKey : DEFAULT_CLASS;
    classChosen = true;

    console.log('Picked class:', chosenClassKey);

    if (socket && socket.connected) emitChooseClass(chosenClassKey);
    else console.warn('Socket not ready, will send class on connect');
  });

  // ~~~~ SOCKET HANDLERS ~~~~
  socket.on('currentPlayers', function (players) {
    console.log('currentPlayers:', Object.keys(players).length);

    Object.keys(players).forEach(function (id) {
      const p = players[id];
      addOrUpdatePlayerSprite(self, p);
    });

    ensureCameraFollow(self);
  });

  socket.on('newPlayer', function (playerInfo) {
    addOrUpdatePlayerSprite(self, playerInfo);
  });

  socket.on('playerDisconnected', function (playerId) {
    if (clientPlayers[playerId]) {
      clientPlayers[playerId].destroy();
      delete clientPlayers[playerId];
    }
    if (playerNameTexts[playerId]) {
      playerNameTexts[playerId].destroy();
      delete playerNameTexts[playerId];
    }
    delete playerNames[playerId];
  });

  socket.on('playerUpdates', function (data) {
    // Support both old format (direct players object) and new format (with timestamp)
    const serverPlayers = data.players || data;

    Object.keys(serverPlayers).forEach(function (id) {
      const serverP = serverPlayers[id];

      if (!clientPlayers[id]) addOrUpdatePlayerSprite(self, serverP);

      const sprite = clientPlayers[id];
      if (sprite) {
        // class sprite selection
        const effectiveClassKey =
          (serverP && SHIP_CLASSES[serverP.classKey] ? serverP.classKey : null) ||
          (id === socketId ? chosenClassKey : null) ||
          DEFAULT_CLASS;

        applyClassVisual(sprite, effectiveClassKey);

        sprite.x = serverP.x;
        sprite.y = serverP.y;
        sprite.rotation = serverP.rotation;

        // Store velocity for debug display
        sprite.velocityX = serverP.velocityX || 0;
        sprite.velocityY = serverP.velocityY || 0;

        const nt = playerNameTexts[id];
        if (nt) {
          nt.x = serverP.x;
          nt.y = serverP.y - 70;
          if (serverP.playerName) nt.setText(serverP.playerName);
        }
      }

      // HUD stats for me
      if (id === socketId) {
        if (serverP.hp !== undefined) localPlayerStats.hp = serverP.hp;
        if (serverP.maxHp !== undefined) localPlayerStats.maxHp = serverP.maxHp;
        if (serverP.xp !== undefined) localPlayerStats.xp = serverP.xp;
        if (serverP.maxXp !== undefined) localPlayerStats.maxXp = serverP.maxXp;

        UIHud && UIHud.updateHpXp({
          hp: localPlayerStats.hp,
          maxHp: localPlayerStats.maxHp,
          xp: localPlayerStats.xp,
          maxXp: localPlayerStats.maxXp
        });

        // quick proof of what server is sending
        if (!self._lastClassLog || Date.now() - self._lastClassLog > 1500) {
          console.log('👀 server classKey:', serverP.classKey, '| local chosen:', chosenClassKey);
          self._lastClassLog = Date.now();
        }
      }
    });

    ensureCameraFollow(self);

    UIHud && UIHud.updateMinimap({
      players: serverPlayers,
      myId: socketId,
      stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
    });
  });
}

// ~~~~ Update ~~~~
function update() {
  if (!classChosen) return;

  // input -> server
  if (socket && socketId && socket.connected) {
    socket.emit('playerInput', {
      left: !!cursors.left.isDown,
      right: !!cursors.right.isDown,
      up: !!cursors.up.isDown,
      down: !!cursors.down.isDown
    });
  }

  // minimap follow
  MiniMap.anchor(this.minimap, this, { size: 160, margin: 20 });
  MiniMap.update(this.minimap, clientPlayers, latestStars, socketId);

  // HUD tick
  UIHud && UIHud.tick(this.cameras.main);
  UIHud && UIHud.updateMinimap?.({
    players: clientPlayers,
    myId: socketId,
    stars: (starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }))
  });
}

// ~~~~ Border visuals ~~~~
function addWorldBorders(scene) {
  const borderWidth = 30;
  const borderColor = 0x880000;

  scene.add.rectangle(WORLD_W / 2, borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
  scene.add.rectangle(WORLD_W / 2, WORLD_H - borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
  scene.add.rectangle(borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
  scene.add.rectangle(WORLD_W - borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
}

// ~~~~ Camera follow helper ~~~~
function ensureCameraFollow(scene) {
  if (cameraFollowSet) return;
  if (!scene || !scene.cameras || !scene.cameras.main) return;
  if (!socketId) return;

  const mine = clientPlayers[socketId];
  if (mine) {
    scene.cameras.main.startFollow(mine, true, 0.12, 0.12);
    cameraFollowSet = true;
    console.log('📷 Camera now following my sprite:', socketId);
  }
}

// ~~~~ Emit chooseClass (extra-safe payload) ~~~~
function emitChooseClass(classKey) {
  const safeKey = SHIP_CLASSES[classKey] ? classKey : DEFAULT_CLASS;

  // send the event your server expects
  socket.emit('chooseClass', { classKey: safeKey });

  // also send a richer payload (harmless if server ignores)
  socket.emit('chooseClass', { classKey: safeKey, playerId: socketId, playerName: myId });

  // local apply now (so you SEE it instantly)
  const mine = clientPlayers[socketId];
  if (mine) applyClassVisual(mine, safeKey);
}

// ~~~~ Class -> texture helper ~~~~
function applyClassVisual(sprite, classKey) {
  const key = SHIP_CLASSES[classKey] ? classKey : DEFAULT_CLASS;
  const cfg = SHIP_CLASSES[key] || SHIP_CLASSES[DEFAULT_CLASS];

  if (sprite._classKey !== key) {
    sprite.setTexture(cfg.spriteKey);
    sprite.setDisplaySize(53, 40);
    sprite._classKey = key;
  }
}

// ~~~~ Sprite helper ~~~~
function addOrUpdatePlayerSprite(scene, playerInfo) {
  const playerId = playerInfo.playerId;
  let sprite = clientPlayers[playerId];

  const initialClass =
    (SHIP_CLASSES[playerInfo.classKey] ? playerInfo.classKey : null) ||
    (playerId === socketId ? chosenClassKey : null) ||
    DEFAULT_CLASS;

  const cfg = SHIP_CLASSES[initialClass] || SHIP_CLASSES[DEFAULT_CLASS];

  if (!sprite) {
    console.log('Creating sprite for:', playerInfo.playerName || playerId, 'class:', initialClass);

    sprite = scene.add.sprite(playerInfo.x, playerInfo.y, cfg.spriteKey);
    sprite._classKey = initialClass;
    sprite.setOrigin(0.5, 0.5);
    sprite.setDisplaySize(53, 40);

    if (playerInfo.team === 'red') sprite.setTint(0xff4444);
    else if (playerInfo.team === 'blue') sprite.setTint(0x4444ff);

    sprite.setDepth(1);
    sprite.setVisible(true);
    sprite.setActive(true);

    clientPlayers[playerId] = sprite;

    if (playerInfo.playerName) playerNames[playerId] = playerInfo.playerName;

    const nameText = scene.add.text(playerInfo.x, playerInfo.y - 70, playerInfo.playerName || playerId, {
      font: '16px Orbitron, sans-serif',
      fill: '#00ffff',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 2
    });
    nameText.setOrigin(0.5, 0.5);
    nameText.setDepth(2);
    playerNameTexts[playerId] = nameText;
  }

  return sprite;
}

// ~~~~ Class picker (keyboard only) ~~~~
function openClassPickerKeyboard(scene, onPick) {
  console.log('~~~ openClassPickerKeyboard called ~~~');

  try {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    window.focus && window.focus();
  } catch (e) {}

  const cam = scene.cameras.main;
  const overlay = scene.add.container(0, 0).setScrollFactor(0).setDepth(999999);

  const dim = scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.80).setOrigin(0, 0);
  overlay.add(dim);

  const title = scene.add.text(cam.width / 2, 80, 'Choose Your Ship', {
    fontSize: '26px',
    fill: '#ffffff',
    fontFamily: 'monospace'
  }).setOrigin(0.5, 0.5);
  overlay.add(title);

  const hint = scene.add.text(
    cam.width / 2,
    112,
    'P/W up   L/S down   ENTER pick   ESC cancel',
    { fontSize: '14px', fill: '#cccccc', fontFamily: 'monospace' }
  ).setOrigin(0.5, 0.5);
  overlay.add(hint);

  const keys = Object.keys(SHIP_CLASSES);
  if (!keys.length) {
    overlay.destroy();
    onPick(DEFAULT_CLASS);
    return;
  }

  let idx = 0;
  const rows = [];
  const startY = 180;

  keys.forEach((key, i) => {
    const cfg = SHIP_CLASSES[key];
    const y = startY + i * 150;

    const row = scene.add.container(cam.width / 2, y);
    overlay.add(row);

    const box = scene.add.rectangle(0, 0, 520, 120, 0x111111, 0.95).setStrokeStyle(2, 0xffffff, 0.35);
    row.add(box);

    row.add(scene.add.image(-200, 0, cfg.spriteKey).setScale(1.0));

    row.add(scene.add.text(-130, -26, cfg.name, {
      fontSize: '20px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }));

    const st = cfg.stats;
    row.add(scene.add.text(-130, 6, `HP ${st.maxHp}   SPD ${st.speed}   ACC ${st.accel}`, {
      fontSize: '14px',
      fill: '#cccccc',
      fontFamily: 'monospace'
    }));

    const tag = scene.add.text(190, 34, '', {
      fontSize: '14px',
      fill: '#00ffcc',
      fontFamily: 'monospace'
    }).setOrigin(0.5, 0.5);
    row.add(tag);

    rows.push({ key, box, tag });
  });

  function refresh() {
    rows.forEach((r, i) => {
      const sel = i === idx;
      r.box.setStrokeStyle(2, sel ? 0x00ffcc : 0xffffff, sel ? 0.9 : 0.35);
      r.tag.setText(sel ? 'SELECTED' : '');
    });
  }
  refresh();

  const kb = scene.input.keyboard;
  const handler = (ev) => {
    const code = ev.code;

    if (code === 'KeyP' || code === 'KeyW') {
      idx = (idx - 1 + keys.length) % keys.length;
      refresh();
      return;
    }

    if (code === 'KeyL' || code === 'KeyS') {
      idx = (idx + 1) % keys.length;
      refresh();
      return;
    }

    if (code === 'Enter' || code === 'Space') {
      cleanup();
      onPick(keys[idx]);
      return;
    }

    if (code === 'Escape') {
      cleanup();
      onPick(DEFAULT_CLASS);
      return;
    }
  };

  kb.on('keydown', handler);

  function cleanup() {
    kb.off('keydown', handler);
    overlay.destroy();
  }
}

