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

    // Generate colored glow textures for shooting stars
    const starGlowDefs = {
      white:  [255, 255, 255],
      blue:   [160, 190, 255],
      purple: [210, 160, 255],
      red:    [255, 160, 160],
      yellow: [255, 240, 170],
      orange: [255, 190, 130]
    };

    Object.entries(starGlowDefs).forEach(([name, rgb]) => {
      const c = this.textures.createCanvas(`star_${name}`, 32, 32);
      const cx = c.getContext();
      const g = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`);
      g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      cx.fillStyle = g;
      cx.fillRect(0, 0, 32, 32);
      c.refresh();
    });

    // Create one emitter per color, all behind game objects above backdrop
    const starKeys = Object.keys(starGlowDefs);
    let _starScale = 0.4;
    this._starEmitters = starKeys.map((name) => {
      const particles = this.add.particles(`star_${name}`);
      particles.setDepth(-0.5);
      return particles.createEmitter({
        speed: { min: 0, max: 5 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1800,
        blendMode: 'ADD',
        frequency: -1,
        emitCallback: (particle) => {
          particle.scaleX = _starScale;
          particle.scaleY = _starScale;
        }
      });
    });
    this._starScale = _starScale;
    this._setStarScale = (s) => { _starScale = s; };
    this._activeStars = [];
    this._starSpawnTimer = 0;

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
    this._updateShootingStars(delta);

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
   * Update shooting stars — spawn outside map, travel across, remove on exit
   * @private
   */
  _updateShootingStars(delta) {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const margin = 100;
    const emitInterval = 40;
    const spawnInterval = 1000;

    // Spawn new stars
    this._starSpawnTimer += delta;
    if (this._starSpawnTimer >= spawnInterval) {
      this._starSpawnTimer -= spawnInterval;

      let startX, startY, angleRad;

      if (Math.random() < 0.2) {
        // 20% spawn inside the map, random direction
        startX = Phaser.Math.Between(100, WORLD_W - 100);
        startY = Phaser.Math.Between(100, WORLD_H - 100);
        angleRad = Phaser.Math.FloatBetween(0, 360) * (Math.PI / 180);
      } else {
        // 80% spawn outside an edge, angled inward
        const edge = Phaser.Math.Between(0, 3);
        let minAngle, maxAngle;

        switch (edge) {
          case 0: // top
            startX = Phaser.Math.Between(0, WORLD_W);
            startY = -margin;
            minAngle = 30; maxAngle = 150;
            break;
          case 1: // right
            startX = WORLD_W + margin;
            startY = Phaser.Math.Between(0, WORLD_H);
            minAngle = 120; maxAngle = 240;
            break;
          case 2: // bottom
            startX = Phaser.Math.Between(0, WORLD_W);
            startY = WORLD_H + margin;
            minAngle = 210; maxAngle = 330;
            break;
          case 3: // left
            startX = -margin;
            startY = Phaser.Math.Between(0, WORLD_H);
            minAngle = -60; maxAngle = 60;
            break;
        }

        angleRad = Phaser.Math.FloatBetween(minAngle, maxAngle) * (Math.PI / 180);
      }
      const speed = Phaser.Math.FloatBetween(15, 120);
      const emitters = this._starEmitters;
      const baseScale = Math.random() < 0.1
        ? Phaser.Math.FloatBetween(0.4, 0.7)
        : Phaser.Math.FloatBetween(0.1, 0.25);

      this._activeStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angleRad) * speed,
        vy: Math.sin(angleRad) * speed,
        emitter: emitters[Math.floor(Math.random() * emitters.length)],
        scale: baseScale,
        baseScale: baseScale,
        fades: Math.random() < 0.5,
        age: 0,
        // ~30% of stars curve; angular velocity in rad/s
        angularV: Math.random() < 0.6
          ? Phaser.Math.FloatBetween(-0.5, 0.5)
          : 0,
        emitTimer: 0
      });
    }

    // Update active stars
    for (let i = this._activeStars.length - 1; i >= 0; i--) {
      const star = this._activeStars[i];
      star.emitTimer += delta;

      while (star.emitTimer >= emitInterval) {
        star.emitTimer -= emitInterval;
        const dt = emitInterval / 1000;
        star.age += dt;

        // Apply curve — rotate velocity vector
        if (star.angularV !== 0) {
          const cos = Math.cos(star.angularV * dt);
          const sin = Math.sin(star.angularV * dt);
          const nvx = star.vx * cos - star.vy * sin;
          const nvy = star.vx * sin + star.vy * cos;
          star.vx = nvx;
          star.vy = nvy;
        }

        star.x += star.vx * dt;
        star.y += star.vy * dt;

        // Remove if outside map bounds
        if (star.x < -margin || star.x > WORLD_W + margin ||
            star.y < -margin || star.y > WORLD_H + margin) {
          this._activeStars.splice(i, 1);
          break;
        }

        // Fading stars shrink and dim over time
        if (star.fades) {
          const fadeT = Math.min(star.age / 15, 1); // fully faded by 15s
          star.scale = star.baseScale * (1 - fadeT);
          if (star.scale < 0.02) {
            this._activeStars.splice(i, 1);
            break;
          }
        }

        this._setStarScale(star.scale);
        star.emitter.emitParticleAt(star.x, star.y, 1);
      }
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
