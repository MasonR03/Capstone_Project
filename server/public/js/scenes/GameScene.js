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

    // Progress
    this.playerProgress = cloneProgress(PLAYER_PROGRESS_DEFAULTS);

    // Progress sync
    this._lastProgressSync = '';
    this._lastProgressSyncTime = 0;

    // Collectibles
    this.collectibleStars = null;
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
    this.load.image('backdrop', GameConfig.assets.backdrop);

    // Bullet
    this.load.image('bullet', GameConfig.assets.bullet);
    this.load.audio('laser_fire', GameConfig.assets.laserSound);
    this.load.audio('player_hit', GameConfig.assets.hitSound);
    this.load.audio('boost_fire', GameConfig.assets.boostSound);
    this.load.audio('weapon_hit', GameConfig.assets.weaponHitSound);

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
    this.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'backdrop')
      .setOrigin(0, 0)
      .setDepth(-1);

    // Effects
    this.shootingStars = new ShootingStarRenderer(this, networkManager.getSocket());
    this.shootingStars.init();

    this.bulletRenderer = new BulletRenderer(this, networkManager.getSocket());
    this.bulletRenderer.init();

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

    this.time.addEvent({
      delay: 3000,
      loop: true,
      callback: () => {
        this.spawnCollectibleStar();
      }
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

    const starData = this.collectibleStars
      ? this.collectibleStars.getChildren().map((star) => ({
          x: star.x,
          y: star.y
        }))
      : [];

    uiManager.updateMinimap({
      players: minimapData,
      myId: socketId,
      stars: starData
    });

    this._updateBoostMeter();
    uiManager.tick(this.cameras.main);
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
    const borderColor = 0x880000;

    this.add.rectangle(WORLD_W / 2, borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    this.add.rectangle(WORLD_W / 2, WORLD_H - borderWidth / 2, WORLD_W, borderWidth, borderColor).setDepth(0);
    this.add.rectangle(borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
    this.add.rectangle(WORLD_W - borderWidth / 2, WORLD_H / 2, borderWidth, WORLD_H, borderColor).setDepth(0);
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
   * Spawn a collectible star.
   */
  spawnCollectibleStar() {
    if (!this.collectibleStars) return;

    const x = Phaser.Math.Between(100, GameConfig.world.width - 100);
    const y = Phaser.Math.Between(100, GameConfig.world.height - 100);

    const star = this.collectibleStars.create(x, y, 'glow_particle');
    if (!star) return;

    star.setScale(0.55);
    star.setAlpha(0.9);
    star.setDepth(2);

    star.xpValue = 10;
    star.pointValue = 1;

    this.tweens.add({
      targets: star,
      alpha: 0.45,
      scale: 0.42,
      duration: 650,
      yoyo: true,
      repeat: -1
    });
  }

  /**
   * Check for local star collection.
   *
   * @private
   */
  _checkLocalStarCollection() {
    if (!this.entityManager || !this.collectibleStars) return;

    const localShip = this.entityManager.getLocalShip
      ? this.entityManager.getLocalShip()
      : null;

    if (!localShip) return;

    const localX = localShip.predicted?.x ?? localShip.x ?? localShip.serverState?.x;
    const localY = localShip.predicted?.y ?? localShip.y ?? localShip.serverState?.y;

    if (typeof localX !== 'number' || typeof localY !== 'number') return;

    const stars = this.collectibleStars.getChildren();

    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (!star || !star.active) continue;

      const dist = Phaser.Math.Distance.Between(localX, localY, star.x, star.y);
      if (dist <= 40) {
        this.collectStar(star);
      }
    }
  }

  /**
   * Handle a collected star.
   *
   * @param {*} star
   */
  collectStar(star) {
    if (!star || !star.active) return;

    const x = star.x;
    const y = star.y;
    const xpValue = star.xpValue || 10;
    const pointValue = star.pointValue || 1;

    star.destroy();

    if (uiManager.levelPanel) {
      if (uiManager.levelPanel.gainXp) {
        uiManager.levelPanel.gainXp(xpValue);
      }

      if (uiManager.levelPanel.addPoint) {
        uiManager.levelPanel.addPoint(pointValue);
      }

      this.playerProgress = uiManager.getPlayerProgress();
      gameState.setPlayerProgress(this.playerProgress);
    }

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
      addPart('verb', ' hit a wall');
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

    socket.on('bulletHit', (data) => {
      this._playShipHitCue(data);
      this._playWeaponHitSound(data);
    });

    socket.on('playerKilled', (data) => {
      this._showKillFeedEntry(data);

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
          this._boostCooldownUntil = 0;
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
