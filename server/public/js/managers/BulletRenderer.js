/**
 * BulletRenderer - Client-side bullet visualization
 *
 * Listens for bullet events from the server and renders bullets
 * as small sprites. Handles creation, position updates, and removal.
 */

import GameConfig from '../config/GameConfig.js';

class BulletRenderer {
  /**
   * @param {Phaser.Scene} scene
   * @param {SocketIO.Socket} socket
   */
  constructor(scene, socket) {
    this._scene = scene;
    this._socket = socket;
    this._bullets = new Map(); // id -> Phaser sprite
  }

  /**
   * Register socket handlers for bullet events
   */
  init() {
    // New bullet fired
    this._socket.on('bulletFired', (data) => {
      this._createBullet(data);
    });

    // Bulk bullet position updates
    this._socket.on('bulletUpdates', (bullets) => {
      bullets.forEach((b) => {
        const sprite = this._bullets.get(b.id);
        if (sprite) {
          sprite.x = b.x;
          sprite.y = b.y;
        } else {
          // Bullet we don't know about yet — create it
          this._createBullet(b);
        }
      });

      // Remove any local bullets not present in the update
      const serverIds = new Set(bullets.map((b) => b.id));
      this._bullets.forEach((sprite, id) => {
        if (!serverIds.has(id)) {
          sprite.destroy();
          this._bullets.delete(id);
        }
      });
    });

    // Bullets removed (hit or expired)
    this._socket.on('bulletsRemoved', (ids) => {
      ids.forEach((id) => {
        const sprite = this._bullets.get(id);
        if (sprite) {
          sprite.destroy();
          this._bullets.delete(id);
        }
      });
    });

    // Bullet hit — show a small flash
    this._socket.on('bulletHit', (data) => {
      const sprite = this._bullets.get(data.bulletId);
      if (sprite) {
        sprite.destroy();
        this._bullets.delete(data.bulletId);
      }
    });
  }

  /**
   * Create a bullet sprite
   * @param {Object} data - {id, x, y, ownerId}
   * @private
   */
  _createBullet(data) {
    if (this._bullets.has(data.id)) return;

    let sprite;
    if (this._scene.textures.exists('bullet')) {
      sprite = this._scene.add.sprite(data.x, data.y, 'bullet');
      sprite.setDisplaySize(GameConfig.weapons.bulletSize, GameConfig.weapons.bulletSize);
    } else {
      // Fallback: small colored circle
      sprite = this._scene.add.circle(data.x, data.y, 4, 0xff4444);
    }

    sprite.setDepth(2);
    this._bullets.set(data.id, sprite);
  }

  /**
   * Clean up all bullets
   */
  destroy() {
    this._bullets.forEach((sprite) => sprite.destroy());
    this._bullets.clear();
  }
}

export default BulletRenderer;
