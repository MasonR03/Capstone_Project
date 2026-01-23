/**
 * GameScene - Main Phaser scene for the game
 *
 * Handles preload, create, and update lifecycle.
 * Coordinates with managers for state, network, input, and UI.
 */

import GameConfig from '../config/GameConfig.js';
import gameState from '../managers/GameStateManager.js';
import networkManager from '../managers/NetworkManager.js';
import inputManager from '../managers/InputManager.js';
import uiManager from '../managers/UIManager.js';

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    // Local references
    this.minimap = null;
    this.starSprites = [];

    // Debug logging throttle
    this._lastClassLog = 0;
  }

  /**
   * Preload assets
   */
  preload() {
    console.log('Preloading assets...');

    // Ships
    this.load.image('ship_hunter', GameConfig.assets.ships.hunter);
    this.load.image('ship_tanker', GameConfig.assets.ships.tanker);

    // Star + HUD
    this.load.image('star', GameConfig.assets.star);
    this.load.image('hudBars', GameConfig.assets.hudBars);

    // Level menu
    this.load.image('menuIn', GameConfig.assets.menuIn);
    this.load.image('menuOut', GameConfig.assets.menuOut);

    this.load.on('complete', () => console.log('Assets loaded successfully'));
    this.load.on('loaderror', (file) => console.error('Error loading asset:', file.key, file.url));
  }

  /**
   * Create scene elements
   */
  create() {
    console.log('GameScene create() running');

    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;

    // Set world bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Add world border visuals
    this._addWorldBorders();

    // Center camera initially
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.cameras.main.setZoom(GameConfig.camera.initialZoom);

    // Initialize input manager
    inputManager.init(this);

    // Initialize UI manager
    uiManager.init(this, this.game, {
      world: { width: WORLD_W, height: WORLD_H }
    });

    // Update scores from state
    uiManager.updateScores(gameState.getServerScores());

    // Create stars
    this._createStars();

    // Apply pending star positions from network
    gameState.applyPendingStarPositions();

    // Open class picker
    uiManager.openClassPicker((pickedKey) => {
      const classKey = GameConfig.shipClasses[pickedKey] ? pickedKey : GameConfig.defaultClass;
      gameState.setClassChoice(classKey);
      console.log('Picked class:', classKey);

      // Enable input now that class is chosen
      inputManager.enable();

      // Apply visual immediately to local player sprite (if it exists)
      const socketId = gameState.getSocketId();
      const mySprite = gameState.getPlayerSprite(socketId);
      if (mySprite) {
        this._applyClassVisual(mySprite, classKey);
      }

      // Send to server if connected
      if (networkManager.isConnected()) {
        networkManager.emitChooseClass(classKey);
      } else {
        console.warn('Socket not ready, will send class on connect');
      }
    });

    // Set up socket event handlers
    this._setupSocketHandlers();

    // Subscribe to state changes
    this._setupStateSubscriptions();

    // Request current players (in case we missed the initial event)
    // The server sends currentPlayers when setPlayerName is emitted
    if (networkManager.isConnected()) {
      const myId = gameState.getMyId();
      if (myId) {
        networkManager.emit('setPlayerName', myId);
      }
    }
  }

  /**
   * Update loop
   */
  update(time, delta) {
    // Don't process until class is chosen
    if (!gameState.isClassChosen()) return;

    // Ensure camera is following (fallback for timing issues)
    this._ensureCameraFollow();

    // Send input to server
    if (networkManager.isConnected()) {
      const input = inputManager.getCurrentInput();
      networkManager.emitPlayerInput(input);
    }

    // Update minimap
    const socketId = gameState.getSocketId();
    const players = gameState.getAllPlayerSprites();
    const stars = (this.starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }));

    uiManager.updateMinimap({
      players,
      myId: socketId,
      stars
    });

    // UI tick
    uiManager.tick(this.cameras.main);
  }

  /**
   * Add visual border rectangles around the world
   * @private
   */
  _addWorldBorders() {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const borderWidth = GameConfig.world.borderWidth;
    const borderColor = 0x880000;

    // Top
    this.add.rectangle(WORLD_W / 2, borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    // Bottom
    this.add.rectangle(WORLD_W / 2, WORLD_H - borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    // Left
    this.add.rectangle(borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
    // Right
    this.add.rectangle(WORLD_W - borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
  }

  /**
   * Create star sprites
   * @private
   */
  _createStars() {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const starConfig = GameConfig.stars;

    this.starSprites = [];

    for (let i = 0; i < starConfig.count; i++) {
      const star = this.add.image(WORLD_W / 2 + (i * 100 - 200), WORLD_H / 2, 'star');
      star.setOrigin(0.5, 0.5);
      star.setDepth(0);
      star.setScale(starConfig.scale);
      star.setAlpha(1.0);

      // Pulsing animation
      this.tweens.add({
        targets: star,
        scale: starConfig.pulseScale,
        alpha: starConfig.pulseAlpha,
        duration: starConfig.pulseDuration,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });

      this.starSprites.push(star);
      gameState.addStarSprite(star);
    }
  }

  /**
   * Set up socket event handlers
   * @private
   */
  _setupSocketHandlers() {
    const socket = networkManager.getSocket();
    if (!socket) {
      console.warn('GameScene: Socket not available for handlers');
      return;
    }

    // Current players (initial state)
    socket.on('currentPlayers', (players) => {
      console.log('currentPlayers:', Object.keys(players).length);

      Object.keys(players).forEach((id) => {
        this._addOrUpdatePlayerSprite(players[id]);
      });

      this._ensureCameraFollow();
    });

    // New player joined
    socket.on('newPlayer', (playerInfo) => {
      this._addOrUpdatePlayerSprite(playerInfo);
    });

    // Player disconnected
    socket.on('playerDisconnected', (playerId) => {
      gameState.removePlayer(playerId);
    });

    // Player updates (game tick)
    socket.on('playerUpdates', (data) => {
      const serverPlayers = data.players || data;

      Object.keys(serverPlayers).forEach((id) => {
        const serverP = serverPlayers[id];

        // Create sprite if doesn't exist
        if (!gameState.getPlayerSprite(id)) {
          this._addOrUpdatePlayerSprite(serverP);
        }

        const sprite = gameState.getPlayerSprite(id);
        if (sprite) {
          // Determine class
          const socketId = gameState.getSocketId();
          const chosenClassKey = gameState.getChosenClassKey();
          const effectiveClassKey =
            (serverP && GameConfig.shipClasses[serverP.classKey] ? serverP.classKey : null) ||
            (id === socketId ? chosenClassKey : null) ||
            GameConfig.defaultClass;

          this._applyClassVisual(sprite, effectiveClassKey);

          // Update position
          sprite.x = serverP.x;
          sprite.y = serverP.y;
          sprite.rotation = serverP.rotation;

          // Store velocity for debug
          sprite.velocityX = serverP.velocityX || 0;
          sprite.velocityY = serverP.velocityY || 0;

          // Update name text
          const nameText = gameState.getPlayerNameText(id);
          if (nameText) {
            nameText.x = serverP.x;
            nameText.y = serverP.y - GameConfig.sprites.nameOffset;
            if (serverP.playerName) nameText.setText(serverP.playerName);
          }
        }

        // Update local player stats
        if (id === gameState.getSocketId()) {
          gameState.updateLocalPlayerStats({
            hp: serverP.hp,
            maxHp: serverP.maxHp,
            xp: serverP.xp,
            maxXp: serverP.maxXp
          });

          uiManager.updateHpXp(gameState.getLocalPlayerStats());

          // Throttled debug logging
          if (!this._lastClassLog || Date.now() - this._lastClassLog > 1500) {
            console.log('👀 server classKey:', serverP.classKey, '| local chosen:', chosenClassKey);
            this._lastClassLog = Date.now();
          }
        }
      });

      this._ensureCameraFollow();
    });
  }

  /**
   * Set up state subscriptions
   * @private
   */
  _setupStateSubscriptions() {
    // Score updates
    gameState.on('serverScores', (scores) => {
      uiManager.updateScores(scores);
    });

    // Star position updates
    gameState.on('starsUpdated', (starsInfo) => {
      if (starsInfo && this.starSprites.length > 0) {
        starsInfo.forEach((star, index) => {
          if (this.starSprites[index]) {
            this.starSprites[index].setPosition(star.x, star.y);
          }
        });
      }
    });
  }

  /**
   * Add or update a player sprite
   * @private
   */
  _addOrUpdatePlayerSprite(playerInfo) {
    const playerId = playerInfo.playerId;
    let sprite = gameState.getPlayerSprite(playerId);

    const socketId = gameState.getSocketId();
    const chosenClassKey = gameState.getChosenClassKey();

    const initialClass =
      (GameConfig.shipClasses[playerInfo.classKey] ? playerInfo.classKey : null) ||
      (playerId === socketId ? chosenClassKey : null) ||
      GameConfig.defaultClass;

    const cfg = GameConfig.shipClasses[initialClass] || GameConfig.shipClasses[GameConfig.defaultClass];

    if (!sprite) {
      console.log('Creating sprite for:', playerInfo.playerName || playerId, 'class:', initialClass);

      sprite = this.add.sprite(playerInfo.x, playerInfo.y, cfg.spriteKey);
      sprite._classKey = initialClass;
      sprite.setOrigin(0.5, 0.5);
      sprite.setDisplaySize(GameConfig.sprites.ship.width, GameConfig.sprites.ship.height);

      // Team tint
      if (playerInfo.team === 'red') sprite.setTint(0xff4444);
      else if (playerInfo.team === 'blue') sprite.setTint(0x4444ff);

      sprite.setDepth(1);
      sprite.setVisible(true);
      sprite.setActive(true);

      gameState.setPlayerSprite(playerId, sprite);

      // Store player name
      if (playerInfo.playerName) {
        gameState.setPlayerName(playerId, playerInfo.playerName);
      }

      // Create name text
      const nameText = this.add.text(
        playerInfo.x,
        playerInfo.y - GameConfig.sprites.nameOffset,
        playerInfo.playerName || playerId,
        {
          font: '16px Orbitron, sans-serif',
          fill: '#00ffff',
          align: 'center',
          stroke: '#000000',
          strokeThickness: 2
        }
      );
      nameText.setOrigin(0.5, 0.5);
      nameText.setDepth(2);
      gameState.setPlayerNameText(playerId, nameText);
    }

    return sprite;
  }

  /**
   * Apply class visual to sprite
   * @private
   */
  _applyClassVisual(sprite, classKey) {
    const key = GameConfig.shipClasses[classKey] ? classKey : GameConfig.defaultClass;
    const cfg = GameConfig.shipClasses[key] || GameConfig.shipClasses[GameConfig.defaultClass];

    if (sprite._classKey !== key) {
      sprite.setTexture(cfg.spriteKey);
      sprite.setDisplaySize(GameConfig.sprites.ship.width, GameConfig.sprites.ship.height);
      sprite._classKey = key;
    }
  }

  /**
   * Ensure camera follows local player
   * @private
   */
  _ensureCameraFollow() {
    if (gameState.isCameraFollowSet()) return;
    if (!this.cameras || !this.cameras.main) return;

    const socketId = gameState.getSocketId();
    if (!socketId) return;

    const mySprite = gameState.getPlayerSprite(socketId);
    if (mySprite) {
      this.cameras.main.startFollow(
        mySprite,
        true,
        GameConfig.camera.followLerpX,
        GameConfig.camera.followLerpY
      );
      gameState.setCameraFollowSet(true);
      console.log('📷 Camera now following my sprite:', socketId);
    }
  }
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.GameScene = GameScene;
}

export default GameScene;
