// ~~~ Socket connection ~~~
const socket = io({
  transports: ['websocket']
});

// ~~~ Global client state ~~~
const clientPlayers = {};   // playerId -> Phaser sprite
let myId = null;            // socket.id for me

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

// local fallback player (for offline / no-authority mode)
let localPlayerSprite;

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
  this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.image('star', 'assets/star_gold.png');
  // this.load.image('otherPlayer', 'assets/enemyBlack5.png'); // optional
}

// ~~~ Create ~~~
function create() {
  const self = this;

  // physics world size
  this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
  this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

  // group of networked players (from server if/when we get them)
  this.playersGroup = this.physics.add.group();

  // create a star sprite IN PHYSICS so we can overlap it
  starSprite = this.physics.add
    .image(WORLD_W / 2, WORLD_H / 2, 'star')
    .setCircle(12) // shrink hit area if you want tighter pickup
    .setOrigin(0.5, 0.5);

  // keyboard controls
  cursors = this.input.keyboard.addKeys({
    left: Phaser.Input.Keyboard.KeyCodes.LEFT,
    right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
    up: Phaser.Input.Keyboard.KeyCodes.UP
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
  localPlayerSprite = this.physics.add
    .image(WORLD_W / 2 + 100, WORLD_H / 2, 'ship')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);

  localPlayerSprite.setDrag(100);
  localPlayerSprite.setAngularDrag(100);
  localPlayerSprite.setMaxVelocity(200);

  // camera follows local player
  this.cameras.main.startFollow(localPlayerSprite, true, 0.1, 0.1);
  this.cameras.main.setZoom(1.0);

  // ⭐ LOCAL OVERLAP LOGIC ⭐
  // if local player touches the star, collectStar gets called
  this.physics.add.overlap(localPlayerSprite, starSprite, () => {
    collectStar(self);
  });

  // ~~~ SOCKET HANDLERS ~~~
  socket.on('currentPlayers', function (players) {
    Object.keys(players).forEach(function (id) {
      addOrUpdatePlayerSprite(self, players[id]);

      if (id === socket.id) {
        myId = id;

        // switch camera to authoritative sprite and kill fallback
        if (localPlayerSprite) {
          localPlayerSprite.destroy();
          localPlayerSprite = null;
        }

        self.cameras.main.startFollow(
          clientPlayers[myId],
          true,
          0.1,
          0.1
        );
      }
    });
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
    starSprite.setPosition(starInfo.x, starInfo.y);
  });

  socket.on('updateScore', function (scores) {
    // sync from server
    serverScores = scores;
  });

  socket.on('playerUpdates', function (serverPlayers) {
    Object.keys(serverPlayers).forEach(function (id) {
      const serverP = serverPlayers[id];

      if (!clientPlayers[id]) {
        addOrUpdatePlayerSprite(self, serverP);
      }

      const sprite = clientPlayers[id];
      sprite.setPosition(serverP.x, serverP.y);
      sprite.setRotation(serverP.rotation);

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
  // LOCAL MOVEMENT for fallback player:
  if (localPlayerSprite) {
    const body = localPlayerSprite.body;

    // turn
    if (cursors.left.isDown) {
      body.angularVelocity = -300;
    } else if (cursors.right.isDown) {
      body.angularVelocity = 300;
    } else {
      body.angularVelocity = 0;
    }

    // thrust
    if (cursors.up.isDown) {
      this.physics.velocityFromRotation(
        localPlayerSprite.rotation + 1.5,
        200,
        body.acceleration
      );
    } else {
      localPlayerSprite.setAcceleration(0);
    }

    // wrap
    this.physics.world.wrap(localPlayerSprite, 5);
  }

  // SEND INPUT STATE TO SERVER (future authoritative mode)
  const inputPayload = {
    left: cursors.left.isDown,
    right: cursors.right.isDown,
    up: cursors.up.isDown
  };
  socket.emit('playerInput', inputPayload);

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
    sprite = scene.physics.add
      .image(playerInfo.x, playerInfo.y, 'ship')
      .setOrigin(0.5, 0.5)
      .setDisplaySize(53, 40);

    // tint by team if you want
    if (playerInfo.team === 'red') {
      sprite.setTint(0xff4444);
    } else if (playerInfo.team === 'blue') {
      sprite.setTint(0x4444ff);
    }

    clientPlayers[playerInfo.playerId] = sprite;
  }

  sprite.setPosition(playerInfo.x, playerInfo.y);
  sprite.setRotation(playerInfo.rotation);

  return sprite;
}

// called when we overlap localPlayerSprite with starSprite
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
