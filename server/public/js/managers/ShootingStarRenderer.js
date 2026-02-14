/**
 * ShootingStarRenderer - Client-side shooting star visuals
 *
 * Creates colored glow textures and particle emitters, listens for
 * server-spawned shooting star events, and drives the movement/fade loop.
 */

import GameConfig from '../config/GameConfig.js';

const STAR_GLOW_DEFS = {
  white:  [255, 255, 255],
  blue:   [160, 190, 255],
  purple: [210, 160, 255],
  red:    [255, 160, 160],
  yellow: [255, 240, 170],
  orange: [255, 190, 130]
};

const EMIT_INTERVAL = 40;
const MARGIN = 100;
const MAX_LIFETIME = 60; // seconds

class ShootingStarRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {SocketIO.Socket} socket
   */
  constructor(scene, socket) {
    this._scene = scene;
    this._socket = socket;
    this._emittersByColor = {};
    this._activeStars = [];
    this._starScale = 0.4;
  }

  /**
   * Create textures, emitters, and register the socket listener.
   */
  init() {
    this._createTextures();
    this._createEmitters();
    this._registerSocketHandler();
  }

  /**
   * Move active stars, emit trail particles, cull off-screen stars.
   * @param {number} delta - ms since last frame
   */
  update(delta) {
    const WORLD_W = GameConfig.world.width;
    const WORLD_H = GameConfig.world.height;

    for (let i = this._activeStars.length - 1; i >= 0; i--) {
      const star = this._activeStars[i];
      star.emitTimer += delta;

      while (star.emitTimer >= EMIT_INTERVAL) {
        star.emitTimer -= EMIT_INTERVAL;
        const dt = EMIT_INTERVAL / 1000;
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

        // Remove if exceeded max lifetime
        if (star.age >= MAX_LIFETIME) {
          this._activeStars.splice(i, 1);
          break;
        }

        // Remove if outside map bounds
        if (star.x < -MARGIN || star.x > WORLD_W + MARGIN ||
            star.y < -MARGIN || star.y > WORLD_H + MARGIN) {
          this._activeStars.splice(i, 1);
          break;
        }

        // Fading stars shrink and dim over time
        if (star.fades) {
          const fadeT = Math.min(star.age / 15, 1);
          star.scale = star.baseScale * (1 - fadeT);
          if (star.scale < 0.02) {
            this._activeStars.splice(i, 1);
            break;
          }
        }

        this._starScale = star.scale;
        star.emitter.emitParticleAt(star.x, star.y, 1);
      }
    }
  }

  // ---- private ----

  _createTextures() {
    Object.entries(STAR_GLOW_DEFS).forEach(([name, rgb]) => {
      const c = this._scene.textures.createCanvas(`star_${name}`, 32, 32);
      const cx = c.getContext();
      const g = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 1)`);
      g.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      cx.fillStyle = g;
      cx.fillRect(0, 0, 32, 32);
      c.refresh();
    });
  }

  _createEmitters() {
    Object.keys(STAR_GLOW_DEFS).forEach((name) => {
      const particles = this._scene.add.particles(`star_${name}`);
      particles.setDepth(-0.5);
      this._emittersByColor[name] = particles.createEmitter({
        speed: { min: 0, max: 5 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 1800,
        blendMode: 'ADD',
        frequency: -1,
        emitCallback: (particle) => {
          particle.scaleX = this._starScale;
          particle.scaleY = this._starScale;
        }
      });
    });
  }

  _registerSocketHandler() {
    this._socket.on('shootingStar', (data) => {
      const emitter = this._emittersByColor[data.color];
      if (!emitter) return;
      this._activeStars.push({
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy,
        emitter,
        scale: data.scale,
        baseScale: data.scale,
        fades: data.fades,
        age: 0,
        angularV: data.angularV,
        emitTimer: 0
      });
    });
  }
}

export default ShootingStarRenderer;
