// ~~~ Server authoritative state ~~~
// Keeps track of all connected players by socket id
const players = {};

// Border buffer distance - how far from edge to stop ships
const BORDER_BUFFER = 20;

// ~~~ Phaser server config ~~~
// This Phaser instance runs in jsdom with HEADLESS mode.
// It simulates physics and game rules and broadcasts state to clients.
// Rendering / HUD happens in the browser client, not here.
const config = {
  type: Phaser.HEADLESS,           // no rendering, just logic and physics
  parent: 'phaser-example',
  width: 800,                      // world width (you can grow this later)
  height: 600,                     // world height
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
      gravity: { y: 0 }            // top-down, zero gravity
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  autoFocus: false
};

// ~~~ Preload ~~~
// Load assets so Phaser knows their sizes for physics bodies.
// Even headless Phaser still uses frame data for body size.
function preload() {
  this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.image('star', 'assets/star_gold.png');
}

// ~~~ Create ~~~
function create() {
  const self = this;

  // physics group for all player ships
  this.players = this.physics.add.group();

  // simple team score
  this.scores = {
    blue: 0,
    red: 0
  };

  // spawn the star pickup somewhere in the map
  this.star = this.physics.add.image(
    Math.floor(Math.random() * 700) + 50,
    Math.floor(Math.random() * 500) + 50,
    'star'
  );

  // make players collide with each other
  this.physics.add.collider(this.players);

  // detect when a player overlaps (touches) the star
  this.physics.add.overlap(this.players, this.star, function (player, star) {
    // add score to that player's team
    if (players[player.playerId].team === 'red') {
      self.scores.red += 10;
    } else {
      self.scores.blue += 10;
    }

    // move the star somewhere else
    self.star.setPosition(
      Math.floor(Math.random() * 700) + 50,
      Math.floor(Math.random() * 500) + 50
    );

    // broadcast updated score + star position to everyone
    io.emit('updateScore', self.scores);
    io.emit('starLocation', { x: self.star.x, y: self.star.y });
  });

  // ~~~ Socket handlers ~~~
  // each web client that connects to socket.io becomes a player
  io.on('connection', function (socket) {
    console.log('a user connected', socket.id);

    // create player data in authoritative state
    players[socket.id] = {
      rotation: 0,
      x: Math.floor(Math.random() * 700) + 50,
      y: Math.floor(Math.random() * 500) + 50,
      playerId: socket.id,
      team: (Math.floor(Math.random() * 2) === 0) ? 'red' : 'blue',
      input: {
        left: false,
        right: false,
        up: false,
        down: false
      },
      // stats (these are what power your HUD in clientGame.js)
      hp: 100,
      maxHp: 100,
      xp: 0,
      maxXp: 100
    };

    // spawn a physics body for this player
    addPlayer(self, players[socket.id]);

    // send the whole current players list to JUST the new player
    socket.emit('currentPlayers', players);

    // tell everyone else "hey here's a new player"
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // send star position + score to the new player
    socket.emit('starLocation', { x: self.star.x, y: self.star.y });
    socket.emit('updateScore', self.scores);

    // listen for this player's inputs so we can simulate them
    socket.on('playerInput', function (inputData) {
      handlePlayerInput(self, socket.id, inputData);
    });

    // player disconnects
    socket.on('disconnect', function () {
      console.log('user disconnected', socket.id);

      // remove physics body from the scene
      removePlayer(self, socket.id);

      // remove from our authoritative object
      delete players[socket.id];

      // tell all clients to delete this sprite
      io.emit('playerDisconnected', socket.id);
    });
  });
}

// ~~~ Update ~~~
// runs every tick server-side
function update() {
  // apply movement for each ship based on its stored input flags
  this.players.getChildren().forEach((player) => {
    const input = players[player.playerId].input;

    // turn
    if (input.left) {
      player.setAngularVelocity(-300);
    } else if (input.right) {
      player.setAngularVelocity(300);
    } else {
      player.setAngularVelocity(0);
    }

    // thrust forward
    if (input.up) {
      // rotate + thrust in facing direction
      this.physics.velocityFromRotation(
        player.rotation + 1.5,
        200,
        player.body.acceleration
      );
    }
    // reverse thruster - decelerate to zero
    else if (input.down) {
      // Apply deceleration proportional to current velocity
      const currentVel = player.body.velocity.length();
      if (currentVel > 50) {
        // Normal deceleration for higher speeds
        const decelX = -player.body.velocity.x * 0.1;
        const decelY = -player.body.velocity.y * 0.1;
        player.body.setAcceleration(decelX * 10, decelY * 10);
      } else if (currentVel > 5) {
        // Aggressive deceleration when below 50 velocity
        const decelX = -player.body.velocity.x * 0.3;
        const decelY = -player.body.velocity.y * 0.3;
        player.body.setAcceleration(decelX * 10, decelY * 10);
      } else {
        // When nearly stopped, set velocity to zero
        player.body.setVelocity(0, 0);
        player.body.setAcceleration(0, 0);
      }
    } else {
      player.setAcceleration(0);
    }

    // sync updated position/rotation back to the authoritative state
    players[player.playerId].x = player.x;
    players[player.playerId].y = player.y;
    players[player.playerId].rotation = player.rotation;
  });

  // clamp players to world bounds (with buffer from edge)
  this.players.getChildren().forEach((player) => {
    // Stop at borders instead of wrapping (with buffer)
    if (player.x < BORDER_BUFFER) {
      player.x = BORDER_BUFFER;
      player.setVelocityX(0);
    } else if (player.x > 800 - BORDER_BUFFER) {
      player.x = 800 - BORDER_BUFFER;
      player.setVelocityX(0);
    }

    if (player.y < BORDER_BUFFER) {
      player.y = BORDER_BUFFER;
      player.setVelocityY(0);
    } else if (player.y > 600 - BORDER_BUFFER) {
      player.y = 600 - BORDER_BUFFER;
      player.setVelocityY(0);
    }
  });

  // broadcast authoritative player states to all clients
  io.emit('playerUpdates', players);
}

// ~~~ Handle player input ~~~
// store most recent inputs from a client; update() will apply them
function handlePlayerInput(self, playerId, input) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      players[player.playerId].input = input;
    }
  });
}

// ~~~ Add player ~~~
// actually create the Arcade Physics body for a new player
function addPlayer(self, playerInfo) {
  const player = self.physics.add
    .image(playerInfo.x, playerInfo.y, 'ship')
    .setOrigin(0.5, 0.5)
    .setDisplaySize(53, 40);

  player.setDrag(0);
  player.setAngularDrag(0);
  player.setMaxVelocity(400);

  player.playerId = playerInfo.playerId;
  self.players.add(player);
}

// ~~~ Remove player ~~~
function removePlayer(self, playerId) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      player.destroy();
    }
  });
}

// ~~~ Boot the headless Phaser sim ~~~
const game = new Phaser.Game(config);

// let the outer server (index.js) know we finished booting
if (typeof window !== 'undefined' && typeof window.gameLoaded === 'function') {
  window.gameLoaded();
}
