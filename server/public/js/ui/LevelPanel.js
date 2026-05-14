/**
 * LevelPanel - Sliding upgrade panel component
 *
 * A collapsible panel for level, XP, points, upgrades, and ship unlocks.
 */

import {
  CLASS_STATS,
  PLAYER_PROGRESS_DEFAULTS,
  cloneProgress,
  getShipStats,
  getXpRequiredForLevel
} from '../stats/stats.js';

class LevelPanel {
  /**
   * Create a new LevelPanel.
   *
   * @param {Phaser.Scene} scene
   * @param {Object} options
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    this.scene.input.topOnly = true;

    // Panel size
    this.PANEL_W = options.width || 320;
    this.PANEL_H = options.height || 340;
    this.PANEL_MARGIN = options.margin || 16;
    this.PANEL_Z = options.depth || 999;

    // Tab layout
    this.TAB_Z = this.PANEL_Z + 1;
    this.TAB_OFFSET_Y = 18;
    this.TAB_OUTSIDE_PAD = 6;

    // State
    this.isOpen = false;
    this.isAnimating = false;
    this.progress = cloneProgress(options.progress || PLAYER_PROGRESS_DEFAULTS);
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    this.onRequestShipPicker =
      typeof options.onRequestShipPicker === 'function' ? options.onRequestShipPicker : null;
    this.activeTab = 'upgrades'; // upgrades | ships

    // Panel position
    this.panelX = 0;
    this.panelY = 0;

    // UI
    this.panel = null;
    this.panelBg = null;
    this.tabBtn = null;
    this.tabCountText = null;
    this.panelTween = null;

    // Drawn content
    this.contentObjects = [];

    this._create();
  }

  /**
   * Create the panel.
   *
   * @private
   */
  _create() {
    const cam = this.scene.cameras.main;
    const openY = (cam.height / (cam.zoom || 1)) - this.PANEL_MARGIN - this.PANEL_H;
    const closedX = -this.PANEL_W + 24;

    this.panelX = closedX;
    this.panelY = openY;

    this.panel = this.scene.add.container(this.panelX, this.panelY)
      .setScrollFactor(0)
      .setDepth(this.PANEL_Z);

    this.panelBg = this.scene.add.rectangle(0, 0, this.PANEL_W, this.PANEL_H, 0x0b0b0b, 0.92)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0xffffff, 0.18);

    const title = this.scene.add.text(14, 12, 'LEVEL MENU', {
      fontSize: '16px',
      fill: '#ffffff',
      fontFamily: 'monospace'
    }).setOrigin(0, 0);

    this.panel.add([this.panelBg, title]);

    this._createTabButton();
    this._rebuildContents();
    this.tick(cam);
  }

  /**
   * Create the slide tab button.
   *
   * @private
   */
  _createTabButton() {
    const hasOut = this.scene.textures.exists('menuOut');

    if (hasOut) {
      this.tabBtn = this.scene.add.image(0, 0, 'menuOut').setOrigin(0.5, 0.5);
    } else {
      this.tabBtn = this.scene.add.rectangle(0, 0, 28, 24, 0x00ffcc, 0.85).setOrigin(0.5, 0.5);
    }

    this.tabBtn.setScrollFactor(0).setDepth(this.TAB_Z);
    this.tabBtn.setInteractive({ useHandCursor: true });
    this.tabBtn.on('pointerdown', () => {
      this._playButtonPressSound();
      this.toggle();
    });

    this.tabCountText = this.scene.add.text(0, 0, '0', {
      fontSize: '12px',
      fill: '#ffffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);

    this.tabCountText.setScrollFactor(0).setDepth(this.TAB_Z + 1);
    this._updateTabCount();
  }

  /**
   * Clear old content objects.
   *
   * @private
   */
  _clearContent() {
    this.contentObjects.forEach((obj) => {
      if (obj && obj.destroy) obj.destroy();
    });
    this.contentObjects = [];
  }

  /**
   * Add a text object in panel-local space.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} text
   * @param {Object} style
   * @returns {*}
   * @private
   */
  _addText(x, y, text, style = {}) {
    const obj = this.scene.add.text(this.panelX + x, this.panelY + y, text, {
      fontSize: style.fontSize || '12px',
      fill: style.fill || '#cccccc',
      fontFamily: style.fontFamily || 'monospace'
    }).setOrigin(0, 0);

    obj.setScrollFactor(0).setDepth(this.PANEL_Z + 2);
    obj._panelLocalX = x;
    obj._panelLocalY = y;

    this.contentObjects.push(obj);
    return obj;
  }

  /**
   * Add a button in panel-local space.
   *
   * @param {number} x
   * @param {number} y
   * @param {number} w
   * @param {number} h
   * @param {string} label
   * @param {Function} onClick
   * @param {Object} options
   * @returns {Object}
   * @private
   */
  _addButton(x, y, w, h, label, onClick, options = {}) {
    const enabled = options.enabled ?? true;
    const fill = options.fill ?? 0x18303a;

    const bg = this.scene.add.rectangle(this.panelX + x, this.panelY + y, w, h, fill, enabled ? 1 : 0.45)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0xffffff, enabled ? 0.22 : 0.12);

    bg.setScrollFactor(0).setDepth(this.PANEL_Z + 2);
    bg._panelLocalX = x;
    bg._panelLocalY = y;

    const txt = this.scene.add.text(this.panelX + x + (w / 2), this.panelY + y + (h / 2), label, {
      fontSize: '11px',
      fill: enabled ? '#ffffff' : '#888888',
      fontFamily: 'monospace',
      align: 'center'
    }).setOrigin(0.5, 0.5);

    txt.setScrollFactor(0).setDepth(this.PANEL_Z + 3);
    txt._panelLocalX = x + (w / 2);
    txt._panelLocalY = y + (h / 2);

    if (enabled) {
      bg.setInteractive(
        new Phaser.Geom.Rectangle(0, 0, w, h),
        Phaser.Geom.Rectangle.Contains
      );

      bg.on('pointerdown', () => {
        this._playButtonPressSound();
        onClick();
      });

      bg.on('pointerover', () => {
        bg.setAlpha(0.9);
      });

      bg.on('pointerout', () => {
        bg.setAlpha(1);
      });
    }

    this.contentObjects.push(bg, txt);
    return { bg, txt };
  }

  /**
   * Add top tabs inside panel.
   *
   * @private
   */
  _addTabs() {
    const y = 42;
    const w = 136;
    const h = 22;
    const gap = 8;

    const upgradesActive = this.activeTab === 'upgrades';
    const shipsActive = this.activeTab === 'ships';

    this._addButton(
      14,
      y,
      w,
      h,
      'UPGRADES',
      () => {
        this.activeTab = 'upgrades';
        this._rebuildContents();
      },
      {
        enabled: !upgradesActive,
        fill: upgradesActive ? 0x245040 : 0x18303a
      }
    );

    this._addButton(
      14 + w + gap,
      y,
      w,
      h,
      'SHIPS',
      () => {
        this.activeTab = 'ships';
        this._rebuildContents();
      },
      {
        enabled: !shipsActive,
        fill: shipsActive ? 0x4f3020 : 0x18303a
      }
    );
  }

  /**
   * Get the active ship key.
   *
   * @returns {string}
   * @private
   */
  _getActiveShipKey() {
    return this.progress.selectedShip || 'starter';
  }

  /**
   * Get the active ship progress.
   *
   * @returns {Object}
   * @private
   */
  _getActiveShipProgress() {
    const shipKey = this._getActiveShipKey();

    return this.progress.shipProgress?.[shipKey] || {
      level: 1,
      xp: 0,
      maxXp: 100,
      unspentStatPoints: 0,
      upgrades: {
        maxHp: 0,
        speed: 0,
        accel: 0
      }
    };
  }

  /**
   * Rebuild the panel contents.
   *
   * @private
   */
  _rebuildContents() {
    this._clearContent();

    let y = 74;

    const activeShipKey = this._getActiveShipKey();
    const activeShipProgress = this._getActiveShipProgress();
    const activeShipStats = getShipStats(activeShipKey, this.progress);

    this._addTabs();

    this._addText(14, y, `Ship: ${CLASS_STATS[activeShipKey].name}`, {
      fontSize: '13px',
      fill: '#ffffff'
    });
    y += 20;

    this._addText(14, y, `Level: ${activeShipProgress.level}`, {
      fontSize: '13px',
      fill: '#ffffff'
    });
    y += 20;

    this._addText(14, y, `XP: ${activeShipProgress.xp}/${activeShipProgress.maxXp}`);
    y += 18;

    this._addText(14, y, `Points: ${this.progress.points}`, {
      fill: '#ffe38d'
    });
    y += 18;

    if (this.activeTab === 'upgrades') {
      this._addText(14, y, `Unspent Stat Points: ${activeShipProgress.unspentStatPoints}`, {
        fill: '#9fe8ff'
      });
      y += 18;

      this._addText(14, y, 'Stat points come from leveling up.', {
        fill: '#7fa6b2'
      });
      y += 26;

      this._addText(14, y, `${CLASS_STATS[activeShipKey].name} Upgrades`, {
        fontSize: '13px',
        fill: '#ffffff'
      });
      y += 18;

      const canUpgrade = activeShipProgress.unspentStatPoints > 0;

      this._addText(14, y, `HP: ${activeShipStats.maxHp}  (+${activeShipProgress.upgrades.maxHp})`);
      this._addButton(
        190,
        y - 2,
        100,
        20,
        canUpgrade ? 'UPGRADE HP' : 'NO STAT PTS',
        () => this.upgradeShipStat('maxHp'),
        { enabled: canUpgrade, fill: 0x20465d }
      );
      y += 26;

      this._addText(14, y, `Speed: ${activeShipStats.speed}  (+${activeShipProgress.upgrades.speed})`);
      this._addButton(
        190,
        y - 2,
        100,
        20,
        canUpgrade ? 'UPGRADE SPD' : 'NO STAT PTS',
        () => this.upgradeShipStat('speed'),
        { enabled: canUpgrade, fill: 0x20465d }
      );
      y += 26;

      this._addText(14, y, `Accel: ${activeShipStats.accel}  (+${activeShipProgress.upgrades.accel})`);
      this._addButton(
        190,
        y - 2,
        100,
        20,
        canUpgrade ? 'UPGRADE ACC' : 'NO STAT PTS',
        () => this.upgradeShipStat('accel'),
        { enabled: canUpgrade, fill: 0x20465d }
      );
    }

    if (this.activeTab === 'ships') {
      y += 8;

      this._addText(14, y, 'Ship Menu', {
        fontSize: '13px',
        fill: '#ffffff'
      });
      y += 18;

      this._addButton(
        14,
        y,
        276,
        22,
        'OPEN SHIP MENU',
        () => this.requestShipMenu(),
        {
          enabled: true,
          fill: 0x20465d
        }
      );
      y += 32;

      this._addText(14, y, 'Ship Unlocks', {
        fontSize: '13px',
        fill: '#ffffff'
      });
      y += 18;

      this._addShipRow('starter', y);
      y += 30;

      this._addShipRow('hunter', y);
      y += 30;

      this._addShipRow('tanker', y);
    }

    this._updateTabCount();
    this.tick(this.scene.cameras.main);
  }

  /**
   * Open ship picker from panel.
   *
   * @private
   */
  requestShipMenu() {
    if (this.onRequestShipPicker) {
      this.onRequestShipPicker();
    }
  }

  /**
   * Add one ship row.
   *
   * @param {string} shipKey
   * @param {number} y
   * @private
   */
  _addShipRow(shipKey, y) {
    const cfg = CLASS_STATS[shipKey];
    const unlocked = this.progress.unlockedShips.includes(shipKey);
    const selected = this.progress.selectedShip === shipKey;
    const canBuy = this.progress.points >= cfg.unlockCost;

    this._addText(14, y, cfg.name, {
      fill: '#ffffff'
    });

    if (selected) {
      this._addButton(190, y - 2, 100, 20, 'SELECTED', () => {}, {
        enabled: false,
        fill: 0x245040
      });
      return;
    }

    if (unlocked) {
      this._addButton(
        190,
        y - 2,
        100,
        20,
        'SELECT SHIP',
        () => this.requestShipMenu(),
        {
          enabled: true,
          fill: 0x20465d
        }
      );
      return;
    }

    this._addButton(
      190,
      y - 2,
      100,
      20,
      canBuy ? `BUY ${cfg.unlockCost}` : `NEED ${cfg.unlockCost}`,
      () => this.unlockShip(shipKey),
      {
        enabled: canBuy,
        fill: 0x4f3020
      }
    );
  }

  /**
   * Set progress state.
   *
   * @param {Object} progress
   */
  setProgress(progress) {
    this.progress = cloneProgress(progress);
    this._rebuildContents();
    this._emitChange();
  }

  /**
   * Get a safe copy of progress.
   *
   * @returns {Object}
   */
  getProgress() {
    return cloneProgress(this.progress);
  }

  /**
   * Add points.
   *
   * @param {number} amount
   */
  addPoint(amount = 1) {
    this.progress.points += amount;
    this._rebuildContents();
    this._emitChange();
  }

  /**
   * Gain XP for the active ship and level it up if needed.
   *
   * @param {number} amount
   * @returns {number} Number of upgrade points gained.
   */
  gainXp(amount = 0) {
    if (amount <= 0) return 0;

    const shipKey = this._getActiveShipKey();
    const shipProg = this.progress.shipProgress[shipKey];
    if (!shipProg) return 0;

    shipProg.xp += amount;
    let upgradePointsGained = 0;

    while (shipProg.xp >= shipProg.maxXp) {
      shipProg.xp -= shipProg.maxXp;
      shipProg.level += 1;
      shipProg.unspentStatPoints += 1;
      upgradePointsGained += 1;
      shipProg.maxXp = getXpRequiredForLevel(shipProg.level);
    }

    this._rebuildContents();
    this._emitChange();

    return upgradePointsGained;
  }

  /**
   * Upgrade one stat for the active ship.
   *
   * @param {string} statKey
   */
  upgradeShipStat(statKey) {
    if (!['maxHp', 'speed', 'accel'].includes(statKey)) return;

    const shipKey = this._getActiveShipKey();
    const shipProg = this.progress.shipProgress[shipKey];

    if (!shipProg) return;
    if (shipProg.unspentStatPoints <= 0) return;

    shipProg.unspentStatPoints -= 1;
    shipProg.upgrades[statKey] += 1;

    this._rebuildContents();
    this._emitChange();
  }

  /**
   * Unlock a ship with points.
   *
   * @param {string} shipKey
   */
  unlockShip(shipKey) {
    const cfg = CLASS_STATS[shipKey];
    if (!cfg) return;
    if (this.progress.unlockedShips.includes(shipKey)) return;
    if (this.progress.points < cfg.unlockCost) return;

    this.progress.points -= cfg.unlockCost;
    this.progress.unlockedShips.push(shipKey);

    if (!this.progress.shipProgress[shipKey]) {
      this.progress.shipProgress[shipKey] = {
        level: 1,
        xp: 0,
        maxXp: 100,
        unspentStatPoints: 0,
        upgrades: {
          maxHp: 0,
          speed: 0,
          accel: 0
        }
      };
    }

    this._rebuildContents();
    this._emitChange();
  }

  /**
   * Select the current ship directly.
   *
   * @param {string} shipKey
   */
  selectShip(shipKey) {
    if (!this.progress.unlockedShips.includes(shipKey)) return;

    this.progress.selectedShip = shipKey;
    this._rebuildContents();
    this._emitChange();
  }

  /**
   * Update the tab count text.
   *
   * @private
   */
  _updateTabCount() {
    if (!this.tabCountText) return;

    const shipKey = this._getActiveShipKey();
    const statPoints = this.progress.shipProgress?.[shipKey]?.unspentStatPoints ?? 0;
    this.tabCountText.setText(String(statPoints));
  }

  /**
   * Emit change callback.
   *
   * @private
   */
  _emitChange() {
    if (this.onChange) {
      this.onChange(this.getProgress());
    }
  }

  /**
   * Play shared button feedback for Phaser UI controls.
   *
   * @private
   */
  _playButtonPressSound() {
    if (typeof window !== 'undefined' && typeof window.playButtonPressSound === 'function') {
      window.playButtonPressSound();
    }
  }

  /**
   * Toggle the panel.
   */
  toggle() {
    if (this.isAnimating) return;
    if (this.isOpen) this.close();
    else this.open();
  }

  /**
   * Open the panel.
   */
  open() {
    if (this.isAnimating || this.isOpen) return;
    this.isAnimating = true;

    if (this.panelTween) this.panelTween.stop();

    const cam = this.scene.cameras.main;
    const openX = this.PANEL_MARGIN;
    const openY = (cam.height / (cam.zoom || 1)) - this.PANEL_MARGIN - this.PANEL_H;

    this.panelTween = this.scene.tweens.addCounter({
      from: this.panelX,
      to: openX,
      duration: 240,
      ease: 'Sine.easeOut',
      onUpdate: (tween) => {
        this.panelX = tween.getValue();
        this.panelY = openY;
        this.tick(cam);
      },
      onComplete: () => {
        this.isAnimating = false;
        this.isOpen = true;
      }
    });

    if (this.tabBtn && this.scene.textures.exists('menuIn')) {
      this.tabBtn.setTexture('menuIn');
    }
  }

  /**
   * Close the panel.
   */
  close() {
    if (this.isAnimating || !this.isOpen) return;
    this.isAnimating = true;

    if (this.panelTween) this.panelTween.stop();

    const cam = this.scene.cameras.main;
    const closedX = -this.PANEL_W + 24;
    const openY = (cam.height / (cam.zoom || 1)) - this.PANEL_MARGIN - this.PANEL_H;

    this.panelTween = this.scene.tweens.addCounter({
      from: this.panelX,
      to: closedX,
      duration: 240,
      ease: 'Sine.easeIn',
      onUpdate: (tween) => {
        this.panelX = tween.getValue();
        this.panelY = openY;
        this.tick(cam);
      },
      onComplete: () => {
        this.isAnimating = false;
        this.isOpen = false;
      }
    });

    if (this.tabBtn && this.scene.textures.exists('menuOut')) {
      this.tabBtn.setTexture('menuOut');
    }
  }

  /**
   * Update panel position on resize.
   *
   * @param {Phaser.Cameras.Scene2D.Camera} camera
   */
  tick(camera) {
    if (!camera) return;

    const z = camera.zoom || 1;
    const hw = camera.width / 2;
    const hh = camera.height / 2;

    const desiredY = camera.height - this.PANEL_MARGIN - this.PANEL_H;
    const objPanelX = hw + (this.panelX - hw) / z;
    const objPanelY = hh + (desiredY - hh) / z;

    if (this.panel) {
      this.panel.setScale(1 / z);
      this.panel.setPosition(objPanelX, objPanelY);
    }

    this.contentObjects.forEach((obj) => {
      if (!obj) return;
      if (typeof obj._panelLocalX !== 'number' || typeof obj._panelLocalY !== 'number') return;

      const sx = this.panelX + obj._panelLocalX;
      const sy = desiredY + obj._panelLocalY;
      obj.setScale(1 / z);
      obj.x = hw + (sx - hw) / z;
      obj.y = hh + (sy - hh) / z;
    });

    if (this.tabBtn) {
      const sx = this.panelX + this.PANEL_W + this.TAB_OUTSIDE_PAD;
      const sy = desiredY + this.TAB_OFFSET_Y;
      this.tabBtn.setScale(1 / z);
      this.tabBtn.setPosition(hw + (sx - hw) / z, hh + (sy - hh) / z);
    }

    if (this.tabCountText && this.tabBtn) {
      this.tabCountText.setScale(1 / z);
      this.tabCountText.setPosition(this.tabBtn.x, this.tabBtn.y);
    }
  }

  /**
   * Destroy the panel.
   */
  destroy() {
    if (this.panelTween) this.panelTween.stop();

    this._clearContent();

    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }

    if (this.tabBtn) {
      this.tabBtn.destroy();
      this.tabBtn = null;
    }

    if (this.tabCountText) {
      this.tabCountText.destroy();
      this.tabCountText = null;
    }
  }
}

if (typeof window !== 'undefined') {
  window.LevelPanel = LevelPanel;
}

export default LevelPanel;
