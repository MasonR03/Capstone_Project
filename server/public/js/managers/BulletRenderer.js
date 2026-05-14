/**
 * BulletRenderer - Client-side laser visualization
 *
 * Renders server-authoritative bullets as glowing laser bolts:
 * a stretched core, a colored additive halo, and a fading particle trail.
 * Per-class color is resolved by looking up the firing ship's classKey.
 */

import GameConfig from '../config/GameConfig.js';

const TEXTURE_KEY = 'glow_particle';
const LASER_SOUND_KEY = 'laser_fire';
const MIN_ANGLE_DELTA_SQ = 0.25; // pixels^2 — below this, keep last angle to avoid jitter

class BulletRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {SocketIO.Socket} socket
   */
  constructor(scene, socket) {
    this._scene = scene;
    this._socket = socket;
    this._bullets = new Map(); // id -> { core, halo, prevX, prevY, angle, colorKey }
    this._trailEmittersByColor = {}; // colorKey -> Phaser emitter
  }

  init() {
    this._createTrailEmitters();

    this._socket.on('bulletFired', (data) => {
      this._createBullet(data);
      if (this._isLocalOwner(data.ownerId)) {
        this._playFireSound();
      }
    });

    this._socket.on('bulletUpdates', (bullets) => {
      bullets.forEach((b) => {
        const entry = this._bullets.get(b.id);
        if (!entry) {
          this._createBullet(b);
        } else {
          this._updateBullet(entry, b);
        }
      });

      const serverIds = new Set(bullets.map((b) => b.id));
      this._bullets.forEach((entry, id) => {
        if (!serverIds.has(id)) {
          this._destroyEntry(entry);
          this._bullets.delete(id);
        }
      });
    });

    this._socket.on('bulletsRemoved', (ids) => {
      ids.forEach((id) => {
        const entry = this._bullets.get(id);
        if (entry) {
          this._destroyEntry(entry);
          this._bullets.delete(id);
        }
      });
    });

    this._socket.on('bulletHit', (data) => {
      const entry = this._bullets.get(data.bulletId);
      if (entry) {
        this._spawnImpactFlash(entry.halo.x, entry.halo.y, entry.colorKey);
        this._destroyEntry(entry);
        this._bullets.delete(data.bulletId);
      }
    });
  }

  destroy() {
    this._bullets.forEach((entry) => this._destroyEntry(entry));
    this._bullets.clear();
    Object.values(this._trailEmittersByColor).forEach((emitter) => {
      if (emitter && emitter.manager) emitter.manager.destroy();
    });
    this._trailEmittersByColor = {};
  }

  // ---- private ----

  _createTrailEmitters() {
    const cfg = GameConfig.weapons.laser;
    const allColors = { ...cfg.colorByClass, _default: cfg.defaultColor };

    Object.entries(allColors).forEach(([colorKey, color]) => {
      const particles = this._scene.add.particles(TEXTURE_KEY);
      particles.setDepth(2);
      const emitter = particles.createEmitter({
        tint: color.glow,
        blendMode: 'ADD',
        lifespan: cfg.trailLifespan,
        scale: { start: 0.5, end: 0 },
        alpha: { start: 0.7, end: 0 },
        speed: 0,
        frequency: -1
      });
      this._trailEmittersByColor[colorKey] = emitter;
    });
  }

  _resolveColorKey(ownerId) {
    const ship = this._scene.entityManager
      ? this._scene.entityManager.getShip(ownerId)
      : null;
    const classKey = ship && ship.classKey;
    if (classKey && GameConfig.weapons.laser.colorByClass[classKey]) {
      return classKey;
    }
    return '_default';
  }

  _isLocalOwner(ownerId) {
    if (!ownerId || !this._scene.entityManager) return false;
    return this._scene.entityManager.isLocalPlayer(ownerId);
  }

  _resolveColor(colorKey) {
    return GameConfig.weapons.laser.colorByClass[colorKey]
      || GameConfig.weapons.laser.defaultColor;
  }

  _createBullet(data) {
    if (this._bullets.has(data.id)) return;

    const cfg = GameConfig.weapons.laser;
    const colorKey = this._resolveColorKey(data.ownerId);
    const color = this._resolveColor(colorKey);

    let angle = 0;
    const ship = this._scene.entityManager
      ? this._scene.entityManager.getShip(data.ownerId)
      : null;
    if (ship && typeof ship.rotation === 'number') {
      angle = ship.rotation;
    }

    const halo = this._scene.add.image(data.x, data.y, TEXTURE_KEY)
      .setTint(color.glow)
      .setBlendMode('ADD')
      .setDisplaySize(cfg.haloLength, cfg.haloWidth)
      .setRotation(angle)
      .setDepth(2);

    const core = this._scene.add.image(data.x, data.y, TEXTURE_KEY)
      .setTint(color.core)
      .setBlendMode('ADD')
      .setDisplaySize(cfg.coreLength, cfg.coreWidth)
      .setRotation(angle)
      .setDepth(2.1);

    this._bullets.set(data.id, {
      core,
      halo,
      prevX: data.x,
      prevY: data.y,
      angle,
      colorKey
    });

    this._spawnMuzzleFlash(data.x, data.y, colorKey);
  }

  _playFireSound() {
    if (!this._scene.sound || !this._scene.cache.audio.exists(LASER_SOUND_KEY)) return;

    try {
      this._scene.sound.play(LASER_SOUND_KEY, {
        volume: GameConfig.getSfxVolumeFor(0.5)
      });
    } catch (error) {
      // Audio playback can be blocked until the browser unlocks the sound context.
    }
  }

  _updateBullet(entry, b) {
    const dx = b.x - entry.prevX;
    const dy = b.y - entry.prevY;
    if (dx * dx + dy * dy >= MIN_ANGLE_DELTA_SQ) {
      entry.angle = Math.atan2(dy, dx);
    }

    entry.halo.setPosition(b.x, b.y).setRotation(entry.angle);
    entry.core.setPosition(b.x, b.y).setRotation(entry.angle);

    const emitter = this._trailEmittersByColor[entry.colorKey]
      || this._trailEmittersByColor._default;
    if (emitter) emitter.emitParticleAt(b.x, b.y, 1);

    entry.prevX = b.x;
    entry.prevY = b.y;
  }

  _spawnMuzzleFlash(x, y, colorKey) {
    const cfg = GameConfig.weapons.laser;
    const color = this._resolveColor(colorKey);
    const flash = this._scene.add.image(x, y, TEXTURE_KEY)
      .setTint(color.glow)
      .setBlendMode('ADD')
      .setDisplaySize(cfg.haloLength, cfg.haloLength)
      .setScale(cfg.muzzleScale)
      .setDepth(2.2);

    this._scene.tweens.add({
      targets: flash,
      alpha: { from: 1, to: 0 },
      scale: { from: cfg.muzzleScale, to: cfg.muzzleScale * 1.6 },
      duration: cfg.impactDuration,
      onComplete: () => flash.destroy()
    });
  }

  _spawnImpactFlash(x, y, colorKey) {
    const cfg = GameConfig.weapons.laser;
    const color = this._resolveColor(colorKey);
    const flash = this._scene.add.image(x, y, TEXTURE_KEY)
      .setTint(color.glow)
      .setBlendMode('ADD')
      .setDisplaySize(cfg.haloLength, cfg.haloLength)
      .setScale(0.4)
      .setDepth(2.2);

    this._scene.tweens.add({
      targets: flash,
      alpha: { from: 1, to: 0 },
      scale: { from: 0.4, to: 1.6 },
      duration: cfg.impactDuration,
      onComplete: () => flash.destroy()
    });
  }

  _destroyEntry(entry) {
    if (entry.core) entry.core.destroy();
    if (entry.halo) entry.halo.destroy();
  }
}

export default BulletRenderer;
