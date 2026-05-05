/**
 * ClientShip - Client-side ship representation
 *
 * Wraps a Phaser sprite with interpolation, prediction, and visual management.
 * Mirrors the server's Ship class structure for consistency.
 */

import GameConfig from '../config/GameConfig.js';

class ClientShip {
  /**
   * Create a new client ship
   * @param {Phaser.Scene} scene - The Phaser scene
   * @param {string} id - The player/ship ID
   * @param {Object} serverState - Initial state from server
   */
  constructor(scene, id, serverState) {
    this.scene = scene;
    this.id = id;
    this.socketId = serverState.playerId || id;
    this.playerName = serverState.playerName || null;
    this.shipLevel = Number.isFinite(Number(serverState.shipLevel))
      ? Math.max(1, Math.floor(Number(serverState.shipLevel)))
      : 1;
    this.team = serverState.team || 'neutral';

    // Position and physics state
    this.x = serverState.x || 0;
    this.y = serverState.y || 0;
    this.rotation = serverState.rotation || 0;
    this.velocityX = serverState.velocityX || 0;
    this.velocityY = serverState.velocityY || 0;

    // Server state for interpolation
    this.serverState = {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      vx: this.velocityX,
      vy: this.velocityY,
      timestamp: Date.now()
    };

    // Prediction state (for local player)
    this.predicted = {
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      vx: this.velocityX,
      vy: this.velocityY
    };
    this.predictionInitialized = false;

    // Physics constants from config (must match server)
    const classKey = serverState.classKey || GameConfig.defaultClass;
    const classConfig = GameConfig.shipClasses[classKey] || GameConfig.shipClasses[GameConfig.defaultClass];
    this.classKey = classKey;
    this.stats = {
      maxSpeed: classConfig.stats.speed || 400,
      acceleration: classConfig.stats.accel || 200,
      angularSpeed: GameConfig.shipPhysics.angularSpeed,
      dragFactor: GameConfig.shipPhysics.dragFactor,
      gripFactor: GameConfig.shipPhysics.gripFactor
    };

    this.boost = {
      cooldownMs: serverState.boostCooldownMs || GameConfig.boost.cooldownMs,
      impulse: GameConfig.boost.impulse,
      durationMs: serverState.boostDurationMs || GameConfig.boost.durationMs,
      momentumMs: serverState.boostMomentumMs || GameConfig.boost.momentumMs,
      maxSpeedMultiplier: GameConfig.boost.maxSpeedMultiplier
    };
    this._lastPredictedBoostAt = 0;
    this._boostActiveUntil = 0;
    this._boostMomentumUntil = 0;
    this._boostMomentumSpeedCap = 0;
    this._lastBoostSprayAt = 0;

    // World bounds from config
    this.worldWidth = GameConfig.world.width;
    this.worldHeight = GameConfig.world.height;
    this.borderBuffer = GameConfig.world.borderBuffer;

    // Create visual elements
    this.sprite = null;
    this.nameText = null;
    this.levelText = null;
    this.trailParticles = null;
    this.trailEmitter = null;
    this._createSprite(serverState);
  }

  /**
   * Create the Phaser sprite and name label
   * @param {Object} serverState - Initial state from server
   */
  _createSprite(serverState) {
    const scene = this.scene;

    // Get sprite key from config
    const classConfig = GameConfig.shipClasses[this.classKey] || GameConfig.shipClasses[GameConfig.defaultClass];
    const spriteKey = classConfig.spriteKey;

    // Create ship sprite
    if (scene.textures.exists(spriteKey)) {
      this.sprite = scene.add.sprite(this.x, this.y, spriteKey);
    } else {
      // Fallback to default sprite or rectangle
      console.warn(`Ship texture '${spriteKey}' not found, using fallback`);
      if (scene.textures.exists('ship_hunter')) {
        this.sprite = scene.add.sprite(this.x, this.y, 'ship_hunter');
      } else {
        this.sprite = scene.add.rectangle(this.x, this.y, 53, 40, 0x888888);
      }
    }

    this.sprite.setDisplaySize(GameConfig.sprites.ship.width, GameConfig.sprites.ship.height);
    this.sprite.setOrigin(0.5, 0.5);
    this.sprite.setVisible(true);
    this.sprite.setDepth(1);
    this.sprite.setActive(true);
    this.sprite.rotation = this.rotation;

    // Apply team tint
    this._applyTeamTint();

    // Create trailing glow particles
    this._createTrail();

    // Create name label and level tag
    const displayName = this.playerName || this.id.substring(0, 8);
    this.nameText = scene.add.text(this.x, this.y - GameConfig.sprites.nameOffset, displayName, {
      font: '16px Orbitron, sans-serif',
      fill: '#00ffff',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.nameText.setOrigin(0.5, 0.5);
    this.nameText.setDepth(2);

    this.levelText = scene.add.text(this.x, this.y - GameConfig.sprites.nameOffset, '', {
      font: '14px Orbitron, sans-serif',
      fill: '#a8ff9a',
      align: 'center',
      stroke: '#000000',
      strokeThickness: 2
    });
    this.levelText.setOrigin(0.5, 0.5);
    this.levelText.setDepth(2);
    this._refreshNameTag();

    console.log('Created sprite for player:', displayName, 'at', this.x, this.y);
  }

  /**
   * Refresh name and level text.
   *
   * @private
   */
  _refreshNameTag() {
    if (this.nameText) {
      this.nameText.setText(this.getDisplayName());
    }

    if (this.levelText) {
      this.levelText.setText(`Lv ${this.shipLevel}`);
    }

    const pose = this._getVisualPose();
    if (pose) {
      this._layoutNameTag(pose.x, pose.y);
    }
  }

  /**
   * Position the split name and level labels around a shared center.
   *
   * @param {number} x
   * @param {number} y
   * @private
   */
  _layoutNameTag(x, y) {
    if (!this.nameText && !this.levelText) return;

    const labelY = y - GameConfig.sprites.nameOffset;
    const spacing = 5;
    const nameWidth = this.nameText?.width || 0;
    const levelWidth = this.levelText?.width || 0;
    const totalWidth = nameWidth + spacing + levelWidth;
    const left = x - (totalWidth / 2);

    if (this.nameText) {
      this.nameText.x = left + (nameWidth / 2);
      this.nameText.y = labelY;
    }

    if (this.levelText) {
      this.levelText.x = left + nameWidth + spacing + (levelWidth / 2);
      this.levelText.y = labelY;
    }
  }

  /**
   * Create trailing glow particle emitter
   * @private
   */
  _createTrail() {
    const scene = this.scene;
    if (!scene.textures.exists('glow_particle')) return;

    this.trailParticles = scene.add.particles('glow_particle');
    this.trailParticles.setDepth(0);

    this.trailEmitter = this.trailParticles.createEmitter({
      speed: { min: 5, max: 20 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.7, end: 0 },
      lifespan: 500,
      blendMode: 'ADD',
      frequency: 40,
      tint: 0x00ffff,
      follow: this.sprite
    });
  }

  /**
   * Apply team color tint to sprite
   */
  _applyTeamTint() {
    if (!this.sprite) return;
    this.sprite.clearTint();
  }

  /**
   * Update from server state.
   *
   * @param {Object} serverState
   */
  updateFromServer(serverState) {
    const wasBoostActive = this._isBoostActive();

    this.serverState = {
      x: serverState.x,
      y: serverState.y,
      rotation: serverState.rotation,
      vx: serverState.velocityX || 0,
      vy: serverState.velocityY || 0,
      timestamp: Date.now()
    };

    // Update class visuals if needed
    if (serverState.classKey && serverState.classKey !== this.classKey) {
      this._applyClassKey(serverState.classKey);
    }

    // Update live movement stats from server
    if (Number.isFinite(serverState.maxSpeed)) {
      this.stats.maxSpeed = serverState.maxSpeed;
    }

    if (Number.isFinite(serverState.acceleration)) {
      this.stats.acceleration = serverState.acceleration;
    }

    if (Number.isFinite(serverState.boostCooldownMs)) {
      this.boost.cooldownMs = serverState.boostCooldownMs;
    }

    if (Number.isFinite(serverState.boostDurationMs)) {
      this.boost.durationMs = serverState.boostDurationMs;
    }

    if (Number.isFinite(serverState.boostMomentumMs)) {
      this.boost.momentumMs = serverState.boostMomentumMs;
    }

    if (
      Number.isFinite(serverState.boostCooldownRemainingMs) &&
      serverState.boostCooldownRemainingMs > 0
    ) {
      this._lastPredictedBoostAt = Date.now() - (this.boost.cooldownMs - serverState.boostCooldownRemainingMs);
    }

    if (
      Number.isFinite(serverState.boostActiveRemainingMs) &&
      serverState.boostActiveRemainingMs > 0
    ) {
      this._boostActiveUntil = Date.now() + serverState.boostActiveRemainingMs;
      if (!wasBoostActive) {
        this._emitBoostBurst();
      }
    }

    // Update player name if changed
    if (serverState.playerName && serverState.playerName !== this.playerName) {
      this.playerName = serverState.playerName;
      this._refreshNameTag();
    }

    const nextLevel = Number(serverState.shipLevel);
    if (Number.isFinite(nextLevel) && Math.floor(nextLevel) !== this.shipLevel) {
      this.setShipLevel(nextLevel);
    }

    // Ensure sprite is visible
    if (this.sprite && !this.sprite.visible) {
      console.warn('Sprite was invisible, making visible:', this.getDisplayName());
      this.sprite.setVisible(true);
    }
  }

  /**
   * Apply a new class key and update visuals/stats.
   *
   * @param {string} newClassKey
   * @private
   */
  _applyClassKey(newClassKey) {
    const hasClass = !!GameConfig.shipClasses[newClassKey];
    const safeKey = hasClass ? newClassKey : GameConfig.defaultClass;
    const classConfig = GameConfig.shipClasses[safeKey];

    this.classKey = safeKey;
    this.stats.maxSpeed = classConfig.stats.speed || this.stats.maxSpeed;
    this.stats.acceleration = classConfig.stats.accel || this.stats.acceleration;

    const spriteKey = classConfig.spriteKey;

    if (
      this.sprite &&
      typeof this.sprite.setTexture === 'function' &&
      this.scene.textures.exists(spriteKey)
    ) {
      this.sprite.setTexture(spriteKey);
      this.sprite.setDisplaySize(GameConfig.sprites.ship.width, GameConfig.sprites.ship.height);
      this._applyTeamTint();
      return;
    }

    // Fallback
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.nameText) {
      this.nameText.destroy();
      this.nameText = null;
    }
    if (this.levelText) {
      this.levelText.destroy();
      this.levelText = null;
    }

    this._createSprite({});
  }

  /**
   * Initialize prediction state from server
   * @param {Object} serverState - State from server
   */
  initPrediction(serverState) {
    this.predicted.x = serverState.x;
    this.predicted.y = serverState.y;
    this.predicted.rotation = serverState.rotation || 0;
    this.predicted.vx = serverState.velocityX || 0;
    this.predicted.vy = serverState.velocityY || 0;
    this.predictionInitialized = true;
  }

  /**
   * Apply client-side prediction for local player
   * @param {Object} input - Current input state
   * @param {number} dt - Delta time in seconds
   */
  applyPrediction(input, dt) {
    if (!this.predictionInitialized) return;

    // Apply rotation
    if (input.left) {
      this.predicted.rotation -= this.stats.angularSpeed * dt;
    } else if (input.right) {
      this.predicted.rotation += this.stats.angularSpeed * dt;
    }

    // Apply acceleration/deceleration
    if (input.up) {
      const angle = this.predicted.rotation + 1.5; // Match server's angle offset
      this.predicted.vx += Math.cos(angle) * this.stats.acceleration * dt;
      this.predicted.vy += Math.sin(angle) * this.stats.acceleration * dt;
    } else if (input.down) {
      // Braking
      const currentVel = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
      if (currentVel > 50) {
        const brakeFactor = Math.pow(0.9, dt * 60);
        this.predicted.vx *= brakeFactor;
        this.predicted.vy *= brakeFactor;
      } else if (currentVel > 5) {
        const brakeFactor = Math.pow(0.7, dt * 60);
        this.predicted.vx *= brakeFactor;
        this.predicted.vy *= brakeFactor;
      } else {
        this.predicted.vx = 0;
        this.predicted.vy = 0;
      }
    } else {
      // Drag when coasting
      const currentSpeed = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
      if (currentSpeed > 1) {
        const dragPerFrame = Math.pow(this.stats.dragFactor, dt * 60);
        this.predicted.vx *= dragPerFrame;
        this.predicted.vy *= dragPerFrame;
      } else {
        this.predicted.vx = 0;
        this.predicted.vy = 0;
      }
    }

    // Car-like steering: redirect velocity toward facing direction
    const currentSpeed = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
    if (currentSpeed > 1) {
      const facingAngle = this.predicted.rotation + 1.5;
      const facingX = Math.cos(facingAngle);
      const facingY = Math.sin(facingAngle);

      const forwardSpeed = this.predicted.vx * facingX + this.predicted.vy * facingY;
      const lateralX = this.predicted.vx - forwardSpeed * facingX;
      const lateralY = this.predicted.vy - forwardSpeed * facingY;

      const gripPerFrame = 1 - Math.pow(1 - this.stats.gripFactor, dt * 60);
      this.predicted.vx -= lateralX * gripPerFrame;
      this.predicted.vy -= lateralY * gripPerFrame;
    }

    this._applyBoostPrediction(input);

    // Clamp velocity to max
    const speed = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
    const maxSpeed = this._getCurrentMaxSpeed(speed);
    if (speed > maxSpeed) {
      this.predicted.vx = (this.predicted.vx / speed) * maxSpeed;
      this.predicted.vy = (this.predicted.vy / speed) * maxSpeed;
    }

    // Update position
    this.predicted.x += this.predicted.vx * dt;
    this.predicted.y += this.predicted.vy * dt;

    // Bounds checking
    if (this.predicted.x < this.borderBuffer) {
      this.predicted.x = this.borderBuffer;
      this.predicted.vx = 0;
    } else if (this.predicted.x > this.worldWidth - this.borderBuffer) {
      this.predicted.x = this.worldWidth - this.borderBuffer;
      this.predicted.vx = 0;
    }
    if (this.predicted.y < this.borderBuffer) {
      this.predicted.y = this.borderBuffer;
      this.predicted.vy = 0;
    } else if (this.predicted.y > this.worldHeight - this.borderBuffer) {
      this.predicted.y = this.worldHeight - this.borderBuffer;
      this.predicted.vy = 0;
    }

    // Apply to sprite
    this._updateSprite(this.predicted.x, this.predicted.y, this.predicted.rotation);
  }

  _getCurrentMaxSpeed(currentSpeed = 0) {
    const now = Date.now();
    if (now < this._boostActiveUntil) {
      return this.stats.maxSpeed * this.boost.maxSpeedMultiplier;
    }

    if (now < this._boostMomentumUntil && currentSpeed > this.stats.maxSpeed) {
      const momentumCap = this._boostMomentumSpeedCap || currentSpeed;
      return Math.min(
        this.stats.maxSpeed * this.boost.maxSpeedMultiplier,
        Math.max(this.stats.maxSpeed, momentumCap)
      );
    }

    return this.stats.maxSpeed;
  }

  _applyBoostPrediction(input) {
    if (!input.boost) return;

    const now = Date.now();
    if (now - this._lastPredictedBoostAt < this.boost.cooldownMs) return;

    const angle = this.predicted.rotation + 1.5;
    this.predicted.vx += Math.cos(angle) * this.boost.impulse;
    this.predicted.vy += Math.sin(angle) * this.boost.impulse;
    this._lastPredictedBoostAt = now;
    this._boostActiveUntil = now + this.boost.durationMs;
    this._boostMomentumUntil = now + this.boost.durationMs + this.boost.momentumMs;
    const boostSpeed = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
    this._boostMomentumSpeedCap = Math.min(
      this.stats.maxSpeed * this.boost.maxSpeedMultiplier,
      boostSpeed
    );
    this._emitBoostBurst();
  }

  _isBoostActive(now = Date.now()) {
    return now < this._boostActiveUntil;
  }

  _emitBoostBurst() {
    const pose = this._getVisualPose();
    if (!pose) return;

    this._spawnBoostThrusterParticles(pose.x, pose.y, pose.rotation, 10, true);
    this._lastBoostSprayAt = 0;
  }

  _updateBoostThruster(x, y, rotation) {
    const now = Date.now();
    if (!this._isBoostActive(now)) return;
    if (now - this._lastBoostSprayAt < 28) return;

    this._lastBoostSprayAt = now;
    this._spawnBoostThrusterParticles(x, y, rotation, 4, false);
  }

  _spawnBoostThrusterParticles(x, y, rotation, count, burst = false) {
    if (!this.scene || !this.scene.textures.exists('glow_particle')) return;

    const forwardAngle = rotation + 1.5;
    const backAngle = forwardAngle + Math.PI;
    const backOffset = GameConfig.sprites.ship.height * 0.58;
    const originX = x + Math.cos(backAngle) * backOffset;
    const originY = y + Math.sin(backAngle) * backOffset;
    const spread = burst ? 0.95 : 0.55;

    for (let i = 0; i < count; i++) {
      const particleAngle = backAngle + ((Math.random() - 0.5) * spread);
      const distance = burst
        ? 34 + (Math.random() * 54)
        : 18 + (Math.random() * 34);
      const startJitter = (Math.random() - 0.5) * (burst ? 12 : 7);
      const sideAngle = backAngle + Math.PI / 2;
      const startX = originX + Math.cos(sideAngle) * startJitter;
      const startY = originY + Math.sin(sideAngle) * startJitter;
      const endX = startX + Math.cos(particleAngle) * distance;
      const endY = startY + Math.sin(particleAngle) * distance;
      const tint = Math.random() > 0.45 ? 0x66f7ff : 0xffb347;
      const startScale = burst
        ? 0.28 + (Math.random() * 0.24)
        : 0.18 + (Math.random() * 0.18);

      const particle = this.scene.add.image(startX, startY, 'glow_particle')
        .setTint(tint)
        .setBlendMode('ADD')
        .setScale(startScale)
        .setAlpha(burst ? 0.9 : 0.72)
        .setDepth(0.95);

      this.scene.tweens.add({
        targets: particle,
        x: endX,
        y: endY,
        alpha: 0,
        scale: 0,
        duration: burst ? 260 : 190,
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy()
      });
    }
  }

  _getVisualPose() {
    if (this.sprite) {
      return {
        x: this.sprite.x,
        y: this.sprite.y,
        rotation: this.sprite.rotation
      };
    }

    return {
      x: this.predicted?.x ?? this.x,
      y: this.predicted?.y ?? this.y,
      rotation: this.predicted?.rotation ?? this.rotation
    };
  }

  /**
   * Reconcile prediction with server state
   * @param {Object} serverState - Authoritative state from server
   * @param {number} snapThreshold - Squared distance threshold for snapping
   */
  reconcile(serverState, snapThreshold = 10000) {
    const dx = serverState.x - this.predicted.x;
    const dy = serverState.y - this.predicted.y;
    const errorSquared = dx * dx + dy * dy;

    const blendFactor = 0.1;

    if (errorSquared > snapThreshold) {
      // Large error - snap to server
      this.predicted.x = serverState.x;
      this.predicted.y = serverState.y;
      this.predicted.rotation = serverState.rotation;
      this.predicted.vx = serverState.velocityX || 0;
      this.predicted.vy = serverState.velocityY || 0;
    } else {
      // Small error - blend toward server
      this.predicted.x = this._lerp(this.predicted.x, serverState.x, blendFactor);
      this.predicted.y = this._lerp(this.predicted.y, serverState.y, blendFactor);
      this.predicted.rotation = this._lerpAngle(this.predicted.rotation, serverState.rotation, blendFactor);
      this.predicted.vx = this._lerp(this.predicted.vx, serverState.velocityX || 0, blendFactor);
      this.predicted.vy = this._lerp(this.predicted.vy, serverState.velocityY || 0, blendFactor);
    }

    // Apply to sprite
    this._updateSprite(this.predicted.x, this.predicted.y, this.predicted.rotation);
  }

  /**
   * Interpolate toward server state (for remote players)
   * @param {number} lerpFactor - Interpolation factor (0-1)
   */
  interpolate(lerpFactor = 0.15) {
    this.x = this._lerp(this.x, this.serverState.x, lerpFactor);
    this.y = this._lerp(this.y, this.serverState.y, lerpFactor);
    this.rotation = this._lerpAngle(this.rotation, this.serverState.rotation, lerpFactor);

    this._updateSprite(this.x, this.y, this.rotation);
  }

  /**
   * Update sprite position and rotation
   */
  _updateSprite(x, y, rotation) {
    if (this.sprite) {
      this.sprite.x = x;
      this.sprite.y = y;
      this.sprite.rotation = rotation;
    }
    if (this.nameText) {
      this._layoutNameTag(x, y);
    }

    this._updateBoostThruster(x, y, rotation);
  }

  /**
   * Linear interpolation
   */
  _lerp(a, b, t) {
    return a + (b - a) * Math.max(0, Math.min(1, t));
  }

  /**
   * Angle interpolation (handles wrap-around)
   */
  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * Math.max(0, Math.min(1, t));
  }

  /**
   * Get display name
   * @returns {string}
   */
  getDisplayName() {
    return this.playerName || this.id.substring(0, 8);
  }

  /**
   * Update the displayed ship level.
   *
   * @param {number} level
   */
  setShipLevel(level) {
    const nextLevel = Number(level);
    if (!Number.isFinite(nextLevel)) return;

    this.shipLevel = Math.max(1, Math.floor(nextLevel));
    this._refreshNameTag();
  }

  /**
   * Set camera to follow this ship
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   */
  setCamera(camera) {
    if (this.sprite) {
      camera.startFollow(this.sprite, true, 0.1, 0.1);
      console.log('Camera now following sprite at:', this.sprite.x, this.sprite.y);
    }
  }

  /**
   * Get position for minimap/UI
   * @returns {Object}
   */
  getPosition() {
    return {
      x: this.sprite ? this.sprite.x : this.x,
      y: this.sprite ? this.sprite.y : this.y
    };
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.trailParticles) {
      this.trailParticles.destroy();
      this.trailParticles = null;
      this.trailEmitter = null;
    }
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.nameText) {
      this.nameText.destroy();
      this.nameText = null;
    }
    if (this.levelText) {
      this.levelText.destroy();
      this.levelText = null;
    }
  }
}

// Export for use in browser (attached to window) and ES6 modules
if (typeof window !== 'undefined') {
  window.ClientShip = ClientShip;
}

export default ClientShip;
