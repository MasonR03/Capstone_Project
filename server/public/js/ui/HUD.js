/**
 * HUD - Heads-Up Display component
 *
 * Displays HP/XP bars and score text, pinned to the screen.
 */

// Get config with fallback
const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;
  return {
    hud: {
      x: 16,
      y: 16,
      hp: { startX: 50, centerY: 14, endX: 128 },
      xp: { startX: 50, centerY: 48, endX: 128 },
      fillPadX: 2
    }
  };
};

class HUD {
  /**
   * Create a new HUD
   * @param {Phaser.Scene} scene - The Phaser scene
   */
  constructor(scene) {
    const config = getConfig();
    this.scene = scene;

    // Layout constants from config
    this.HUD_X = config.hud.x;
    this.HUD_Y = config.hud.y;
    this.HP_START_X = config.hud.hp.startX;
    this.HP_CENTER_Y = config.hud.hp.centerY;
    this.HP_END_X = config.hud.hp.endX;
    this.XP_START_X = config.hud.xp.startX;
    this.XP_CENTER_Y = config.hud.xp.centerY;
    this.XP_END_X = config.hud.xp.endX;
    this.FILL_PAD_X = config.hud.fillPadX;

    // Center numbers inside bars
    this.HP_NUM_X = Math.floor((this.HP_START_X + this.HP_END_X) / 2);
    this.HP_NUM_Y = this.HP_CENTER_Y;
    this.XP_NUM_X = Math.floor((this.XP_START_X + this.XP_END_X) / 2);
    this.XP_NUM_Y = this.XP_CENTER_Y;

    // UI elements
    this.container = null;
    this.frameImg = null;
    this.hpFill = null;
    this.xpFill = null;
    this.hpNumText = null;
    this.xpNumText = null;
    this.scoreText = null;

    this._create();
  }

  /**
   * Create HUD elements
   * @private
   */
  _create() {
    // HUD container (screen-space)
    this.container = this.scene.add.container(this.HUD_X, this.HUD_Y)
      .setScrollFactor(0)
      .setDepth(200);

    // Calculate fill widths
    const hpFullW = Math.max(0, (this.HP_END_X - this.HP_START_X) - (this.FILL_PAD_X * 2));
    const xpFullW = Math.max(0, (this.XP_END_X - this.XP_START_X) - (this.FILL_PAD_X * 2));
    const barH = 8;

    // HP fill bar (red)
    this.hpFill = this.scene.add.rectangle(
      this.HP_START_X + this.FILL_PAD_X,
      this.HP_CENTER_Y,
      hpFullW,
      barH,
      0xff3333
    ).setOrigin(0, 0.5);

    // XP fill bar (blue)
    this.xpFill = this.scene.add.rectangle(
      this.XP_START_X + this.FILL_PAD_X,
      this.XP_CENTER_Y,
      xpFullW,
      barH,
      0x00ccff
    ).setOrigin(0, 0.5);

    // Frame PNG (on top)
    if (this.scene.textures.exists('hudBars')) {
      this.frameImg = this.scene.add.image(0, 0, 'hudBars').setOrigin(0, 0);
    } else {
      console.warn('HUD: Missing texture key "hudBars"');
      this.frameImg = this.scene.add.rectangle(0, 0, 140, 64, 0x222222, 0.5).setOrigin(0, 0);
    }

    // HP number text (centered in bar)
    this.hpNumText = this.scene.add.text(this.HP_NUM_X, this.HP_NUM_Y, '0/0', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5);

    // XP number text (centered in bar)
    this.xpNumText = this.scene.add.text(this.XP_NUM_X, this.XP_NUM_Y, '0/0', {
      fontSize: '12px',
      color: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5);

    // Add elements to container (back-to-front)
    this._safeAdd(this.hpFill);
    this._safeAdd(this.xpFill);
    this._safeAdd(this.frameImg);
    this._safeAdd(this.hpNumText);
    this._safeAdd(this.xpNumText);

    // Score text (separate, below HUD)
    this.scoreText = this.scene.add.text(20, 80, 'Score: R 0 | B 0', {
      fontSize: '18px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(210);
  }

  /**
   * Safely add object to container
   * @private
   */
  _safeAdd(obj) {
    if (this.container && obj && obj.scene) {
      this.container.add(obj);
    }
  }

  /**
   * Update HP and XP display
   * @param {Object} stats - { hp, maxHp, xp, maxXp }
   */
  updateHpXp({ hp = 0, maxHp = 0, xp = 0, maxXp = 0 } = {}) {
    // Update HP bar
    if (this.hpFill && maxHp > 0) {
      const ratio = Math.max(0, Math.min(1, hp / maxHp));
      const fullWidth = (this.HP_END_X - this.HP_START_X) - (this.FILL_PAD_X * 2);
      this.hpFill.width = Math.max(0, fullWidth * ratio);
      if (this.hpNumText) {
        this.hpNumText.setText(`${Math.max(0, Math.floor(hp))}/${maxHp}`);
      }
    } else if (this.hpNumText) {
      this.hpNumText.setText('0/0');
    }

    // Update XP bar
    if (this.xpFill && maxXp > 0) {
      const ratio = Math.max(0, Math.min(1, xp / maxXp));
      const fullWidth = (this.XP_END_X - this.XP_START_X) - (this.FILL_PAD_X * 2);
      this.xpFill.width = Math.max(0, fullWidth * ratio);
      if (this.xpNumText) {
        this.xpNumText.setText(`${Math.max(0, Math.floor(xp))}/${maxXp}`);
      }
    } else if (this.xpNumText) {
      this.xpNumText.setText('0/0');
    }
  }

  /**
   * Update score display
   * @param {Object} scores - { red, blue }
   */
  updateScores(scores) {
    if (!scores || !this.scoreText) return;
    this.scoreText.setText(`Score: R ${scores.red || 0} | B ${scores.blue || 0}`);
  }

  /**
   * Update positions on camera resize
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   */
  tick(camera) {
    if (!camera) return;
    if (this.container) {
      this.container.setPosition(this.HUD_X, this.HUD_Y);
    }
    if (this.scoreText) {
      this.scoreText.setPosition(20, 80);
    }
  }

  /**
   * Destroy the HUD
   */
  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
    if (this.scoreText) {
      this.scoreText.destroy();
      this.scoreText = null;
    }
  }
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.HUD = HUD;
}

export default HUD;
