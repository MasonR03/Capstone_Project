/**
 * LevelPanel - Sliding upgrade panel component
 *
 * A collapsible panel for level-up upgrades and perks.
 */

class LevelPanel {
  /**
   * Create a new LevelPanel
   * @param {Phaser.Scene} scene - The Phaser scene
   * @param {Object} options - Configuration options
   */
  constructor(scene, options = {}) {
    this.scene = scene;

    // Panel dimensions
    this.PANEL_W = options.width || 260;
    this.PANEL_H = options.height || 220;
    this.PANEL_MARGIN = options.margin || 16;
    this.PANEL_Z = options.depth || 999;

    // Tab settings
    this.TAB_Z = this.PANEL_Z + 1;
    this.TAB_OFFSET_Y = 18;
    this.TAB_OUTSIDE_PAD = 6;

    // State
    this.isOpen = false;
    this.isAnimating = false;

    // UI elements
    this.panel = null;
    this.panelBg = null;
    this.tabBtn = null;
    this.panelTween = null;
    this.tabTween = null;

    this._create();
  }

  /**
   * Create panel elements
   * @private
   */
  _create() {
    const cam = this.scene.cameras.main;

    // Anchored bottom-left
    const openY = cam.height - this.PANEL_MARGIN - this.PANEL_H;
    const closedX = -this.PANEL_W + 24;

    // Panel container
    this.panel = this.scene.add.container(closedX, openY)
      .setScrollFactor(0)
      .setDepth(this.PANEL_Z);

    // Panel background
    this.panelBg = this.scene.add.rectangle(0, 0, this.PANEL_W, this.PANEL_H, 0x0b0b0b, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.18);
    this.panel.add(this.panelBg);

    // Title
    const title = this.scene.add.text(14, 12, 'LEVEL UP', {
      fontSize: '16px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0, 0);
    this.panel.add(title);

    // Hint text
    const hint = this.scene.add.text(14, 44, 'Coming soon:\n- Spend points\n- Upgrades\n- Perks', {
      fontSize: '12px',
      fill: '#cccccc',
      fontFamily: 'monospace'
    }).setOrigin(0, 0);
    this.panel.add(hint);

    // Tab button (outside panel)
    this._createTabButton();

    // Set up keyboard shortcuts
    this.scene.input.keyboard.on('keydown-P', () => this.open());
    this.scene.input.keyboard.on('keydown-L', () => this.close());

    // Initial layout
    this.tick(cam);
  }

  /**
   * Create the tab button
   * @private
   */
  _createTabButton() {
    const hasIn = this.scene.textures.exists('menuIn');
    const hasOut = this.scene.textures.exists('menuOut');

    if (!hasIn) console.warn('LevelPanel: Missing texture key "menuIn"');
    if (!hasOut) console.warn('LevelPanel: Missing texture key "menuOut"');

    // Create button with appropriate texture or fallback
    if (hasOut) {
      this.tabBtn = this.scene.add.image(0, 0, 'menuOut').setOrigin(0.5, 0.5);
    } else {
      this.tabBtn = this.scene.add.rectangle(0, 0, 22, 22, 0x00ffcc, 0.85).setOrigin(0.5, 0.5);
    }

    this.tabBtn.setScrollFactor(0).setDepth(this.TAB_Z);
    this.tabBtn.setInteractive({ useHandCursor: true });
    this.tabBtn.on('pointerdown', () => this.toggle());
  }

  /**
   * Toggle panel open/closed
   */
  toggle() {
    if (this.isAnimating) return;
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open the panel
   */
  open() {
    if (!this.panel || this.isAnimating || this.isOpen) return;
    this.isAnimating = true;

    if (this.panelTween) this.panelTween.stop();
    if (this.tabTween) this.tabTween.stop();

    const cam = this.scene.cameras.main;
    const openX = this.PANEL_MARGIN;
    const openY = cam.height - this.PANEL_MARGIN - this.PANEL_H;

    this.panelTween = this.scene.tweens.add({
      targets: this.panel,
      x: openX,
      y: openY,
      duration: 240,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.isAnimating = false;
        this.isOpen = true;
      }
    });

    // Switch tab art to "in" if available
    if (this.tabBtn && this.scene.textures.exists('menuIn')) {
      this.tabBtn.setTexture('menuIn');
    }
  }

  /**
   * Close the panel
   */
  close() {
    if (!this.panel || this.isAnimating || !this.isOpen) return;
    this.isAnimating = true;

    if (this.panelTween) this.panelTween.stop();
    if (this.tabTween) this.tabTween.stop();

    const cam = this.scene.cameras.main;
    const closedX = -this.PANEL_W + 24;
    const openY = cam.height - this.PANEL_MARGIN - this.PANEL_H;

    this.panelTween = this.scene.tweens.add({
      targets: this.panel,
      x: closedX,
      y: openY,
      duration: 240,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.isAnimating = false;
        this.isOpen = false;
      }
    });

    // Switch tab art to "out" if available
    if (this.tabBtn && this.scene.textures.exists('menuOut')) {
      this.tabBtn.setTexture('menuOut');
    }
  }

  /**
   * Update positions on camera resize
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   */
  tick(camera) {
    if (!camera) return;

    // Panel anchor bottom-left
    if (this.panel) {
      const baseY = camera.height - this.PANEL_MARGIN - this.PANEL_H;
      this.panel.y = baseY;

      // Keep snapped only when not animating
      if (this.isOpen && !this.isAnimating) {
        this.panel.x = this.PANEL_MARGIN;
      }
    }

    // Tab stays outside panel edge
    if (this.tabBtn && this.panel) {
      const tabX = this.panel.x + this.PANEL_W + this.TAB_OUTSIDE_PAD;
      const tabY = this.panel.y + this.TAB_OFFSET_Y;
      this.tabBtn.setPosition(tabX, tabY);
    }
  }

  /**
   * Destroy the panel
   */
  destroy() {
    if (this.panelTween) this.panelTween.stop();
    if (this.tabTween) this.tabTween.stop();
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    if (this.tabBtn) {
      this.tabBtn.destroy();
      this.tabBtn = null;
    }
  }
}

// Export for ES6 modules and browser global
if (typeof window !== 'undefined') {
  window.LevelPanel = LevelPanel;
}

export default LevelPanel;
