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
import AsteroidRenderer from '../managers/AsteroidRenderer.js';
import {
  PLAYER_PROGRESS_DEFAULTS,
  cloneProgress
} from '../stats/stats.js';

class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });

    // Managers
    this.entityManager = null;
    this.bulletRenderer = null;
    this.asteroidRenderer = null;
    this._backdropLayers = [];
    this._activeBackdropIndex = 0;
    this._backdropCycleEvent = null;
    this._backdropFadeTween = null;
    this._borderTiles = [];
    this._borderCorners = [];

    // Client state
    this._lastShootTime = 0;
    this._lastClassLog = 0;
    this._cameraFollowSet = false;
    this._lastLocalHp = null;
    this._lastLocalMaxHp = null;
    this._damageCueTimer = null;
    this._damageTintTimer = null;
    this._shipHitTintTimers = new Map();
    this._boostCooldownMs = GameConfig.boost.cooldownMs;
    this._boostCooldownUntil = 0;
    this._lowHpWarningText = null;
    this._lowHpWarningTween = null;
    this._lowHpSound = null;
    this._lowHpActive = false;

    // Progress
    this.playerProgress = cloneProgress(PLAYER_PROGRESS_DEFAULTS);

    // Progress sync
    this._lastProgressSync = '';
    this._lastProgressSyncTime = 0;

    // Collectibles
    this.collectibleStars = null;
    this.collectibleStarsById = new Map();
    this._pendingStarCollects = new Map();
  }

     /**
   * Build the payload used to sync class and progress.
   *
   * @returns {Object}
   * @private
   */
  _buildClassSyncPayload() {
    const currentProgress = gameState.getPlayerProgress();
    const currentClassKey =
      currentProgress.selectedShip ||
      gameState.getChosenClassKey() ||
      GameConfig.defaultClass;

    return {
      classKey: currentClassKey,
      progress: currentProgress
    };
  }

  /**
   * Sync the current class and progress to the server.
   *
   * @private
   */
  _syncClassProgressToServer() {
    if (!networkManager.isConnected()) return;
    if (!gameState.isClassChosen()) return;

    const payload = this._buildClassSyncPayload();
    networkManager.emitChooseClass(payload);
  }

  /**
   * Preload assets.
   */
  preload() {
    console.log('Preloading assets...');

    // Ships
    this.load.image('ship_starter', GameConfig.assets.ships.starter);
    this.load.image('ship_hunter', GameConfig.assets.ships.hunter);
    this.load.image('ship_tanker', GameConfig.assets.ships.tanker);

    // Backdrop
    const backdrops = GameConfig.assets.backdrops || [GameConfig.assets.backdrop];
    backdrops.forEach((path, index) => {
      this.load.image(`backdrop_${index}`, path);
    });
    this.load.image('collectible_star', GameConfig.assets.collectibleStar);
    this.load.image('asteroid_belt', GameConfig.assets.asteroidBelt);
    this.load.image('asteroid', GameConfig.assets.asteroid);
    this.load.image('exploded_asteroid', GameConfig.assets.explodedAsteroid);

    // Bullet
    this.load.image('bullet', GameConfig.assets.bullet);
    this.load.audio('laser_fire', GameConfig.assets.laserSound);
    this.load.audio('player_hit', GameConfig.assets.hitSound);
    this.load.audio('low_hp', GameConfig.assets.lowHpSound);
    this.load.audio('boost_fire', GameConfig.assets.boostSound);
    this.load.audio('asteroid_boom', GameConfig.assets.asteroidBoom);
    this.load.audio('weapon_hit', GameConfig.assets.weaponHitSound);
    this.load.audio('level_up', GameConfig.assets.levelUpSound);
    this.load.audio('star_collect', GameConfig.assets.starCollectSound);

    // Level menu
    this.load.image('menuIn', GameConfig.assets.menuIn);
    this.load.image('menuOut', GameConfig.assets.menuOut);

    this.load.on('complete', () => console.log('Assets loaded successfully'));
    this.load.on('loaderror', (file) => console.error('Error loading asset:', file.key, file.url));
  }

  /**
   * Create scene elements.
   */
  create() {
    console.log('GameScene create() running');

    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;

    // World bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Glow particle texture
    const glowCanvas = this.textures.createCanvas('glow_particle', 32, 32);
    const ctx = glowCanvas.getContext();
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    glowCanvas.refresh();

    // Backdrop
    this._addBackdropLayers(WORLD_W, WORLD_H);

    // Effects
    this.shootingStars = new ShootingStarRenderer(this, networkManager.getSocket());
    this.shootingStars.init();

    this.bulletRenderer = new BulletRenderer(this, networkManager.getSocket());
    this.bulletRenderer.init();

    this.asteroidRenderer = new AsteroidRenderer(this, networkManager.getSocket());
    this.asteroidRenderer.init();

    // Borders
    this._addWorldBorders();

    // Camera
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.handleResize(this.sys.game.config.width, this.sys.game.config.height);

    // Managers
    this.entityManager = new ClientEntityManager(this);
    inputManager.init(this);

    uiManager.init(this, this.game, {
      world: { width: WORLD_W, height: WORLD_H },
      progress: this.playerProgress
    });

    gameState.setPlayerProgress(this.playerProgress);

    // Open class picker
    uiManager.openClassPicker((pickedKey) => {
      const classKey = this._isOwnedShip(pickedKey)
        ? pickedKey
        : (this.playerProgress.selectedShip || GameConfig.defaultClass);

      gameState.setClassChoice(classKey);
      this.playerProgress.selectedShip = classKey;
      gameState.setPlayerProgress(this.playerProgress);
      uiManager.setPlayerProgress(this.playerProgress);

      console.log('Picked class:', classKey);

      inputManager.enable();

      if (networkManager.isConnected()) {
        networkManager.emitChooseClass({
          classKey,
          progress: this.playerProgress
        });
      } else {
        console.warn('Socket not ready, will send class on connect');
      }
    }, {
      progress: this.playerProgress
    });

    // Collectible stars
    this.collectibleStars = this.physics.add.group({
      allowGravity: false,
      immovable: true
    });

    // Passive point gain
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        if (!gameState.isClassChosen()) return;

        if (uiManager.levelPanel && uiManager.levelPanel.addPoint) {
          uiManager.levelPanel.addPoint(1);
          this.playerProgress = uiManager.getPlayerProgress();
          gameState.setPlayerProgress(this.playerProgress);
        }
      }
    });

    this._setupSocketHandlers();
  }

  /**
   * Update loop.
   *
   * @param {number} time
   * @param {number} delta
   */
  update(time, delta) {
    this.shootingStars.update(delta);
    this._updateWorldBorderAnimation(delta);

    if (this.asteroidRenderer) {
      this.asteroidRenderer.update(delta);
    }

    if (!gameState.isClassChosen()) return;

    const dt = delta / 1000;

    this._ensureCameraFollow();

    const now = Date.now();
    const input = inputManager.getCurrentInput();
    const localStats = gameState.getLocalPlayerStats();
    const localShip = this.entityManager?.getLocalShip?.();
    const canBoost = input.boost &&
      !!localShip &&
      now >= this._boostCooldownUntil &&
      (localStats.hp ?? 1) > 0;

    if (canBoost) {
      this._boostCooldownUntil = now + this._boostCooldownMs;
      this._playBoostSound();
    }

    if (this.entityManager) {
      this.entityManager.applyLocalPrediction(input, dt);
      this.entityManager.updateAll();
    }

    this._checkLocalStarCollection();
    this._updateLowHpWarning();

    if (networkManager.isConnected()) {
      networkManager.emitPlayerInput(input);

      if (inputManager.isShootPressed()) {
        const shotNow = Date.now();

        if (shotNow - this._lastShootTime >= GameConfig.weapons.fireRate) {
          this._lastShootTime = shotNow;
          networkManager.emitShoot();
        }
      }
    }

    // Sync progress changes to the server
    const latestProgress = gameState.getPlayerProgress();
    const progressJson = JSON.stringify(latestProgress);

    if (
      progressJson !== this._lastProgressSync &&
      now - this._lastProgressSyncTime > 150
    ) {
      this.playerProgress = latestProgress;
      this._lastProgressSync = progressJson;
      this._lastProgressSyncTime = now;
      this._syncClassProgressToServer();
    }

    const socketId = gameState.getSocketId();
    const minimapData = this.entityManager ? this.entityManager.getMinimapData() : {};

    const starData = Array.from(this.collectibleStarsById.values())
      .filter((star) => star && star.active)
      .map((star) => ({
        x: star.x,
        y: star.y
      }));

    uiManager.updateMinimap({
      players: minimapData,
      myId: socketId,
      stars: starData
    });

    this._updateBoostMeter();
    uiManager.tick(this.cameras.main);
  }

  /**
   * Add stacked backdrop tile layers and start the slow crossfade cycle.
   *
   * @param {number} width
   * @param {number} height
   * @private
   */
  _addBackdropLayers(width, height) {
    const backdropPaths = GameConfig.assets.backdrops || [GameConfig.assets.backdrop];
    const backdropKeys = backdropPaths
      .map((_, index) => `backdrop_${index}`)
      .filter((key) => this.textures.exists(key));

    this._backdropLayers = backdropKeys.map((key, index) => (
      this.add.tileSprite(0, 0, width, height, key)
        .setOrigin(0, 0)
        .setDepth(-1)
        .setAlpha(index === 0 ? 1 : 0)
    ));

    this._activeBackdropIndex = 0;

    if (this._backdropCycleEvent) {
      this._backdropCycleEvent.remove(false);
      this._backdropCycleEvent = null;
    }

    if (this._backdropLayers.length <= 1) return;

    this._backdropCycleEvent = this.time.addEvent({
      delay: GameConfig.backdrop.holdMs || 14000,
      loop: true,
      callback: () => this._fadeToNextBackdrop()
    });
  }

  /**
   * Crossfade from the active backdrop tile to the next one.
   *
   * @private
   */
  _fadeToNextBackdrop() {
    if (this._backdropLayers.length <= 1 || this._backdropFadeTween) return;

    const currentIndex = this._activeBackdropIndex;
    const nextIndex = (currentIndex + 1) % this._backdropLayers.length;
    const currentLayer = this._backdropLayers[currentIndex];
    const nextLayer = this._backdropLayers[nextIndex];
    const fadeState = { progress: 0 };

    this._backdropLayers.forEach((layer, index) => {
      layer.setAlpha(index === currentIndex ? 1 : 0);
    });

    nextLayer.setAlpha(0);

    this._backdropFadeTween = this.tweens.add({
      targets: fadeState,
      progress: 1,
      duration: GameConfig.backdrop.fadeMs || 7000,
      ease: 'Sine.easeInOut',
      onUpdate: () => {
        currentLayer.setAlpha(1 - fadeState.progress);
        nextLayer.setAlpha(fadeState.progress);
      },
      onComplete: () => {
        currentLayer.setAlpha(0);
        nextLayer.setAlpha(1);
        this._activeBackdropIndex = nextIndex;
        this._backdropFadeTween = null;
      }
    });
  }

  /**
   * Add world border visuals.
   *
   * @private
   */
  _addWorldBorders() {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const borderWidth = GameConfig.world.borderWidth;
    const textureKey = 'asteroid_belt';

    if (!this.textures.exists(textureKey)) {
      this._addFallbackWorldBorders();
      return;
    }

    const frame = this.textures.getFrame(textureKey);
    const sourceWidth = frame?.cutWidth || frame?.width || borderWidth;
    const sourceHeight = frame?.cutHeight || frame?.height || borderWidth;
    const tileScale = borderWidth / Math.max(1, sourceHeight);
    const scrollSpeed = GameConfig.world.borderScrollSpeed || 0;
    const cornerSize = borderWidth;
    const horizontalLength = Math.max(borderWidth, WORLD_W - cornerSize * 2);
    const verticalLength = Math.max(borderWidth, WORLD_H - cornerSize * 2);

    this._borderTiles = [];

    const addBelt = (x, y, width, height, rotation, speed, offset = 0) => {
      const tile = this.add.tileSprite(x, y, width, height, textureKey)
        .setOrigin(0.5, 0.5)
        .setDepth(0)
        .setRotation(rotation)
        .setTileScale(tileScale, tileScale);

      tile.tilePositionX = offset;
      tile._beltWrap = sourceWidth;
      tile._beltScrollPixelsPerSecond = tileScale > 0 ? speed / tileScale : 0;
      this._borderTiles.push(tile);
      return tile;
    };

    addBelt(WORLD_W / 2, borderWidth / 2, horizontalLength, borderWidth, 0, scrollSpeed);
    addBelt(WORLD_W / 2, WORLD_H - borderWidth / 2, horizontalLength, borderWidth, Math.PI, -scrollSpeed * 0.85, sourceWidth * 0.37);
    addBelt(borderWidth / 2, WORLD_H / 2, verticalLength, borderWidth, -Math.PI / 2, scrollSpeed * 0.75, sourceWidth * 0.16);
    addBelt(WORLD_W - borderWidth / 2, WORLD_H / 2, verticalLength, borderWidth, Math.PI / 2, -scrollSpeed * 0.7, sourceWidth * 0.61);

    this._addCurvedWorldBorderCorners({
      textureKey,
      sourceWidth,
      sourceHeight,
      tileScale,
      cornerSize,
      scrollSpeed
    });
  }

  /**
   * Create warped quarter-turn textures so the belt bends through each corner.
   *
   * @param {Object} config
   * @private
   */
  _addCurvedWorldBorderCorners(config) {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const sourceImage = this.textures.get(config.textureKey)?.getSourceImage?.();

    if (!sourceImage || typeof document === 'undefined') return;

    const sourceCanvas = document.createElement('canvas');
    sourceCanvas.width = config.sourceWidth;
    sourceCanvas.height = config.sourceHeight;

    const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!sourceContext) return;

    sourceContext.drawImage(sourceImage, 0, 0, config.sourceWidth, config.sourceHeight);

    const cornerSize = Math.max(1, Math.round(config.cornerSize));
    const sourceData = sourceContext.getImageData(0, 0, config.sourceWidth, config.sourceHeight).data;
    const arcSourceLength = ((Math.PI / 2) * (cornerSize / 2)) / Math.max(0.001, config.tileScale);
    const halfCorner = cornerSize / 2;

    const cornerConfigs = [
      {
        key: 'asteroid_belt_corner_tl',
        x: halfCorner,
        y: halfCorner,
        centerX: cornerSize,
        centerY: cornerSize,
        startAngle: -Math.PI / 2,
        sweepAngle: -Math.PI / 2,
        offset: config.sourceWidth * 0.08,
        speed: config.scrollSpeed * 0.35
      },
      {
        key: 'asteroid_belt_corner_tr',
        x: WORLD_W - halfCorner,
        y: halfCorner,
        centerX: 0,
        centerY: cornerSize,
        startAngle: -Math.PI / 2,
        sweepAngle: Math.PI / 2,
        offset: config.sourceWidth * 0.29,
        speed: -config.scrollSpeed * 0.35
      },
      {
        key: 'asteroid_belt_corner_br',
        x: WORLD_W - halfCorner,
        y: WORLD_H - halfCorner,
        centerX: 0,
        centerY: 0,
        startAngle: 0,
        sweepAngle: Math.PI / 2,
        offset: config.sourceWidth * 0.76,
        speed: -config.scrollSpeed * 0.35
      },
      {
        key: 'asteroid_belt_corner_bl',
        x: halfCorner,
        y: WORLD_H - halfCorner,
        centerX: cornerSize,
        centerY: 0,
        startAngle: Math.PI / 2,
        sweepAngle: Math.PI / 2,
        offset: config.sourceWidth * 0.53,
        speed: config.scrollSpeed * 0.35
      }
    ];

    this._borderCorners = cornerConfigs.map((cornerConfig) => {
      const canvas = document.createElement('canvas');
      canvas.width = cornerSize;
      canvas.height = cornerSize;

      const context = canvas.getContext('2d');
      if (!context) return null;

      if (this.textures.exists(cornerConfig.key)) {
        this.textures.remove(cornerConfig.key);
      }

      const corner = {
        ...cornerConfig,
        canvas,
        context,
        imageData: context.createImageData(cornerSize, cornerSize),
        pixelMap: this._buildCurvedBorderPixelMap(cornerConfig, cornerSize, config.sourceHeight, arcSourceLength),
        sourceData,
        sourceWidth: config.sourceWidth,
        sourceHeight: config.sourceHeight,
        offset: cornerConfig.offset,
        scrollPixelsPerSecond: config.tileScale > 0 ? cornerConfig.speed / config.tileScale : 0
      };

      this._drawCurvedBorderCorner(corner);
      corner.texture = this.textures.addCanvas(cornerConfig.key, canvas);

      this.add.image(cornerConfig.x, cornerConfig.y, cornerConfig.key)
        .setOrigin(0.5, 0.5)
        .setDepth(0);

      return corner;
    }).filter(Boolean);
  }

  /**
   * Precalculate the source lookup for one curved border corner.
   *
   * @param {Object} cornerConfig
   * @param {number} cornerSize
   * @param {number} sourceHeight
   * @param {number} arcSourceLength
   * @returns {Array<Object|null>}
   * @private
   */
  _buildCurvedBorderPixelMap(cornerConfig, cornerSize, sourceHeight, arcSourceLength) {
    const pixelMap = new Array(cornerSize * cornerSize);
    const outerRadius = cornerSize;

    for (let y = 0; y < cornerSize; y += 1) {
      for (let x = 0; x < cornerSize; x += 1) {
        const dx = x - cornerConfig.centerX;
        const dy = y - cornerConfig.centerY;
        const radius = Math.sqrt(dx * dx + dy * dy);
        const index = y * cornerSize + x;

        if (radius > outerRadius) {
          pixelMap[index] = null;
          continue;
        }

        const progress = this._getCurvedBorderAngleProgress(
          Math.atan2(dy, dx),
          cornerConfig.startAngle,
          cornerConfig.sweepAngle
        );

        if (progress < 0 || progress > 1) {
          pixelMap[index] = null;
          continue;
        }

        pixelMap[index] = {
          sourceX: progress * arcSourceLength,
          sourceY: Math.min(
            sourceHeight - 1,
            Math.max(0, Math.floor((1 - radius / outerRadius) * (sourceHeight - 1)))
          )
        };
      }
    }

    return pixelMap;
  }

  /**
   * Normalize an angle to a 0..1 position across a curved corner.
   *
   * @param {number} angle
   * @param {number} startAngle
   * @param {number} sweepAngle
   * @returns {number}
   * @private
   */
  _getCurvedBorderAngleProgress(angle, startAngle, sweepAngle) {
    if (sweepAngle < 0) {
      while (angle > startAngle) angle -= Math.PI * 2;
      return (startAngle - angle) / Math.abs(sweepAngle);
    }

    while (angle < startAngle) angle += Math.PI * 2;
    return (angle - startAngle) / sweepAngle;
  }

  /**
   * Redraw one curved corner with its current tile offset.
   *
   * @param {Object} corner
   * @private
   */
  _drawCurvedBorderCorner(corner) {
    const output = corner.imageData.data;
    output.fill(0);

    corner.pixelMap.forEach((pixel, index) => {
      if (!pixel) return;

      const sourceX = Math.floor((corner.offset + pixel.sourceX) % corner.sourceWidth);
      const sourceIndex = (pixel.sourceY * corner.sourceWidth + sourceX) * 4;
      const outputIndex = index * 4;

      output[outputIndex] = corner.sourceData[sourceIndex];
      output[outputIndex + 1] = corner.sourceData[sourceIndex + 1];
      output[outputIndex + 2] = corner.sourceData[sourceIndex + 2];
      output[outputIndex + 3] = corner.sourceData[sourceIndex + 3];
    });

    corner.context.putImageData(corner.imageData, 0, 0);

    if (corner.texture?.refresh) {
      corner.texture.refresh();
    }
  }

  /**
   * Add simple red borders if the belt texture is unavailable.
   *
   * @private
   */
  _addFallbackWorldBorders() {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;
    const borderWidth = GameConfig.world.borderWidth;
    const borderColor = 0x880000;

    this.add.rectangle(WORLD_W / 2, borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    this.add.rectangle(WORLD_W / 2, WORLD_H - borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    this.add.rectangle(borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
    this.add.rectangle(WORLD_W - borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
  }

  /**
   * Scroll the asteroid belt tiles so the map boundary feels alive.
   *
   * @param {number} delta
   * @private
   */
  _updateWorldBorderAnimation(delta) {
    if (!Number.isFinite(delta)) return;

    this._borderTiles.forEach((tile) => {
      if (!tile?.active || !Number.isFinite(tile._beltScrollPixelsPerSecond)) return;

      const wrap = Math.max(1, tile._beltWrap || 1);
      const nextPosition = tile.tilePositionX + tile._beltScrollPixelsPerSecond * (delta / 1000);
      tile.tilePositionX = ((nextPosition % wrap) + wrap) % wrap;
    });

    this._borderCorners.forEach((corner) => {
      if (!Number.isFinite(corner.scrollPixelsPerSecond)) return;

      const wrap = Math.max(1, corner.sourceWidth || 1);
      const nextOffset = corner.offset - corner.scrollPixelsPerSecond * (delta / 1000);
      corner.offset = ((nextOffset % wrap) + wrap) % wrap;
      this._drawCurvedBorderCorner(corner);
    });
  }

  /**
   * Check if a ship is unlocked.
   *
   * @param {string} shipKey
   * @returns {boolean}
   * @private
   */
  _isOwnedShip(shipKey) {
    return Array.isArray(this.playerProgress.unlockedShips)
      && this.playerProgress.unlockedShips.includes(shipKey);
  }

  /**
   * Sync collectible stars from the authoritative server snapshot.
   *
   * @param {Array<Object>} stars
   */
  syncCollectibleStars(stars = []) {
    if (!Array.isArray(stars)) return;

    const seen = new Set();

    stars.forEach((starData) => {
      const star = this.spawnCollectibleStar(starData);
      if (!star) return;
      star.collectRequested = false;
      seen.add(star.starId);
    });

    Array.from(this.collectibleStarsById.entries()).forEach(([starId, star]) => {
      if (!seen.has(starId)) {
        this._removeCollectibleStar(star, { playEffect: false });
      }
    });
  }

  /**
   * Render or update a server-owned collectible star.
   *
   * @param {Object} starData
   * @returns {*}
   */
  spawnCollectibleStar(starData = {}) {
    if (!this.collectibleStars) return null;

    const starId = starData.id || starData.starId;
    const x = Number(starData.x);
    const y = Number(starData.y);
    const defaultXpValue = GameConfig.collectibles?.stars?.defaultXpValue || 30;
    const defaultPointValue = GameConfig.collectibles?.stars?.defaultPointValue || 1;

    if (!starId || !Number.isFinite(x) || !Number.isFinite(y)) return null;

    const existing = this.collectibleStarsById.get(starId);
    if (existing && existing.active) {
      existing.x = x;
      existing.y = y;
      existing.xpValue = Number.isFinite(starData.xpValue) ? starData.xpValue : existing.xpValue;
      existing.pointValue = Number.isFinite(starData.pointValue) ? starData.pointValue : existing.pointValue;
      return existing;
    }

    const textureKey = this.textures.exists('collectible_star')
      ? 'collectible_star'
      : 'glow_particle';
    const star = this.collectibleStars.create(x, y, textureKey);
    if (!star) return null;

    star.starId = starId;
    star.collectRequested = false;
    star.xpValue = Number.isFinite(starData.xpValue) ? starData.xpValue : defaultXpValue;
    star.pointValue = Number.isFinite(starData.pointValue) ? starData.pointValue : defaultPointValue;

    star.setScale(0.9);
    star.setAlpha(0.9);
    star.setDepth(2);

    star.collectibleTween = this.tweens.add({
      targets: star,
      alpha: 0.62,
      scale: 0.72,
      duration: 650,
      yoyo: true,
      repeat: -1
    });

    this.collectibleStarsById.set(starId, star);
    return star;
  }

  /**
   * Check whether the local player can request collection of a server star.
   *
   * @private
   */
  _checkLocalStarCollection() {
    if (!this.entityManager || !this.collectibleStars || !networkManager.isConnected()) return;

    const localShip = this.entityManager.getLocalShip
      ? this.entityManager.getLocalShip()
      : null;

    if (!localShip) return;

    const localX = localShip.predicted?.x ?? localShip.x ?? localShip.serverState?.x;
    const localY = localShip.predicted?.y ?? localShip.y ?? localShip.serverState?.y;

    if (typeof localX !== 'number' || typeof localY !== 'number') return;

    const collectRadius = GameConfig.collectibles?.stars?.collectRadius || 40;
    const stars = Array.from(this.collectibleStarsById.values());

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (!star || !star.active || star.collectRequested) continue;

      const dist = Phaser.Math.Distance.Between(localX, localY, star.x, star.y);
      if (dist <= collectRadius) {
        this._requestCollectibleStar(star);
      }
    }
  }

  /**
   * Ask the server to collect a star.
   *
   * @param {*} star
   * @private
   */
  _requestCollectibleStar(star) {
    if (!star?.starId) return;

    star.collectRequested = true;
    networkManager.emitCollectibleStar(star.starId);

    this._clearPendingStarCollect(star.starId);
    const timer = this.time.delayedCall(800, () => {
      this._pendingStarCollects.delete(star.starId);

      const activeStar = this.collectibleStarsById.get(star.starId);
      if (activeStar && activeStar.active) {
        activeStar.collectRequested = false;
      }
    });

    this._pendingStarCollects.set(star.starId, timer);
  }

  /**
   * Handle a server-confirmed collected star.
   *
   * @param {*} star
   * @param {Object} options
   */
  collectStar(star, options = {}) {
    if (!star || !star.active) return;

    const defaultXpValue = GameConfig.collectibles?.stars?.defaultXpValue || 30;
    const defaultPointValue = GameConfig.collectibles?.stars?.defaultPointValue || 1;
    const xpValue = Number.isFinite(options.xpValue) ? options.xpValue : (star.xpValue || defaultXpValue);
    const pointValue = Number.isFinite(options.pointValue) ? options.pointValue : (star.pointValue || defaultPointValue);
    const grantRewards = !!options.grantRewards;

    this._removeCollectibleStar(star, { playEffect: true });

    if (grantRewards) {
      this._grantCollectedStarRewards(xpValue, pointValue);
    }
  }

  /**
   * Remove one rendered collectible star.
   *
   * @param {*} star
   * @param {Object} options
   * @private
   */
  _removeCollectibleStar(star, options = {}) {
    if (!star) return;

    const x = star.x;
    const y = star.y;

    if (star.starId) {
      this._clearPendingStarCollect(star.starId);
      this.collectibleStarsById.delete(star.starId);
    }

    if (star.collectibleTween) {
      star.collectibleTween.stop();
      star.collectibleTween = null;
    }

    if (star.active && star.destroy) {
      star.destroy();
    }

    if (options.playEffect) {
      this._spawnStarCollectBurst(x, y);
    }
  }

  /**
   * Clear a pending local collection request.
   *
   * @param {string} starId
   * @private
   */
  _clearPendingStarCollect(starId) {
    const timer = this._pendingStarCollects.get(starId);
    if (timer) {
      timer.remove(false);
    }
    this._pendingStarCollects.delete(starId);
  }

  /**
   * Add rewards for a local star collection.
   *
   * @param {number} xpValue
   * @param {number} pointValue
   * @private
   */
  _grantCollectedStarRewards(xpValue, pointValue) {
    this._grantXpReward(xpValue, pointValue);
  }

  /**
   * Add XP and optional points to the local player's active ship progress.
   *
   * @param {number} xpValue
   * @param {number} pointValue
   * @private
   */
  _grantXpReward(xpValue, pointValue = 0) {
    if (!uiManager.levelPanel) return;

    let upgradePointsGained = 0;

    if (uiManager.levelPanel.gainXp) {
      upgradePointsGained = uiManager.levelPanel.gainXp(xpValue) || 0;
    }

    if (pointValue > 0 && uiManager.levelPanel.addPoint) {
      uiManager.levelPanel.addPoint(pointValue);
    }

    this.playerProgress = uiManager.getPlayerProgress();
    gameState.setPlayerProgress(this.playerProgress);

    if (upgradePointsGained > 0) {
      this._spawnUpgradePointPopup(upgradePointsGained);
      const activeShipKey =
        this.playerProgress.selectedShip ||
        gameState.getChosenClassKey() ||
        GameConfig.defaultClass;
      const activeLevel = this.playerProgress.shipProgress?.[activeShipKey]?.level;

      networkManager.emitPlayerLevelUp(upgradePointsGained, activeLevel);
    }
  }

  /**
   * Spawn the collectible star pickup burst.
   *
   * @param {number} x
   * @param {number} y
   * @private
   */
  _spawnStarCollectBurst(x, y) {
    const particles = this.add.particles(x, y, 'glow_particle', {
      speed: { min: 20, max: 90 },
      scale: { start: 0.35, end: 0 },
      lifespan: 420,
      quantity: 12
    });

    this.time.delayedCall(450, () => {
      if (particles) particles.destroy();
    });
  }

  /**
   * Get a good popup position above the local player.
   *
   * @returns {{x:number,y:number}}
   * @private
   */
  _getLocalPlayerPopupPosition() {
    const localShip = this.entityManager?.getLocalShip?.();
    const sprite = localShip?.sprite;

    if (sprite && sprite.active) {
      return {
        x: sprite.x,
        y: sprite.y - 54
      };
    }

    const position = localShip?.getPosition?.();
    const fallbackX =
      position?.x ??
      localShip?.predicted?.x ??
      localShip?.x ??
      localShip?.serverState?.x;
    const fallbackY =
      position?.y ??
      localShip?.predicted?.y ??
      localShip?.y ??
      localShip?.serverState?.y;

    if (Number.isFinite(fallbackX) && Number.isFinite(fallbackY)) {
      return {
        x: fallbackX,
        y: fallbackY - 54
      };
    }

    const view = this.cameras?.main?.worldView;
    return {
      x: view ? view.centerX : GameConfig.world.width / 2,
      y: view ? view.centerY : GameConfig.world.height / 2
    };
  }

  /**
   * Show upgrade-point feedback over the local player.
   *
   * @param {number} amount
   * @private
   */
  _spawnUpgradePointPopup(amount = 1) {
    const points = Math.max(1, Math.floor(Number(amount) || 1));
    const position = this._getLocalPlayerPopupPosition();
    const label = points === 1
      ? '+1 UPGRADE POINT'
      : `+${points} UPGRADE POINTS`;

    const text = this.add.text(position.x, position.y, label, {
      font: '14px Orbitron, sans-serif',
      fill: '#66ffcc',
      align: 'center',
      stroke: '#001014',
      strokeThickness: 4
    });

    text.setOrigin(0.5, 0.5);
    text.setDepth(6);
    text.setScale(0.88);

    this.tweens.add({
      targets: text,
      y: position.y - 42,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.88, to: 1.18 },
      duration: 1050,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
    });
  }

  /**
   * Position and volume-sync the low-HP warning while active.
   *
   * @private
   */
  _updateLowHpWarning() {
    if (!this._lowHpActive) return;

    const position = this._getLocalPlayerLowHpWarningPosition();

    if (this._lowHpWarningText) {
      this._lowHpWarningText.setPosition(position.x, position.y);
    }

    if (this._lowHpSound && this._lowHpSound.isPlaying && this._lowHpSound.setVolume) {
      this._lowHpSound.setVolume(GameConfig.getSfxVolumeFor(0.68));
    }
  }

  /**
   * Update low-HP warning state from authoritative HP.
   *
   * @param {number} hp
   * @private
   */
  _setLowHpWarningState(hp) {
    const nextHp = Number(hp);
    const threshold = GameConfig.warnings?.lowHpThreshold ?? 50;
    const shouldWarn = Number.isFinite(nextHp) && nextHp < threshold;

    if (shouldWarn === this._lowHpActive) {
      if (shouldWarn) this._updateLowHpWarning();
      return;
    }

    this._lowHpActive = shouldWarn;

    if (shouldWarn) {
      this._showLowHpWarning();
      this._startLowHpSound();
    } else {
      this._hideLowHpWarning();
      this._stopLowHpSound();
    }
  }

  /**
   * Create/show the low-HP warning text.
   *
   * @private
   */
  _showLowHpWarning() {
    const position = this._getLocalPlayerLowHpWarningPosition();

    if (!this._lowHpWarningText) {
      this._lowHpWarningText = this.add.text(position.x, position.y, 'LOW HP - HULL BREACHED!', {
        font: '13px Orbitron, sans-serif',
        fill: '#ff3333',
        align: 'center',
        stroke: '#180000',
        strokeThickness: 4
      });

      this._lowHpWarningText.setOrigin(0.5, 0.5);
      this._lowHpWarningText.setDepth(7);

      if (this._lowHpWarningText.setShadow) {
        this._lowHpWarningText.setShadow(0, 0, '#ff0000', 12, true, true);
      }
    }

    this._lowHpWarningText.setVisible(true);
    this._lowHpWarningText.setAlpha(1);
    this._lowHpWarningText.setScale(1);

    if (this._lowHpWarningTween) {
      this._lowHpWarningTween.stop();
      this._lowHpWarningTween = null;
    }

    this._lowHpWarningTween = this.tweens.add({
      targets: this._lowHpWarningText,
      alpha: { from: 1, to: 0.48 },
      scale: { from: 1, to: 1.08 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /**
   * Hide the low-HP warning text.
   *
   * @private
   */
  _hideLowHpWarning() {
    if (this._lowHpWarningTween) {
      this._lowHpWarningTween.stop();
      this._lowHpWarningTween = null;
    }

    if (this._lowHpWarningText) {
      this._lowHpWarningText.setVisible(false);
    }
  }

  /**
   * Get the warning position below the local player.
   *
   * @returns {{x:number,y:number}}
   * @private
   */
  _getLocalPlayerLowHpWarningPosition() {
    const localShip = this.entityManager?.getLocalShip?.();
    const sprite = localShip?.sprite;
    const offset = GameConfig.sprites.ship.height + 26;

    if (sprite && sprite.active) {
      return {
        x: sprite.x,
        y: sprite.y + offset
      };
    }

    const position = localShip?.getPosition?.();
    const fallbackX =
      position?.x ??
      localShip?.predicted?.x ??
      localShip?.x ??
      localShip?.serverState?.x;
    const fallbackY =
      position?.y ??
      localShip?.predicted?.y ??
      localShip?.y ??
      localShip?.serverState?.y;

    if (Number.isFinite(fallbackX) && Number.isFinite(fallbackY)) {
      return {
        x: fallbackX,
        y: fallbackY + offset
      };
    }

    const view = this.cameras?.main?.worldView;
    return {
      x: view ? view.centerX : GameConfig.world.width / 2,
      y: view ? view.centerY + 40 : GameConfig.world.height / 2
    };
  }

  /**
   * Start the low-HP looping sound.
   *
   * @private
   */
  _startLowHpSound() {
    if (!this.sound || !this.cache.audio.exists('low_hp')) return;

    try {
      if (!this._lowHpSound) {
        this._lowHpSound = this.sound.add('low_hp', {
          loop: true,
          volume: GameConfig.getSfxVolumeFor(0.68)
        });
      }

      if (this._lowHpSound.setVolume) {
        this._lowHpSound.setVolume(GameConfig.getSfxVolumeFor(0.68));
      }

      if (!this._lowHpSound.isPlaying) {
        this._lowHpSound.play();
      }
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Stop the low-HP looping sound.
   *
   * @private
   */
  _stopLowHpSound() {
    try {
      if (this._lowHpSound && this._lowHpSound.isPlaying) {
        this._lowHpSound.stop();
      }
    } catch (error) {}
  }

  /**
   * Track authoritative local HP and play feedback when it drops.
   *
   * @param {Object} serverState
   * @private
   */
  _trackLocalDamage(serverState) {
    const nextHp = Number(serverState.hp);
    const nextMaxHp = Number(serverState.maxHp);
    const prevHp = this._lastLocalHp;
    const prevMaxHp = this._lastLocalMaxHp;
    const hasHp = Number.isFinite(nextHp);
    const hasMaxHp = Number.isFinite(nextMaxHp);

    if (hasHp) {
      const hasPreviousHp = Number.isFinite(prevHp);
      const maxHpChanged = Number.isFinite(prevMaxHp) && hasMaxHp && prevMaxHp !== nextMaxHp;
      const damageAmount = prevHp - nextHp;

      if (hasPreviousHp && !maxHpChanged && damageAmount > 0) {
        this._playDamageCue(damageAmount, hasMaxHp ? nextMaxHp : prevMaxHp);
      }

      if (hasHp) {
        this._setLowHpWarningState(nextHp);
      }

      this._lastLocalHp = nextHp;
    }

    if (hasMaxHp) {
      this._lastLocalMaxHp = nextMaxHp;
    }
  }

  /**
   * Track authoritative boost recharge for the local HUD.
   *
   * @param {Object} serverState
   * @private
   */
  _trackLocalBoost(serverState) {
    if (Number.isFinite(serverState.boostCooldownMs)) {
      this._boostCooldownMs = serverState.boostCooldownMs;
    }

    if (Number.isFinite(serverState.boostCooldownRemainingMs)) {
      this._boostCooldownUntil = Date.now() + Math.max(0, serverState.boostCooldownRemainingMs);
    }
  }

  /**
   * Update the boost recharge meter.
   *
   * @private
   */
  _updateBoostMeter() {
    const remainingMs = Math.max(0, this._boostCooldownUntil - Date.now());

    uiManager.updateBoost({
      remainingMs,
      cooldownMs: this._boostCooldownMs
    });
  }

  /**
   * Play local damage feedback.
   *
   * @param {number} damageAmount
   * @param {number} maxHp
   * @private
   */
  _playDamageCue(damageAmount, maxHp) {
    const safeMaxHp = Number.isFinite(maxHp) && maxHp > 0 ? maxHp : 100;
    const relativeDamage = Math.max(0, damageAmount / safeMaxHp);
    const severity = Phaser.Math.Clamp(0.55 + relativeDamage * 3, 0.65, 1);
    const shakeIntensity = Phaser.Math.Clamp(0.004 + relativeDamage * 0.02, 0.005, 0.018);

    const vignette = typeof document !== 'undefined'
      ? document.getElementById('damage-vignette')
      : null;

    if (vignette) {
      vignette.style.setProperty('--damage-cue-strength', severity.toFixed(2));
      vignette.classList.remove('active');
      void vignette.offsetWidth;
      vignette.classList.add('active');

      if (this._damageCueTimer) {
        window.clearTimeout(this._damageCueTimer);
      }

      this._damageCueTimer = window.setTimeout(() => {
        vignette.classList.remove('active');
        this._damageCueTimer = null;
      }, 430);
    }

    if (this.cameras?.main?.shake) {
      this.cameras.main.shake(140, shakeIntensity, true);
    }

    this._playHitSound(severity);
    this._flashLocalShip();
  }

  /**
   * Play the local damage sound.
   *
   * @param {number} severity
   * @private
   */
  _playHitSound(severity = 1) {
    if (!this.sound || !this.cache.audio.exists('player_hit')) return;

    try {
      this.sound.play('player_hit', {
        volume: GameConfig.getSfxVolumeFor(Phaser.Math.Clamp(0.45 + severity * 0.25, 0.45, 0.7))
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Play the local boost ignition sound.
   *
   * @private
   */
  _playBoostSound() {
    if (!this.sound || !this.cache.audio.exists('boost_fire')) return;

    try {
      this.sound.play('boost_fire', {
        volume: GameConfig.getSfxVolumeFor(0.55)
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Play local level-up feedback.
   *
   * @private
   */
  _playLevelUpSound() {
    if (!this.sound || !this.cache.audio.exists('level_up')) return;

    try {
      this.sound.play('level_up', {
        volume: GameConfig.getSfxVolumeFor(0.75)
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Play local star collection feedback.
   *
   * @private
   */
  _playStarCollectSound() {
    if (!this.sound || !this.cache.audio.exists('star_collect')) return;

    try {
      this.sound.play('star_collect', {
        volume: GameConfig.getSfxVolumeFor(0.65)
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Briefly tint the local ship red without changing its death/respawn alpha.
   *
   * @private
   */
  _flashLocalShip() {
    const localShip = this.entityManager?.getLocalShip?.();
    const sprite = localShip?.sprite;
    if (!sprite || !sprite.active) return;

    sprite.setTint(0xff6666);

    if (this._damageTintTimer) {
      this._damageTintTimer.remove(false);
    }

    this._damageTintTimer = this.time.delayedCall(160, () => {
      if (sprite.active && sprite.clearTint) {
        sprite.clearTint();
      }
      this._damageTintTimer = null;
    });
  }

  /**
   * Play visible feedback on a ship that took bullet damage.
   *
   * @param {Object} data
   * @private
   */
  _playShipHitCue(data) {
    const shipId = data?.shipId;
    if (!shipId || !this.entityManager) return;
    if (this.entityManager.isLocalPlayer(shipId)) return;

    const ship = this.entityManager.getShip(shipId);
    const sprite = ship?.sprite;
    if (!ship || !sprite || !sprite.active) return;

    this._flashHitShip(shipId, sprite);
    this._spawnDamageNumber(ship, data.damage, data.killed);
  }

  /**
   * Play hit confirmation audio for the attacking player.
   *
   * @param {Object} data
   * @private
   */
  _playWeaponHitSound(data) {
    const ownerId = data?.ownerId;
    if (!ownerId || !this.entityManager?.isLocalPlayer?.(ownerId)) return;
    if (!this.sound || !this.cache.audio.exists('weapon_hit')) return;

    try {
      this.sound.play('weapon_hit', {
        volume: GameConfig.getSfxVolumeFor(0.5)
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  /**
   * Briefly tint a remote ship so attackers can confirm the hit.
   *
   * @param {string} shipId
   * @param {*} sprite
   * @private
   */
  _flashHitShip(shipId, sprite) {
    sprite.setTint(0xff4f4f);

    const existingTimer = this._shipHitTintTimers.get(shipId);
    if (existingTimer) {
      existingTimer.remove(false);
    }

    const timer = this.time.delayedCall(140, () => {
      if (sprite.active && sprite.clearTint) {
        sprite.clearTint();
      }
      this._shipHitTintTimers.delete(shipId);
    });

    this._shipHitTintTimers.set(shipId, timer);
  }

  /**
   * Float damage text above a hit ship.
   *
   * @param {*} ship
   * @param {number} damage
   * @param {boolean} killed
   * @private
   */
  _spawnDamageNumber(ship, damage, killed) {
    const sprite = ship.sprite;
    const x = sprite?.x ?? ship.x ?? 0;
    const y = (sprite?.y ?? ship.y ?? 0) - 34;
    const amount = Math.max(0, Math.floor(Number(damage) || 0));
    const label = killed ? 'DESTROYED' : `-${amount}`;

    const text = this.add.text(x, y, label, {
      font: killed ? '13px Orbitron, sans-serif' : '18px Orbitron, sans-serif',
      fill: killed ? '#ffdd66' : '#ff6666',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 3
    });

    text.setOrigin(0.5, 0.5);
    text.setDepth(4);

    this.tweens.add({
      targets: text,
      y: y - 30,
      alpha: { from: 1, to: 0 },
      scale: { from: killed ? 1.05 : 1, to: killed ? 1.3 : 1.18 },
      duration: killed ? 760 : 520,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy()
    });
  }

  /**
   * Resolve a player id into a readable kill feed name.
   *
   * @param {string} playerId
   * @returns {string}
   * @private
   */
  _getKillFeedName(playerId) {
    if (!playerId) return 'Unknown Pilot';

    const ship = this.entityManager?.getShip?.(playerId);
    const displayName =
      ship?.getDisplayName?.() ||
      ship?.playerName ||
      ship?.name ||
      ship?.serverState?.playerName ||
      ship?.serverState?.username ||
      ship?.serverState?.name;

    if (typeof displayName === 'string' && displayName.trim()) {
      return displayName.trim();
    }

    const shortId = String(playerId).slice(0, 6);
    return `Pilot ${shortId}`;
  }

  /**
   * Show a viewport-pinned kill feed entry.
   *
   * @param {Object} data
   * @private
   */
  _showKillFeedEntry(data) {
    const feed = typeof document !== 'undefined'
      ? document.getElementById('kill-feed')
      : null;

    if (!feed || !data?.victimId) return;

    const entry = document.createElement('div');
    const victimName = this._getKillFeedName(data.victimId);
    const killerName = data.killerId ? this._getKillFeedName(data.killerId) : '';

    const addPart = (className, text) => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      entry.appendChild(span);
    };

    if (data.killerId && data.killerId !== data.victimId) {
      entry.className = 'kill-feed-entry';
      addPart('killer', killerName);
      addPart('verb', ' eliminated ');
      addPart('victim', victimName);
    } else {
      entry.className = 'kill-feed-entry environment';
      addPart('victim', victimName);
      addPart('verb', data.cause === 'asteroid' ? ' was crushed by an asteroid' : ' hit a wall');
    }

    feed.prepend(entry);

    while (feed.children.length > 5) {
      feed.lastElementChild.remove();
    }

    window.setTimeout(() => {
      entry.remove();
    }, 5400);
  }

  /**
   * Show a level-up entry in the viewport-pinned kill feed.
   *
   * @param {Object} data
   * @private
   */
  _showLevelUpFeedEntry(data) {
    const feed = typeof document !== 'undefined'
      ? document.getElementById('kill-feed')
      : null;

    if (!feed || !data?.playerId) return;

    const entry = document.createElement('div');
    const playerName =
      (typeof data.playerName === 'string' && data.playerName.trim())
        ? data.playerName.trim()
        : this._getKillFeedName(data.playerId);
    const pointsGained = Math.max(1, Math.floor(Number(data.pointsGained) || 1));

    const addPart = (className, text) => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      entry.appendChild(span);
    };

    entry.className = 'kill-feed-entry level-up';
    addPart('level-player', playerName);
    addPart('verb', ' leveled up ');
    addPart(
      'level-points',
      pointsGained === 1
        ? '(+1 upgrade point)'
        : `(+${pointsGained} upgrade points)`
    );

    feed.prepend(entry);

    while (feed.children.length > 5) {
      feed.lastElementChild.remove();
    }

    window.setTimeout(() => {
      entry.remove();
    }, 5400);
  }

  /**
   * Show asteroid destruction in the viewport-pinned kill feed.
   *
   * @param {Object} data
   * @private
   */
  _showAsteroidDestroyedFeedEntry(data) {
    const feed = typeof document !== 'undefined'
      ? document.getElementById('kill-feed')
      : null;

    if (!feed || !data?.ownerId) return;

    const entry = document.createElement('div');
    const playerName = this._getKillFeedName(data.ownerId);
    const xpValue = Math.max(0, Math.floor(Number(data.xpValue) || GameConfig.asteroids.xpValue || 200));

    const addPart = (className, text) => {
      const span = document.createElement('span');
      if (className) span.className = className;
      span.textContent = text;
      entry.appendChild(span);
    };

    entry.className = 'kill-feed-entry environment';
    addPart('killer', playerName);
    addPart('verb', ' destroyed an asteroid ');
    addPart('level-points', `(+${xpValue} XP)`);

    feed.prepend(entry);

    while (feed.children.length > 5) {
      feed.lastElementChild.remove();
    }

    window.setTimeout(() => {
      entry.remove();
    }, 5400);
  }

  /**
   * Show a temporary top-screen kill streak banner.
   *
   * @param {Object} data
   * @private
   */
  _showKillStreakBanner(data) {
    const overlay = typeof document !== 'undefined'
      ? document.getElementById('title-overlay')
      : null;

    if (!overlay) return;

    const message = typeof data?.message === 'string' ? data.message.trim() : '';
    if (!message) return;

    overlay.textContent = message.toUpperCase();
    overlay.classList.remove('active');
    void overlay.offsetWidth;
    overlay.classList.add('active');
  }

  /**
   * Set up socket handlers.
   *
   * @private
   */
  _setupSocketHandlers() {
    const socket = networkManager.getSocket();
    if (!socket) {
      console.warn('GameScene: Socket not available for handlers');
      return;
    }

    socket.on('currentPlayers', (players) => {
      console.log('currentPlayers:', Object.keys(players).length);

      const socketId = gameState.getSocketId();
      this.entityManager.setLocalPlayer(socketId);

      Object.keys(players).forEach((id) => {
        this.entityManager.addOrUpdateShip(players[id]);
      });

      const localState = socketId ? players[socketId] : null;
      if (localState) {
        this._lastLocalHp = localState.hp;
        this._lastLocalMaxHp = localState.maxHp;
        this._setLowHpWarningState(localState.hp);
        this._trackLocalBoost(localState);
      }

      this._ensureCameraFollow();
    });

    socket.on('newPlayer', (playerInfo) => {
      this.entityManager.addOrUpdateShip(playerInfo);
    });

    socket.on('playerDisconnected', (playerId) => {
      this.entityManager.removeShip(playerId);
    });

    socket.on('collectibleStarsSnapshot', (stars) => {
      this.syncCollectibleStars(stars);
    });

    socket.on('collectibleStarSpawned', (starData) => {
      this.spawnCollectibleStar(starData);
    });

    socket.on('collectibleStarCollected', (data) => {
      const star = this.collectibleStarsById.get(data?.starId);
      const grantRewards = this.entityManager?.isLocalPlayer?.(data?.collectorId);

      if (grantRewards) {
        this._playStarCollectSound();
      }

      if (star) {
        this.collectStar(star, {
          grantRewards,
          xpValue: data?.xpValue,
          pointValue: data?.pointValue
        });
      } else if (grantRewards) {
        this._grantCollectedStarRewards(
          data?.xpValue || GameConfig.collectibles?.stars?.defaultXpValue || 30,
          data?.pointValue || GameConfig.collectibles?.stars?.defaultPointValue || 1
        );
      }
    });

    socket.on('bulletHit', (data) => {
      this._playShipHitCue(data);
      this._playWeaponHitSound(data);
    });

    socket.on('playerLeveledUp', (data) => {
      this._showLevelUpFeedEntry(data);

      const leveledShip = this.entityManager?.getShip?.(data?.playerId);
      if (leveledShip && Number.isFinite(Number(data?.shipLevel)) && leveledShip.setShipLevel) {
        leveledShip.setShipLevel(data.shipLevel);
      }

      if (this.entityManager?.isLocalPlayer?.(data?.playerId)) {
        this._playLevelUpSound();

        if (Number.isFinite(data?.hp) && Number.isFinite(data?.maxHp)) {
          this._lastLocalHp = data.hp;
          this._lastLocalMaxHp = data.maxHp;
          this._setLowHpWarningState(data.hp);
          gameState.updateLocalPlayerStats({
            hp: data.hp,
            maxHp: data.maxHp
          });
          uiManager.updateHpXp(gameState.getLocalPlayerStats());
        }
      }
    });

    socket.on('killStreak', (data) => {
      this._showKillStreakBanner(data);
    });

    socket.on('asteroidDestroyed', (data) => {
      this._showAsteroidDestroyedFeedEntry(data);

      if (this.entityManager?.isLocalPlayer?.(data?.ownerId)) {
        this._grantXpReward(data?.xpValue || GameConfig.asteroids.xpValue || 200);
      }
    });

    socket.on('playerKilled', (data) => {
      this._showKillFeedEntry(data);

      if (
        data?.killerId &&
        data.killerId !== data.victimId &&
        this.entityManager?.isLocalPlayer?.(data.killerId)
      ) {
        this._grantXpReward(GameConfig.rewards?.playerEliminationXp || 100);
      }

      const ship = this.entityManager.getShip(data.victimId);
      if (ship && ship.sprite) {
        ship.sprite.setAlpha(0.3);
      }
    });

    socket.on('playerRespawned', (data) => {
      const ship = this.entityManager.getShip(data.playerId);
      if (ship) {
        if (ship.sprite) {
          ship.sprite.setAlpha(1);
        }

        ship.x = data.x;
        ship.y = data.y;
        ship.serverState.x = data.x;
        ship.serverState.y = data.y;

        if (this.entityManager.isLocalPlayer(data.playerId)) {
          ship.predicted.x = data.x;
          ship.predicted.y = data.y;
          ship.predicted.vx = 0;
          ship.predicted.vy = 0;
          this._lastLocalHp = data.hp;
          this._lastLocalMaxHp = data.maxHp;
          this._setLowHpWarningState(data.hp);
          this._boostCooldownUntil = 0;
          networkManager.emitRequestCollectibleStars();
          networkManager.emitRequestAsteroids();
        }
      }
    });

    socket.on('playerUpdates', (data) => {
      const serverPlayers = data.players;
      const socketId = gameState.getSocketId();

      if (socketId && !this.entityManager.localPlayerId) {
        this.entityManager.setLocalPlayer(socketId);
      }

      this.entityManager.processServerUpdate(serverPlayers, {
        onLocalPlayerUpdate: (serverState) => {
          this._trackLocalDamage(serverState);
          this._trackLocalBoost(serverState);

          gameState.updateLocalPlayerStats({
            hp: serverState.hp,
            maxHp: serverState.maxHp,
            xp: serverState.xp,
            maxXp: serverState.maxXp
          });

          uiManager.updateHpXp(gameState.getLocalPlayerStats());

          const chosenClassKey = gameState.getChosenClassKey();
          if (!this._lastClassLog || Date.now() - this._lastClassLog > 1500) {
            console.log('server classKey:', serverState.classKey, '| local chosen:', chosenClassKey);
            this._lastClassLog = Date.now();
          }
        }
      });

      this._ensureCameraFollow();
    });

    if (networkManager.isConnected()) {
      networkManager.emitRequestCollectibleStars();
      networkManager.emitRequestAsteroids();
    }
  }

  handleResize(width, height) {
    const cam = this.cameras.main;
    const zoomX = width / GameConfig.camera.baseWidth;
    const zoomY = height / GameConfig.camera.baseHeight;
    cam.setSize(width, height);
    cam.setZoom(Math.max(zoomX, zoomY));
  }

  /**
   * Ensure camera follows the local player.
   *
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

if (typeof window !== 'undefined') {
  window.GameScene = GameScene;
}

export default GameScene;
