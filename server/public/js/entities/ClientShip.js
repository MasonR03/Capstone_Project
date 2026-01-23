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
      angularSpeed: 300 * (Math.PI / 180), // 5.236 rad/s
      dragFactor: 0.98
    };

    // World bounds from config
    this.worldWidth = GameConfig.world.width;
    this.worldHeight = GameConfig.world.height;
    this.borderBuffer = GameConfig.world.borderBuffer;

    // Create visual elements
    this.sprite = null;
    this.nameText = null;
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

    // Create name label
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

    console.log('Created sprite for player:', displayName, 'at', this.x, this.y);
  }

  /**
   * Apply team color tint to sprite
   */
  _applyTeamTint() {
    if (!this.sprite) return;

    if (this.team === 'red') {
      this.sprite.setTint(0xff4444);
    } else if (this.team === 'blue') {
      this.sprite.setTint(0x4444ff);
    }
  }

  /**
   * Update from server state
   * @param {Object} serverState - State received from server
   */
  updateFromServer(serverState) {
    this.serverState = {
      x: serverState.x,
      y: serverState.y,
      rotation: serverState.rotation,
      vx: serverState.velocityX || 0,
      vy: serverState.velocityY || 0,
      timestamp: Date.now()
    };

    // Update player name if changed
    if (serverState.playerName && serverState.playerName !== this.playerName) {
      this.playerName = serverState.playerName;
      if (this.nameText) {
        this.nameText.setText(this.playerName);
      }
    }

    // Ensure sprite is visible
    if (this.sprite && !this.sprite.visible) {
      console.warn('Sprite was invisible, making visible:', this.getDisplayName());
      this.sprite.setVisible(true);
    }
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

    // Clamp velocity to max
    const speed = Math.sqrt(this.predicted.vx ** 2 + this.predicted.vy ** 2);
    if (speed > this.stats.maxSpeed) {
      this.predicted.vx = (this.predicted.vx / speed) * this.stats.maxSpeed;
      this.predicted.vy = (this.predicted.vy / speed) * this.stats.maxSpeed;
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
      this.nameText.x = x;
      this.nameText.y = y - GameConfig.sprites.nameOffset;
    }
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
    if (this.sprite) {
      this.sprite.destroy();
      this.sprite = null;
    }
    if (this.nameText) {
      this.nameText.destroy();
      this.nameText = null;
    }
  }
}

// Export for use in browser (attached to window) and ES6 modules
if (typeof window !== 'undefined') {
  window.ClientShip = ClientShip;
}

export default ClientShip;
