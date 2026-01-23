/**
 * Minimap - Round minimap UI component
 *
 * Shows the local player, other players, stars, and world edge indicators.
 * Follows the local player and anchors to bottom-right of screen.
 */

// Import GameConfig when used as ES6 module
// For backward compatibility, also check window.GameConfig
const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;
  // Fallback defaults
  return {
    world: { width: 2000, height: 2000 },
    minimap: {
      size: 160,
      radius: 70,
      margin: 20,
      worldRange: 600,
      colors: {
        border: 0x00ffff,
        myDot: 0x00e5ff,
        redDot: 0xff6666,
        blueDot: 0x6688ff,
        otherDot: 0xffffff,
        starDot: 0xffd93b
      }
    }
  };
};

class Minimap {
  /**
   * Create a new Minimap
   * @param {Phaser.Scene} scene - The Phaser scene
   * @param {Object} options - Configuration options
   */
  constructor(scene, options = {}) {
    const config = getConfig();
    this.scene = scene;
    this.worldW = options.worldW || config.world.width;
    this.worldH = options.worldH || config.world.height;
    this.size = options.size || config.minimap.size;
    this.radius = options.radius || config.minimap.radius;
    this.margin = options.margin || config.minimap.margin;
    this.worldRange = options.worldRange || config.minimap.worldRange;

    // Colors
    this.colors = { ...config.minimap.colors };

    // Graphics objects
    this.container = null;
    this.graphics = null;
    this.maskGraphics = null;
    this.ringGraphics = null;
    this.bgGraphics = null;

    // Alias for backward compatibility
    this.cont = null;
    this.g = null;

    this._create();
  }

  /**
   * Create the minimap UI elements
   * @private
   */
  _create() {
    const cam = this.scene.cameras.main;

    // Container positioned bottom-right
    this.container = this.scene.add.container(
      cam.width - (this.size / 2) - this.margin,
      cam.height - (this.size / 2) - this.margin
    ).setScrollFactor(0).setDepth(2000);

    // Circular mask
    this.maskGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.maskGraphics.fillStyle(0xffffff, 1);
    this.maskGraphics.fillCircle(0, 0, this.radius);
    const geoMask = this.maskGraphics.createGeometryMask();
    this.maskGraphics.setVisible(false);

    // Draw layer (masked)
    this.graphics = this.scene.add.graphics().setScrollFactor(0);
    this.graphics.setMask(geoMask);

    // Ring border
    this.ringGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.ringGraphics.lineStyle(3, this.colors.border, 1);
    this.ringGraphics.strokeCircle(0, 0, this.radius);

    // Soft background
    this.bgGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.bgGraphics.fillStyle(0x000000, 0.45);
    this.bgGraphics.fillCircle(0, 0, this.radius);

    // Add to container
    this.container.add([this.bgGraphics, this.graphics, this.ringGraphics]);

    // Backward compatibility aliases
    this.cont = this.container;
    this.g = this.graphics;
  }

  /**
   * Keep minimap anchored to bottom-right when camera resizes
   */
  anchor() {
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      cam.width - (this.size / 2) - this.margin,
      cam.height - (this.size / 2) - this.margin
    );
  }

  /**
   * Project world coordinates relative to player into minimap space
   * @private
   */
  _projectRelative(dx, dy) {
    const r = this.radius - 8; // Pad from rim
    const s = r / this.worldRange; // Pixels per world unit
    return { x: dx * s, y: dy * s, r };
  }

  /**
   * Draw a tick on the rim pointing toward off-screen elements
   * @private
   */
  _rimTick(angle, color = 0xffffff) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const x1 = ca * (this.radius - 8);
    const y1 = sa * (this.radius - 8);
    const x2 = ca * (this.radius - 2);
    const y2 = sa * (this.radius - 2);

    this.graphics.lineStyle(2, color, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(x1, y1);
    this.graphics.lineTo(x2, y2);
    this.graphics.strokePath();
  }

  /**
   * Draw world edge markers when near boundaries
   * @private
   */
  _drawWorldEdges(me) {
    const edgeDist = 250;
    const color = 0xff4d4d;

    this.graphics.lineStyle(2, color, 0.9);

    if (me.x < edgeDist) this._rimTick(Math.PI, color); // Left
    if (this.worldW - me.x < edgeDist) this._rimTick(0, color); // Right
    if (me.y < edgeDist) this._rimTick(-Math.PI / 2, color); // Top
    if (this.worldH - me.y < edgeDist) this._rimTick(Math.PI / 2, color); // Bottom
  }

  /**
   * Plot a point on the minimap
   * @private
   */
  _plot(dx, dy, color, dotRadius = 3) {
    const p = this._projectRelative(dx, dy);
    let x = p.x;
    let y = p.y;

    // Check if inside circle
    if ((x * x + y * y) <= p.r * p.r) {
      this.graphics.fillStyle(color, 1);
      this.graphics.fillCircle(x, y, dotRadius);
    } else {
      // Clamp to rim and draw a tick
      const ang = Math.atan2(y, x);
      this._rimTick(ang, color);
    }
  }

  /**
   * Update the minimap display
   * @param {Object} players - Map of id -> {x, y, team}
   * @param {Array} stars - Array of {x, y}
   * @param {string} myId - Local player's ID
   */
  update(players, stars, myId) {
    this.graphics.clear();

    // Nothing to center on yet
    const me = players?.[myId];
    if (!me) return;

    // Show world edge hints
    this._drawWorldEdges(me);

    // Stars (gold)
    if (Array.isArray(stars)) {
      stars.forEach(s => {
        this._plot(s.x - me.x, s.y - me.y, this.colors.starDot, 3);
      });
    }

    // Players
    for (const id in players) {
      const p = players[id];
      let color;
      if (id === myId) {
        color = this.colors.myDot;
      } else if (p.team === 'red') {
        color = this.colors.redDot;
      } else if (p.team === 'blue') {
        color = this.colors.blueDot;
      } else {
        color = this.colors.otherDot;
      }
      this._plot(p.x - me.x, p.y - me.y, color, id === myId ? 4 : 3.2);
    }

    // Draw own center dot last (always visible)
    this.graphics.fillStyle(this.colors.myDot, 1);
    this.graphics.fillCircle(0, 0, 4.5);
  }

  /**
   * Destroy the minimap
   */
  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
      this.cont = null;
    }
    if (this.maskGraphics) {
      this.maskGraphics.destroy();
      this.maskGraphics = null;
    }
    this.graphics = null;
    this.g = null;
    this.ringGraphics = null;
    this.bgGraphics = null;
  }
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.Minimap = Minimap;

  // Backward compatibility: MiniMap object with static methods (matches original IIFE API)
  window.MiniMap = {
    create: (scene, worldW, worldH, opts = {}) => {
      const minimap = new Minimap(scene, { worldW, worldH, ...opts });
      return minimap;
    },
    update: (minimap, players, stars, myId) => {
      if (minimap && minimap.update) {
        minimap.update(players, stars, myId);
      }
    },
    anchor: (minimap, scene, opts = {}) => {
      if (minimap && minimap.anchor) {
        minimap.anchor();
      }
    }
  };
}

// ES6 module export
export default Minimap;
