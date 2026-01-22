/**
 * Ship - Base class for all ship entities
 *
 * Provides configurable stats, physics integration, and common behavior.
 * Extend this class to create specific ship types (player ships, AI ships, etc.)
 */
class Ship {
  constructor(id, x, y, config = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.rotation = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.angularVelocity = 0;

    // Configurable stats (for future upgrades/different ship types)
    this.stats = {
      maxSpeed: config.maxSpeed || 400,
      acceleration: config.acceleration || 200,
      angularSpeed: config.angularSpeed || (300 * (Math.PI / 180)), // 5.236 rad/s
      dragFactor: config.dragFactor || 0.98,
    };

    // Combat/progression stats
    this.hp = config.hp || 100;
    this.maxHp = config.maxHp || 100;
    this.xp = config.xp || 0;
    this.maxXp = config.maxXp || 100;
    this.team = config.team || 'neutral';

    // Input state
    this.input = { left: false, right: false, up: false, down: false };

    // Physics body (set by initPhysics)
    this.body = null;

    // World bounds (can be overridden)
    this.worldWidth = config.worldWidth || 2000;
    this.worldHeight = config.worldHeight || 2000;
    this.borderBuffer = config.borderBuffer || 20;
  }

  /**
   * Initialize physics body for this ship
   * @param {ArcadePhysics} physics - The arcade-physics instance
   * @param {number} width - Body width (default 53)
   * @param {number} height - Body height (default 40)
   */
  initPhysics(physics, width = 53, height = 40) {
    this.body = physics.add.body(this.x, this.y, width, height);
    this.body.setDrag(0); // We handle drag manually for smooth directional deceleration
    this.body.setMaxVelocity(this.stats.maxSpeed);
    this.body.shipId = this.id; // Reference back to this ship
    return this.body;
  }

  /**
   * Apply movement based on current input state
   * Handles rotation, acceleration, deceleration, and drag
   * @param {ArcadePhysics} physics - The arcade-physics instance (for velocityFromRotation)
   */
  applyMovement(physics) {
    if (!this.body) return;

    const input = this.input;

    // Rotation using physics body's angular velocity
    if (input.left) {
      this.body.setAngularVelocity(-this.stats.angularSpeed);
    } else if (input.right) {
      this.body.setAngularVelocity(this.stats.angularSpeed);
    } else {
      this.body.setAngularVelocity(0);
    }

    // Acceleration using physics body
    if (input.up) {
      // Use arcade-physics velocityFromRotation method
      const angle = this.body.rotation + 1.5;
      physics.velocityFromRotation(angle, this.stats.acceleration, this.body.acceleration);
    } else if (input.down) {
      // Deceleration - apply braking force
      const currentVel = this.body.velocity.length();
      if (currentVel > 50) {
        // Normal deceleration for higher speeds
        const decelX = -this.body.velocity.x * 0.1;
        const decelY = -this.body.velocity.y * 0.1;
        this.body.setAcceleration(decelX * 10, decelY * 10);
      } else if (currentVel > 5) {
        // Aggressive deceleration when below 50 velocity
        const decelX = -this.body.velocity.x * 0.3;
        const decelY = -this.body.velocity.y * 0.3;
        this.body.setAcceleration(decelX * 10, decelY * 10);
      } else {
        // When nearly stopped, set velocity to zero
        this.body.setVelocity(0, 0);
        this.body.setAcceleration(0, 0);
      }
    } else {
      this.body.setAcceleration(0, 0);

      // Custom directional drag - only when not accelerating
      const currentSpeed = this.body.velocity.length();
      if (currentSpeed > 1) {
        // Apply drag per frame - reduces speed but preserves direction
        this.body.setVelocity(
          this.body.velocity.x * this.stats.dragFactor,
          this.body.velocity.y * this.stats.dragFactor
        );
      } else {
        // Snap to zero when nearly stopped to prevent micro-drifting
        this.body.setVelocity(0, 0);
      }
    }

    // Bounds checking with buffer
    this.enforceBounds();
  }

  /**
   * Enforce world boundary constraints
   */
  enforceBounds() {
    if (!this.body) return;

    if (this.body.x < this.borderBuffer) {
      this.body.x = this.borderBuffer;
      this.body.setVelocityX(0);
    } else if (this.body.x > this.worldWidth - this.borderBuffer) {
      this.body.x = this.worldWidth - this.borderBuffer;
      this.body.setVelocityX(0);
    }

    if (this.body.y < this.borderBuffer) {
      this.body.y = this.borderBuffer;
      this.body.setVelocityY(0);
    } else if (this.body.y > this.worldHeight - this.borderBuffer) {
      this.body.y = this.worldHeight - this.borderBuffer;
      this.body.setVelocityY(0);
    }
  }

  /**
   * Sync ship state from physics body
   * Call this after physics world update
   */
  syncFromBody() {
    if (!this.body) return;

    this.x = this.body.x;
    this.y = this.body.y;
    this.rotation = this.body.rotation;
    this.velocityX = this.body.velocity.x;
    this.velocityY = this.body.velocity.y;
    this.angularVelocity = this.body.angularVelocity;
  }

  /**
   * Apply damage to the ship
   * @param {number} amount - Amount of damage to apply
   * @returns {boolean} - True if ship is destroyed (hp <= 0)
   */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    return this.hp <= 0;
  }

  /**
   * Heal the ship
   * @param {number} amount - Amount to heal
   */
  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /**
   * Add XP to the ship
   * @param {number} amount - Amount of XP to add
   * @returns {boolean} - True if ship leveled up (xp >= maxXp)
   */
  gainXP(amount) {
    this.xp = Math.min(this.maxXp, this.xp + amount);
    return this.xp >= this.maxXp;
  }

  /**
   * Serialize ship state for network transmission
   * @returns {Object} - Ship state object
   */
  serialize() {
    return {
      playerId: this.id,
      x: this.x,
      y: this.y,
      rotation: this.rotation,
      velocityX: this.velocityX,
      velocityY: this.velocityY,
      angularVelocity: this.angularVelocity,
      team: this.team,
      hp: this.hp,
      maxHp: this.maxHp,
      xp: this.xp,
      maxXp: this.maxXp
    };
  }

  /**
   * Clean up resources when ship is destroyed
   */
  destroy() {
    if (this.body) {
      this.body.destroy();
      this.body = null;
    }
  }
}

module.exports = Ship;
