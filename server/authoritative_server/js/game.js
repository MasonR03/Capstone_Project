// Keeps track of the players there.
const players = {};

// A very simple game config from Phaser.
const config = {
  type: Phaser.HEADLESS, // This will make it so theres no rendering, but just physics and logic
  parent: 'phaser-example',
  width: 800, // world width
  height: 600, // world height
  physics: {
    default: 'arcade',
    arcade: {
      debug: false, // true will show hitboxes.
      gravity: { y: 0 } // top-down style movement.
    }
  },
  scene: {
    preload: preload,
    create: create,
    update: update
  },
  autoFocus: false
};


// loads the assets to the server
function preload() {
  this.load.image('ship', 'assets/spaceShips_001.png');
  this.load.image('star', 'assets/star_gold.png');
}

function create() {
  const self = this;
  // physics group that holds the ship bodies
  this.players = this.physics.add.group();

  // simple score system
  this.scores = {
    blue: 0,
    red: 0
  };

  this.star = this.physics.add.image(Math.floor(Math.random() * 700) + 50, Math.floor(Math.random() * 500) + 50, 'star');
  // player bouncing when colliding
  this.physics.add.collider(this.players);

  // check to see if player overlaps the star
  this.physics.add.overlap(this.players, this.star, function (star, player) {
    // figures out the player's team and add score
    if (players[player.playerId].team === 'red') {
      self.scores.red += 10;
    } else {
      self.scores.blue += 10;
    }
    self.star.setPosition(Math.floor(Math.random() * 700) + 50, Math.floor(Math.random() * 500) + 50);
    io.emit('updateScore', self.scores); // allows the scorre to be changed
    io.emit('starLocation', { x: self.star.x, y: self.star.y }); // new star pos.
  });

  // listens to new player connections
  io.on('connection', function (socket) {
    console.log('a user connected');
    // create a new player and add it to our players object
    players[socket.id] = {
      rotation: 0,
      x: Math.floor(Math.random() * 700) + 50,
      y: Math.floor(Math.random() * 500) + 50,
      playerId: socket.id,
      // randomly assigned teams
      team: (Math.floor(Math.random() * 2) == 0) ? 'red' : 'blue',
      // store input state coming from the client.
      input: {
        left: false,
        right: false,
        up: false
      }
    };
    // add player to server
    addPlayer(self, players[socket.id]);
    // send the players object to the new player
    socket.emit('currentPlayers', players);
    // update all other players of the new player
    socket.broadcast.emit('newPlayer', players[socket.id]);

    // send the star object to the new player
    socket.emit('starLocation', { x: self.star.x, y: self.star.y });
    // send the current scores
    socket.emit('updateScore', self.scores);

    // when a player moves, update the player data
    socket.on('playerInput', function (inputData) {
      handlePlayerInput(self, socket.id, inputData);
    });

    socket.on('disconnect', function () {
      console.log('user disconnected');
      // remove player from server
      removePlayer(self, socket.id);
      // remove this player from our players object
      delete players[socket.id];
  // emit a message to all players to remove this player
  // 'disconnect' is a reserved Socket.IO event name; use a custom event instead
  io.emit('playerDisconnected', socket.id);
    });
  });
}

function update() {
  // update each player based on their stored input and broadcast positions
  this.players.getChildren().forEach((player) => {
    const input = players[player.playerId].input;
    // rotaion / turning
    if (input.left) {
      player.setAngularVelocity(-300);
    } else if (input.right) {
      player.setAngularVelocity(300);
    } else {
      player.setAngularVelocity(0);
    }

    // thrust forward in the direction the ship is facing
    if (input.up) {
      // physics.velocityFromRotation(angle, speed, outVec)
      this.physics.velocityFromRotation(player.rotation + 1.5, 200, player.body.acceleration);
    } else {
      player.setAcceleration(0);
    }

    // sync the authoritative data 
    players[player.playerId].x = player.x;
    players[player.playerId].y = player.y;
    players[player.playerId].rotation = player.rotation;
  });

  // wrap around world edges with a 5px padding
  this.physics.world.wrap(this.players, 5);
  // broadcast updated player positions/rotations to all clients
  io.emit('playerUpdates', players);
}

// Store latest inputs from a specific client so update() can apply them
function handlePlayerInput(self, playerId, input) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      players[player.playerId].input = input;
    }
  });
}

// helper to get a random in-range position
// NOTE this doesn't seem to be used?
function randomPosition(max) {
  return Math.floor(Math.random() * max) + 50;
}

// Spawns a physics sprite for the player and configures movement limits
function addPlayer(self, playerInfo) {
  const player = self.physics.add.image(playerInfo.x, playerInfo.y, 'ship')
  .setOrigin(0.5, 0.5)
  .setDisplaySize(53, 40); // scale the ship sprite

  // movement turning
  player.setDrag(100);
  player.setAngularDrag(100);
  player.setMaxVelocity(200);
  // attach the socket id to the physics body so we can map back
  player.playerId = playerInfo.playerId;
  // add to the physics group
  self.players.add(player);
}

// Destroys the physics sprite when someone leaves
function removePlayer(self, playerId) {
  self.players.getChildren().forEach((player) => {
    if (playerId === player.playerId) {
      player.destroy();
    }
  });
}

// Start the Phaser "game loop" running in headless mode
const game = new Phaser.Game(config);
// Let whatever bootstraps this know the server-side game is initialized
window.gameLoaded();
