/**
 * AsteroidRenderer - client-side asteroid visuals and effects.
 */

import GameConfig from '../config/GameConfig.js';

class AsteroidRenderer {
  constructor(scene, socket) {
    this.scene = scene;
    this.socket = socket;
    this.asteroids = new Map();
    this.trailParticles = null;
    this.trailEmitter = null;
  }

  init() {
    this._createTrailEmitter();

    this.socket.on('asteroidSnapshot', (asteroids = []) => {
      this.sync(asteroids);
    });

    this.socket.on('asteroidSpawned', (asteroid) => {
      this.addOrUpdate(asteroid);
    });

    this.socket.on('asteroidUpdates', (asteroids = []) => {
      this.sync(asteroids);
    });

    this.socket.on('asteroidHits', (hits = []) => {
      hits.forEach((hit) => this._flashHit(hit?.asteroidId));
    });

    this.socket.on('asteroidDestroyed', (event) => {
      this.destroyAsteroid(event?.asteroidId, {
        x: event?.x,
        y: event?.y,
        playEffect: true
      });
    });

    this.socket.on('asteroidsRemoved', (ids = []) => {
      ids.forEach((id) => this.destroyAsteroid(id, { playEffect: false }));
    });
  }

  sync(asteroids = []) {
    if (!Array.isArray(asteroids)) return;

    const seen = new Set();
    asteroids.forEach((asteroid) => {
      const entry = this.addOrUpdate(asteroid);
      if (entry) seen.add(asteroid.id);
    });

    this.asteroids.forEach((entry, id) => {
      if (!seen.has(id)) {
        this.destroyAsteroid(id, { playEffect: false });
      }
    });
  }

  addOrUpdate(data = {}) {
    if (!data.id) return null;

    const existing = this.asteroids.get(data.id);
    if (existing) {
      this._updateEntry(existing, data);
      return existing;
    }

    const texture = this.scene.textures.exists('asteroid')
      ? 'asteroid'
      : 'glow_particle';
    const sprite = this.scene.add.image(data.x, data.y, texture)
      .setDepth(1.4)
      .setRotation(data.rotation || 0);

    const radius = Number.isFinite(data.radius) ? data.radius : GameConfig.asteroids.radius;
    sprite.setDisplaySize(radius * 2.2, radius * 2.2);

    const entry = {
      sprite,
      prevX: data.x,
      prevY: data.y,
      radius,
      hp: Number.isFinite(data.hp) ? data.hp : GameConfig.asteroids.hp
    };

    this.asteroids.set(data.id, entry);
    return entry;
  }

  destroyAsteroid(id, options = {}) {
    const entry = this.asteroids.get(id);
    const x = Number.isFinite(options.x) ? options.x : entry?.sprite?.x;
    const y = Number.isFinite(options.y) ? options.y : entry?.sprite?.y;

    if (entry?.sprite) {
      entry.sprite.destroy();
    }

    this.asteroids.delete(id);

    if (options.playEffect && Number.isFinite(x) && Number.isFinite(y)) {
      this._spawnExplosion(x, y);
      this._playBoom();
    }
  }

  destroy() {
    this.asteroids.forEach((entry) => {
      if (entry.sprite) entry.sprite.destroy();
    });
    this.asteroids.clear();
    if (this.trailParticles) {
      this.trailParticles.destroy();
      this.trailParticles = null;
      this.trailEmitter = null;
    }
  }

  _createTrailEmitter() {
    this.trailParticles = this.scene.add.particles('glow_particle');
    this.trailParticles.setDepth(1.2);
    this.trailEmitter = this.trailParticles.createEmitter({
      tint: 0xffaa66,
      blendMode: 'ADD',
      lifespan: 520,
      scale: { start: 0.75, end: 0 },
      alpha: { start: 0.55, end: 0 },
      speed: { min: 6, max: 28 },
      frequency: -1
    });
  }

  _updateEntry(entry, data) {
    const sprite = entry.sprite;
    const x = Number(data.x);
    const y = Number(data.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const dx = x - entry.prevX;
    const dy = y - entry.prevY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 0.1 && this.trailEmitter) {
      const backX = x - (dx / distance) * (entry.radius * 0.55);
      const backY = y - (dy / distance) * (entry.radius * 0.55);
      this.trailEmitter.emitParticleAt(backX, backY, 2);
    }

    sprite.setPosition(x, y);
    sprite.setRotation(Number.isFinite(data.rotation) ? data.rotation : sprite.rotation);
    entry.prevX = x;
    entry.prevY = y;
    entry.hp = Number.isFinite(data.hp) ? data.hp : entry.hp;
  }

  _flashHit(asteroidId) {
    const entry = this.asteroids.get(asteroidId);
    const sprite = entry?.sprite;
    if (!sprite || !sprite.active) return;

    sprite.setTint(0xffdd99);
    this.scene.time.delayedCall(90, () => {
      if (sprite.active && sprite.clearTint) {
        sprite.clearTint();
      }
    });
  }

  _spawnExplosion(x, y) {
    const particles = this.scene.add.particles(x, y, 'glow_particle', {
      tint: [0xffdd99, 0xff8844, 0xffffff],
      speed: { min: 60, max: 220 },
      scale: { start: 0.85, end: 0 },
      alpha: { start: 0.95, end: 0 },
      lifespan: 620,
      quantity: 28,
      blendMode: 'ADD'
    });

    this.scene.time.delayedCall(680, () => {
      if (particles) particles.destroy();
    });
  }

  _playBoom() {
    if (!this.scene.sound || !this.scene.cache.audio.exists('asteroid_boom')) return;

    try {
      this.scene.sound.play('asteroid_boom', {
        volume: GameConfig.getSfxVolumeFor(0.78)
      });
    } catch (error) {
      // Browser audio may still be locked.
    }
  }
}

export default AsteroidRenderer;
