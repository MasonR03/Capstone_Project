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
import ClientEntityManager from '../managers/ClientEntityManager.js';

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    // Entity manager for ships
    this.entityManager = null;

    // Local references
    this.starSprites = [];

    // Debug logging throttle
    this._lastClassLog = 0;

    // Camera follow flag
    this._cameraFollowSet = false;
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

    // Initialize entity manager
    this.entityManager = new ClientEntityManager(this);

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

    const dt = delta / 1000; // Convert to seconds

    // Ensure camera is following (fallback for timing issues)
    this._ensureCameraFollow();

    // Get current input
    const input = inputManager.getCurrentInput();

    // Apply prediction for local player (smooth movement)
    if (this.entityManager) {
      this.entityManager.applyLocalPrediction(input, dt);
      // Interpolate remote players
      this.entityManager.updateAll();
    }

    // Send input to server
    if (networkManager.isConnected()) {
      networkManager.emitPlayerInput(input);
    }

    // Update minimap
    const socketId = gameState.getSocketId();
    const minimapData = this.entityManager ? this.entityManager.getMinimapData() : {};
    const stars = (this.starSprites || []).map((s, i) => ({ id: i, x: s.x, y: s.y }));

    uiManager.updateMinimap({
      players: minimapData,
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

      const socketId = gameState.getSocketId();
      this.entityManager.setLocalPlayer(socketId);

      Object.keys(players).forEach((id) => {
        this.entityManager.addOrUpdateShip(players[id]);
      });

      this._ensureCameraFollow();
    });

    // New player joined
    socket.on('newPlayer', (playerInfo) => {
      this.entityManager.addOrUpdateShip(playerInfo);
    });

    // Player disconnected
    socket.on('playerDisconnected', (playerId) => {
      this.entityManager.removeShip(playerId);
    });

    // Player updates (game tick)
    socket.on('playerUpdates', (data) => {
      const serverPlayers = data.players;
      const socketId = gameState.getSocketId();

      // Ensure local player is set
      if (socketId && !this.entityManager.localPlayerId) {
        this.entityManager.setLocalPlayer(socketId);
      }

      // Process updates through entity manager
      this.entityManager.processServerUpdate(serverPlayers, {
        onLocalPlayerUpdate: (serverState) => {
          // Update local player stats for HUD
          gameState.updateLocalPlayerStats({
            hp: serverState.hp,
            maxHp: serverState.maxHp,
            xp: serverState.xp,
            maxXp: serverState.maxXp
          });

          uiManager.updateHpXp(gameState.getLocalPlayerStats());

          // Throttled debug logging
          const chosenClassKey = gameState.getChosenClassKey();
          if (!this._lastClassLog || Date.now() - this._lastClassLog > 1500) {
            console.log('server classKey:', serverState.classKey, '| local chosen:', chosenClassKey);
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
   * Ensure camera follows local player
   * @private
   */
  _ensureCameraFollow() {
    if (this._cameraFollowSet) return;
    if (!this.cameras || !this.cameras.main) return;
    if (!this.entityManager) return;

    const success = this.entityManager.setCameraToLocalPlayer(this.cameras.main);
    if (success) {
      this._cameraFollowSet = true;
      console.log('Camera now following local player');
    }
  }
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.GameScene = GameScene;
}

export default GameScene;
