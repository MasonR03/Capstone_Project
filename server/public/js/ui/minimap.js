/**
 * Minimap - Round minimap UI component
 *
 * Shows the local player, other players, stars, and world border indicators.
 * Follows the local player and anchors to bottom-right of screen.
 */

const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;

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
        otherDot: 0xffffff
      }
    }
  };
};

class Minimap {
  /**
   * Create a new Minimap.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options
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
    this.colors = {
      ...config.minimap.colors,
      worldEdge: 0xff4d4d,
      worldBox: 0xff6666,
      starDot: 0xffdd55,
      starTick: 0xffcc33
    };

    // Graphics objects
    this.container = null;
    this.graphics = null;
    this.maskGraphics = null;
    this.ringGraphics = null;
    this.bgGraphics = null;

    // Backward compatibility aliases
    this.cont = null;
    this.g = null;

    this._create();
  }


  /**
   * Create the minimap UI elements.
   *
   * @private
   */
  _create() {
    const cam = this.scene.cameras.main;

    this.container = this.scene.add.container(
      cam.width - (this.size / 2) - this.margin,
      cam.height - (this.size / 2) - this.margin
    ).setScrollFactor(0).setDepth(2000);

    // Circular mask drawn in local container space
    this.maskGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.maskGraphics.fillStyle(0xffffff, 1);
    this.maskGraphics.fillCircle(0, 0, this.radius);
    this.maskGraphics.setVisible(false);

    // Main draw layer in local container space
    this.graphics = this.scene.add.graphics().setScrollFactor(0);

    const geoMask = this.maskGraphics.createGeometryMask();
    this.graphics.setMask(geoMask);

    // Ring border
    this.ringGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.ringGraphics.lineStyle(3, this.colors.border, 1);
    this.ringGraphics.strokeCircle(0, 0, this.radius);

    // Background
    this.bgGraphics = this.scene.add.graphics().setScrollFactor(0);
    this.bgGraphics.fillStyle(0x000000, 0.45);
    this.bgGraphics.fillCircle(0, 0, this.radius);

    // Everything uses the same local coordinates now
    this.container.add([
      this.bgGraphics,
      this.graphics,
      this.ringGraphics,
      this.maskGraphics
    ]);

    this.cont = this.container;
    this.g = this.graphics;
  }

  /**
   * Keep minimap anchored to bottom-right when camera resizes.
   */
  anchor() {
    const cam = this.scene.cameras.main;
    this.container.setPosition(
      cam.width - (this.size / 2) - this.margin,
      cam.height - (this.size / 2) - this.margin
    );
  }

  /**
   * Project world-relative coordinates into minimap space.
   *
   * @param {number} dx
   * @param {number} dy
   * @returns {{x:number,y:number,r:number}}
   * @private
   */
  _projectRelative(dx, dy) {
    const r = this.radius - 8;
    const s = r / this.worldRange;
    return { x: dx * s, y: dy * s, r };
  }

  /**
   * Draw a tick on the rim pointing toward something off-range.
   *
   * @param {number} angle
   * @param {number} color
   * @param {number} lineWidth
   * @private
   */
  _rimTick(angle, color = 0xffffff, lineWidth = 2) {
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const x1 = ca * (this.radius - 8);
    const y1 = sa * (this.radius - 8);
    const x2 = ca * (this.radius - 2);
    const y2 = sa * (this.radius - 2);

    this.graphics.lineStyle(lineWidth, color, 1);
    this.graphics.beginPath();
    this.graphics.moveTo(x1, y1);
    this.graphics.lineTo(x2, y2);
    this.graphics.strokePath();
  }

  /**
   * Draw pulsing border warning ticks.
   *
   * @param {Object} me
   * @private
   */
  _drawWorldEdgeHints(me) {
    const pulse = 0.45 + (0.35 * (0.5 + 0.5 * Math.sin(this.scene.time.now * 0.008)));
    const color = this.colors.worldEdge;

    const leftDist = me.x;
    const rightDist = this.worldW - me.x;
    const topDist = me.y;
    const bottomDist = this.worldH - me.y;

    const drawEdgeTick = (dist, angle) => {
      if (dist > this.worldRange) return;

      const closeness = 1 - Phaser.Math.Clamp(dist / this.worldRange, 0, 1);
      const alphaWidth = 2 + (closeness * 2.5);
      this._rimTick(angle, color, alphaWidth * pulse);
    };

    drawEdgeTick(leftDist, Math.PI);
    drawEdgeTick(rightDist, 0);
    drawEdgeTick(topDist, -Math.PI / 2);
    drawEdgeTick(bottomDist, Math.PI / 2);
  }

  /**
   * Draw filled border danger zones inside the minimap circle only.
   *
   * This avoids rectangle spill by drawing only the portions that lie
   * inside the minimap circle.
   *
   * @param {Object} me
   * @private
   */
  _drawWorldBorderFill(me) {
    const r = this.radius;
    const s = (this.radius - 8) / this.worldRange;

    const pulse = 0.18 + (0.12 * (0.5 + 0.5 * Math.sin(this.scene.time.now * 0.008)));
    const fillAlpha = 0.20 + pulse;

    // Project each world boundary into minimap space
    const leftLine = (0 - me.x) * s;
    const rightLine = (this.worldW - me.x) * s;
    const topLine = (0 - me.y) * s;
    const bottomLine = (this.worldH - me.y) * s;

    this.graphics.fillStyle(this.colors.worldEdge, fillAlpha);

    // Left side
    if (me.x < this.worldRange) {
      this._fillLeftOfLineInsideCircle(leftLine, r);
    }

    // Right side
    if ((this.worldW - me.x) < this.worldRange) {
      this._fillRightOfLineInsideCircle(rightLine, r);
    }

    // Top side
    if (me.y < this.worldRange) {
      this._fillAboveLineInsideCircle(topLine, r);
    }

    // Bottom side
    if ((this.worldH - me.y) < this.worldRange) {
      this._fillBelowLineInsideCircle(bottomLine, r);
    }
  }

    /**
   * Fill the area below a horizontal line, clipped to the minimap circle.
   *
   * @param {number} yLine
   * @param {number} r
   * @private
   */
  _fillBelowLineInsideCircle(yLine, r) {
    const startY = Math.max(yLine, -r);
    const endY = r;

    for (let y = Math.ceil(startY); y <= Math.floor(endY); y += 2) {
      const halfWidth = Math.sqrt(Math.max(0, (r * r) - (y * y)));
      this.graphics.fillRect(-halfWidth, y, halfWidth * 2, 2);
    }
  }

  /**
   * Fill the area above a horizontal line, clipped to the minimap circle.
   *
   * @param {number} yLine
   * @param {number} r
   * @private
   */
  _fillAboveLineInsideCircle(yLine, r) {
    const startY = -r;
    const endY = Math.min(yLine, r);

    for (let y = Math.ceil(startY); y <= Math.floor(endY); y += 2) {
      const halfWidth = Math.sqrt(Math.max(0, (r * r) - (y * y)));
      this.graphics.fillRect(-halfWidth, y, halfWidth * 2, 2);
    }
  }

  /**
   * Fill the area left of a vertical line, clipped to the minimap circle.
   *
   * @param {number} xLine
   * @param {number} r
   * @private
   */
  _fillLeftOfLineInsideCircle(xLine, r) {
    const startX = -r;
    const endX = Math.min(xLine, r);

    for (let x = Math.ceil(startX); x <= Math.floor(endX); x += 2) {
      const halfHeight = Math.sqrt(Math.max(0, (r * r) - (x * x)));
      this.graphics.fillRect(x, -halfHeight, 2, halfHeight * 2);
    }
  }

  /**
   * Fill the area right of a vertical line, clipped to the minimap circle.
   *
   * @param {number} xLine
   * @param {number} r
   * @private
   */
  _fillRightOfLineInsideCircle(xLine, r) {
    const startX = Math.max(xLine, -r);
    const endX = r;

    for (let x = Math.ceil(startX); x <= Math.floor(endX); x += 2) {
      const halfHeight = Math.sqrt(Math.max(0, (r * r) - (x * x)));
      this.graphics.fillRect(x, -halfHeight, 2, halfHeight * 2);
    }
  }

  /**
   * Plot a point or a rim tick.
   *
   * @param {number} dx
   * @param {number} dy
   * @param {number} color
   * @param {number} dotRadius
   * @param {number} tickWidth
   * @private
   */
  _plot(dx, dy, color, dotRadius = 3, tickWidth = 2) {
    const p = this._projectRelative(dx, dy);
    let x = p.x;
    let y = p.y;

    if ((x * x + y * y) <= p.r * p.r) {
      this.graphics.fillStyle(color, 1);
      this.graphics.fillCircle(x, y, dotRadius);
    } else {
      const ang = Math.atan2(y, x);
      this._rimTick(ang, color, tickWidth);
    }
  }

  /**
   * Draw stars on the minimap.
   *
   * @param {Object} me
   * @param {Array<Object>} stars
   * @private
   */
  _drawStars(me, stars = []) {
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (!star) continue;
      this._plot(
        star.x - me.x,
        star.y - me.y,
        this.colors.starDot,
        2.6,
        2
      );
    }
  }

  /**
   * Update the minimap display.
   *
   * @param {Object} players
   * @param {string} myId
   * @param {Array<Object>} stars
   */
  update(players, myId, stars = []) {
    this.graphics.clear();

    const me = players?.[myId];
    if (!me) return;

    // Show pulsing edge hints and filled border danger zones
    this._drawWorldEdgeHints(me);
    this._drawWorldBorderFill(me);

    // Stars
    this._drawStars(me, stars);

    // Players
    for (const id in players) {
      const p = players[id];
      const color = id === myId ? this.colors.myDot : this.colors.otherDot;
      this._plot(
        p.x - me.x,
        p.y - me.y,
        color,
        id === myId ? 4 : 3.2,
        id === myId ? 2.5 : 2
      );
    }

    // Draw own center dot last
    this.graphics.fillStyle(this.colors.myDot, 1);
    this.graphics.fillCircle(0, 0, 4.5);
  }

  /**
   * Destroy the minimap.
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

if (typeof window !== 'undefined') {
  window.Minimap = Minimap;

  window.MiniMap = {
    create: (scene, worldW, worldH, opts = {}) => {
      return new Minimap(scene, { worldW, worldH, ...opts });
    },
    update: (minimap, players, myId, stars = []) => {
      if (minimap && minimap.update) {
        minimap.update(players, myId, stars);
      }
    },
    anchor: (minimap) => {
      if (minimap && minimap.anchor) {
        minimap.anchor();
      }
    }
  };
}

export default Minimap;