// ~~~~ Phaser config ~~~~
var config = {
  type: Phaser.AUTO,
  parent: 'phaser-example',
  width: 800,
  height: 600,
  scene: {
    preload: preload,
    create: create,
    update: update
  }
};

// ~~~~ ship classes (server authoritative) ~~~~
const SHIP_CLASSES = {
  hunter: { maxHp: 90, speed: 260, accel: 220 },
  tanker: { maxHp: 160, speed: 180, accel: 160 }
};

const DEFAULT_CLASS = 'hunter';

function safeClassKey(classKey) {
  return SHIP_CLASSES[classKey] ? classKey : DEFAULT_CLASS;
}

function classToSpriteKey(classKey) {
  const k = safeClassKey(classKey);
  return 'ship_' + k; // ship_hunter / ship_tanker
}

function applyClass(player, classKey) {
  const k = safeClassKey(classKey);
  const cfg = SHIP_CLASSES[k];

  player.classKey = k;

  // hp / maxHp
  player.maxHp = cfg.maxHp;
  if (player.hp === undefined || player.hp > player.maxHp) player.hp = player.maxHp;

  // movement stats
  player.speed = cfg.speed;
  player.accel = cfg.accel;
}

var game = new Phaser.Game(config);

// ~~~~ Preload ~~~~
function preload() {
  // ships
  this.load.image('ship_hunter', 'assets/HunterShip.png');
  this.load.image('ship_tanker', 'assets/TankerShip.png');

  // fallback/legacy
  this.load.image('otherPlayer', 'assets/enemyBlack5.png');

  // star + hud
  this.load.image('star', 'assets/Star.png');
  this.load.image('hudBars', 'assets/Bar.png');
}

// ~~~~ Create ~~~~
function create() {
  var self = this;

  // socket + players
  this.socket = io();
  this.players = this.add.group();

  // score text
  this.blueScoreText = this.add.text(16, 16, '', { fontSize: '32px', fill: '#0000FF' });
  this.redScoreText  = this.add.text(584, 16, '', { fontSize: '32px', fill: '#FF0000' });

  // ~~~~ server -> client updates ~~~~
  this.socket.on('playerUpdates', function (players) {
    Object.keys(players).forEach(function (id) {
      const p = players[id];

      self.players.getChildren().forEach(function (player) {
        if (p.playerId !== player.playerId) return;

        // swap ship if class changed
        const newSpriteKey = classToSpriteKey(p.classKey);
        if (player._spriteKey !== newSpriteKey) {
          player.setTexture(newSpriteKey);
          player.setDisplaySize(53, 40);
          player._spriteKey = newSpriteKey;
        }

        // position + rotation
        player.setRotation(p.rotation);
        player.setPosition(p.x, p.y);
      });
    });
  });

  this.socket.on('updateScore', function (scores) {
    self.blueScoreText.setText('Blue: ' + scores.blue);
    self.redScoreText.setText('Red: ' + scores.red);
  });

  this.socket.on('starLocation', function (starLocation) {
    if (!self.star) self.star = self.add.image(starLocation.x, starLocation.y, 'star');
    else self.star.setPosition(starLocation.x, starLocation.y);
  });

  // ~~~~ player spawn / remove ~~~~
  this.socket.on('currentPlayers', function (players) {
    Object.keys(players).forEach(function (id) {
      const p = players[id];
      const spriteKey = classToSpriteKey(p.classKey);
      displayPlayers(self, p, spriteKey);
    });
  });

  this.socket.on('newPlayer', function (playerInfo) {
    const spriteKey = classToSpriteKey(playerInfo.classKey);
    displayPlayers(self, playerInfo, spriteKey);
  });

  this.socket.on('playerDisconnected', function (playerId) {
    self.players.getChildren().forEach(function (player) {
      if (playerId === player.playerId) player.destroy();
    });
  });

  // ~~~~ NOTE: chooseClass is a CLIENT->SERVER emit, not a server->client on ~~~~
  // If you have this event working in public/clientGame.js already, leave it there.
  // This legacy file doesn't need a socket.on('chooseClass').

  // ~~~~ input state (legacy) ~~~~
  this.cursors = this.input.keyboard.createCursorKeys();
  this.leftKeyPressed = false;
  this.rightKeyPressed = false;
  this.upKeyPressed = false;
}

// ~~~~ Update ~~~~
function update() {
  const left = this.leftKeyPressed;
  const right = this.rightKeyPressed;
  const up = this.upKeyPressed;

  if (this.cursors.left.isDown) {
    this.leftKeyPressed = true;
    this.rightKeyPressed = false;
  } else if (this.cursors.right.isDown) {
    this.rightKeyPressed = true;
    this.leftKeyPressed = false;
  } else {
    this.leftKeyPressed = false;
    this.rightKeyPressed = false;
  }

  if (this.cursors.up.isDown) this.upKeyPressed = true;
  else this.upKeyPressed = false;

  // send only when changed
  if (left !== this.leftKeyPressed || right !== this.rightKeyPressed || up !== this.upKeyPressed) {
    this.socket.emit('playerInput', {
      left: this.leftKeyPressed,
      right: this.rightKeyPressed,
      up: this.upKeyPressed
    });
  }
}

// ~~~~ Create player sprite ~~~~
function displayPlayers(self, playerInfo, spriteKey) {
  const player = self.add
    .sprite(playerInfo.x, playerInfo.y, spriteKey)
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);

  // remember current texture
  player._spriteKey = spriteKey;

  // tint by team
  if (playerInfo.team === 'blue') player.setTint(0x0000ff);
  else player.setTint(0xff0000);

  player.playerId = playerInfo.playerId;
  self.players.add(player);
}
