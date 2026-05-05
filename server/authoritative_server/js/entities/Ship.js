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
    this.classKey = config.classKey || 'hunter';
    this.rotation = 0;
    this.velocityX = 0;
    this.velocityY = 0;
    this.angularVelocity = 0;

    // Configurable stats (for future upgrades/different ship types)
    this.stats = {
      maxSpeed: config.maxSpeed || 400,
      acceleration: config.acceleration || 200,
      angularSpeed: config.angularSpeed || (420 * (Math.PI / 180)), // 7.33 rad/s
      dragFactor: config.dragFactor || 0.988,
      gripFactor: config.gripFactor || 0.1, // lateral velocity dampening per frame (0=spaceship, higher=car-like)
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

    // Collision state
    this.collisionRadius = config.collisionRadius || 26;
    this.lastCollisionDamageAt = 0;
    this._atBarrier = false;
    this.barrierHitThisFrame = false;

    // Boost state
    this.boostCooldownMs = config.boostCooldownMs || 3000;
    this.boostImpulse = config.boostImpulse || 360;
    this.boostDurationMs = config.boostDurationMs || 450;
    this.boostMaxSpeedMultiplier = config.boostMaxSpeedMultiplier || 1.65;
    this.lastBoostAt = config.lastBoostAt || 0;
    this.boostActiveUntil = 0;
    this.boostQueued = false;
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

  getBoostMaxSpeed() {
    return this.stats.maxSpeed * this.boostMaxSpeedMultiplier;
  }

  getBoostCooldownRemaining(now = Date.now()) {
    return Math.max(0, this.boostCooldownMs - (now - this.lastBoostAt));
  }

  syncBoostVelocityCap(now = Date.now()) {
    if (!this.body) return;

    const maxVelocity = now < this.boostActiveUntil
      ? this.getBoostMaxSpeed()
      : this.stats.maxSpeed;

    this.body.setMaxVelocity(maxVelocity);
  }

  queueBoost() {
    this.boostQueued = true;
  }

  /**
   * Apply movement based on current input state
   * Handles rotation, acceleration, deceleration, and drag
   * @param {ArcadePhysics} physics - The arcade-physics instance (for velocityFromRotation)
   */
  applyMovement(physics) {
    if (!this.body) return;

    this.syncBoostVelocityCap();

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

    // Car-like steering: redirect velocity toward facing direction
    const speed = this.body.velocity.length();
    if (speed > 1) {
      const facingAngle = this.body.rotation + 1.5;
      const facingX = Math.cos(facingAngle);
      const facingY = Math.sin(facingAngle);

      // Decompose velocity into forward and lateral components
      const forwardSpeed = this.body.velocity.x * facingX + this.body.velocity.y * facingY;
      const lateralX = this.body.velocity.x - forwardSpeed * facingX;
      const lateralY = this.body.velocity.y - forwardSpeed * facingY;

      // Dampen lateral velocity for grip
      this.body.setVelocity(
        this.body.velocity.x - lateralX * this.stats.gripFactor,
        this.body.velocity.y - lateralY * this.stats.gripFactor
      );
    }

    this.applyBoost();

    // Bounds checking with buffer
    this.enforceBounds();
  }

  applyBoost() {
    if (!this.boostQueued || !this.body) return;

    this.boostQueued = false;
    if (this.hp <= 0) return;

    const now = Date.now();
    if (this.getBoostCooldownRemaining(now) > 0) return;

    const angle = this.body.rotation + 1.5;
    const nextVx = this.body.velocity.x + Math.cos(angle) * this.boostImpulse;
    const nextVy = this.body.velocity.y + Math.sin(angle) * this.boostImpulse;

    this.body.setVelocity(nextVx, nextVy);
    this.boostActiveUntil = now + this.boostDurationMs;
    this.syncBoostVelocityCap(now);
    this._clampVelocity(this.getBoostMaxSpeed());
    this.lastBoostAt = now;
  }

  _clampVelocity(maxSpeed) {
    if (!this.body || !Number.isFinite(maxSpeed) || maxSpeed <= 0) return;

    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      this.body.setVelocity(vx * scale, vy * scale);
    }
  }

  /**
   * Enforce world boundary constraints.
   *
   * Sets {@link Ship#barrierHitThisFrame} to true on the rising edge of a
   * barrier contact so a ship pressed against the wall is only damaged once.
   */
  enforceBounds() {
    if (!this.body) return;

    let touching = false;

    if (this.body.x < this.borderBuffer) {
      this.body.x = this.borderBuffer;
      this.body.setVelocityX(0);
      touching = true;
    } else if (this.body.x > this.worldWidth - this.borderBuffer) {
      this.body.x = this.worldWidth - this.borderBuffer;
      this.body.setVelocityX(0);
      touching = true;
    }

    if (this.body.y < this.borderBuffer) {
      this.body.y = this.borderBuffer;
      this.body.setVelocityY(0);
      touching = true;
    } else if (this.body.y > this.worldHeight - this.borderBuffer) {
      this.body.y = this.worldHeight - this.borderBuffer;
      this.body.setVelocityY(0);
      touching = true;
    }

    this.barrierHitThisFrame = touching && !this._atBarrier;
    this._atBarrier = touching;
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
   * Serialize ship state for network transmission.
   *
   * @returns {Object}
   */
    serialize() {
      const now = Date.now();
      return {
        playerId: this.id,
        classKey: this.classKey,
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
        maxXp: this.maxXp,
        boostCooldownMs: this.boostCooldownMs,
        boostCooldownRemainingMs: this.getBoostCooldownRemaining(now),
        boostDurationMs: this.boostDurationMs,
        boostActiveRemainingMs: Math.max(0, this.boostActiveUntil - now),

        // Live movement stats
        maxSpeed: this.stats?.maxSpeed ?? 0,
        acceleration: this.stats?.acceleration ?? 0
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
