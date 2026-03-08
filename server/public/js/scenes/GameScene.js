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
import ShootingStarRenderer from '../managers/ShootingStarRenderer.js';
import BulletRenderer from '../managers/BulletRenderer.js';

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    // Entity manager for ships
    this.entityManager = null;

    // Bullet renderer
    this.bulletRenderer = null;

    // Shooting cooldown (client-side rate limiter to avoid spamming server)
    this._lastShootTime = 0;

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

    // Backdrop
    this.load.image('backdrop', GameConfig.assets.backdrop);

    // Bullet
    this.load.image('bullet', GameConfig.assets.bullet);

    // HUD
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

    // Generate soft glow particle texture for ship trails
    const glowCanvas = this.textures.createCanvas('glow_particle', 32, 32);
    const ctx = glowCanvas.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    glowCanvas.refresh();

    // Add tiled backdrop covering the entire world
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'backdrop')
      .setOrigin(0, 0)
      .setDepth(-1);

    // Shooting star renderer
    this.shootingStars = new ShootingStarRenderer(this, networkManager.getSocket());
    this.shootingStars.init();

    // Bullet renderer
    this.bulletRenderer = new BulletRenderer(this, networkManager.getSocket());
    this.bulletRenderer.init();

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

    // Set up socket event handlers is enough — session auth means server
    // already knows our username on connect, no setPlayerName needed.
  }

  /**
   * Update loop
   */
  update(time, delta) {
    // Shooting stars run regardless of game state
    this.shootingStars.update(delta);

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

      // Handle shooting (spacebar)
      if (inputManager.isShootPressed()) {
        const now = Date.now();
        if (now - this._lastShootTime >= GameConfig.weapons.fireRate) {
          this._lastShootTime = now;
          networkManager.emitShoot();
        }
      }
    }

    // Update minimap
    const socketId = gameState.getSocketId();
    const minimapData = this.entityManager ? this.entityManager.getMinimapData() : {};

    uiManager.updateMinimap({
      players: minimapData,
      myId: socketId
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

    // Player killed
    socket.on('playerKilled', (data) => {
      const ship = this.entityManager.getShip(data.victimId);
      if (ship && ship.sprite) {
        ship.sprite.setAlpha(0.3);
      }
    });

    // Player respawned
    socket.on('playerRespawned', (data) => {
      const ship = this.entityManager.getShip(data.playerId);
      if (ship) {
        if (ship.sprite) {
          ship.sprite.setAlpha(1);
        }
        // Snap to new position
        ship.x = data.x;
        ship.y = data.y;
        ship.serverState.x = data.x;
        ship.serverState.y = data.y;
        if (this.entityManager.isLocalPlayer(data.playerId)) {
          ship.predicted.x = data.x;
          ship.predicted.y = data.y;
          ship.predicted.vx = 0;
          ship.predicted.vy = 0;
        }
      }
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
