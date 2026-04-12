/**
 * ClassPicker - Ship class selection UI
 *
 * Keyboard-navigable modal for selecting a ship class at game start.
 */

import {
  CLASS_STATS,
  PLAYER_PROGRESS_DEFAULTS,
  cloneProgress,
  getShipStats
} from '../stats/stats.js';

/**
 * Get config with fallback.
 *
 * @returns {Object}
 */
const getConfig = () => {
  if (typeof GameConfig !== 'undefined') return GameConfig;
  if (typeof window !== 'undefined' && window.GameConfig) return window.GameConfig;

  return {
    shipClasses: {
      starter: {
        name: 'Starter',
        spriteKey: 'ship_starter',
        stats: CLASS_STATS.starter
      },
      hunter: {
        name: 'Hunter',
        spriteKey: 'ship_hunter',
        stats: CLASS_STATS.hunter
      },
      tanker: {
        name: 'Tanker',
        spriteKey: 'ship_tanker',
        stats: CLASS_STATS.tanker
      }
    },
    defaultClass: 'starter',
    sprites: {
      ship: { width: 53, height: 40 }
    }
  };
};

class ClassPicker {
  /**
   * Create a new ClassPicker.
   *
   * @param {Phaser.Scene} scene
   * @param {Function} onPick
   * @param {Object} options
   */
  constructor(scene, onPick, options = {}) {
    const config = getConfig();

    this.scene = scene;
    this.onPick = onPick;
    this.config = config;
    this.shipClasses = config.shipClasses;
    this.defaultClass = config.defaultClass || 'starter';
    this.progress = cloneProgress(options.progress || PLAYER_PROGRESS_DEFAULTS);

    // State
    this.selectedIndex = 0;
    this.classKeys = Object.keys(this.shipClasses);
    this.isOpen = false;

    // UI
    this.overlay = null;
    this.rows = [];
    this.keyboardHandler = null;

    if (this.classKeys.length === 0) {
      this._complete(this.defaultClass);
      return;
    }

    this._setInitialSelection();
    this._create();
  }

  /**
   * Pick the first owned ship for the default cursor position.
   *
   * @private
   */
  _setInitialSelection() {
    const firstOwnedIndex = this.classKeys.findIndex((key) => this._isOwned(key));
    this.selectedIndex = firstOwnedIndex >= 0 ? firstOwnedIndex : 0;
  }

  /**
   * Create the picker.
   *
   * @private
   */
  _create() {
    try {
      if (document.activeElement && document.activeElement.blur) {
        document.activeElement.blur();
      }

      if (window.focus) {
        window.focus();
      }
    } catch (e) {}

    const cam = this.scene.cameras.main;
    const z = cam.zoom || 1;
    const hw = cam.width / 2;
    const hh = cam.height / 2;
    const layout = this._getLayout(cam);

    // Position at screen top-left using scrollFactor(0) zoom formula
    this.overlay = this.scene.add.container(Math.round(hw - hw / z), Math.round(hh - hh / z))
      .setScrollFactor(0)
      .setScale(1 / z)
      .setDepth(999999);

    const dim = this.scene.add.rectangle(0, 0, cam.width, cam.height, 0x000000, 0.80)
      .setOrigin(0, 0);
    this.overlay.add(dim);

    const panelGlow = this.scene.add.rectangle(
      layout.centerX,
      layout.panelCenterY,
      layout.panelWidth + 22,
      layout.panelHeight + 22,
      0x00c8ff,
      0.06
    ).setStrokeStyle(2, 0x00c8ff, 0.10);
    this.overlay.add(panelGlow);

    const panel = this.scene.add.rectangle(
      layout.centerX,
      layout.panelCenterY,
      layout.panelWidth,
      layout.panelHeight,
      0x07131c,
      0.82
    ).setStrokeStyle(2, 0x1fb6d1, 0.24);
    this.overlay.add(panel);

    const panelInset = this.scene.add.rectangle(
      layout.centerX,
      layout.panelCenterY,
      layout.panelWidth - Math.round(28 * layout.scale),
      layout.panelHeight - Math.round(28 * layout.scale),
      0x09141d,
      0.28
    ).setStrokeStyle(1, 0x67ecff, 0.08);
    this.overlay.add(panelInset);

    const topRail = this.scene.add.rectangle(
      layout.centerX,
      layout.topRailY,
      layout.panelWidth - Math.round(46 * layout.scale),
      Math.max(4, Math.round(6 * layout.scale)),
      0x00d2ff,
      0.38
    ).setOrigin(0.5, 0.5);
    this.overlay.add(topRail);

    const headerPlate = this.scene.add.rectangle(
      layout.centerX,
      layout.headerCenterY,
      layout.panelWidth - 42,
      layout.headerHeight,
      0x0b1a24,
      0.90
    ).setStrokeStyle(1, 0x67ecff, 0.18);
    this.overlay.add(headerPlate);

    const titleShadow = this._makeText(layout.centerX, layout.titleY + Math.max(2, Math.round(3 * layout.scale)), 'Choose Your Ship', {
      fontSize: `${layout.fonts.title}px`,
      fill: '#0b2230',
      fontFamily: 'Orbitron, monospace'
    }, 0.5, 0.5);
    titleShadow.setAlpha(0.95);
    this.overlay.add(titleShadow);

    const title = this._makeText(layout.centerX, layout.titleY, 'Choose Your Ship', {
      fontSize: `${layout.fonts.title}px`,
      fill: '#e9fbff',
      fontFamily: 'Orbitron, monospace'
    }, 0.5, 0.5);
    this.overlay.add(title);

    const eyebrow = this._makeText(layout.centerX, layout.eyebrowY, 'ORBITAL HANGAR', {
      fontSize: `${layout.fonts.eyebrow}px`,
      fill: '#79dff0',
      fontFamily: 'Orbitron, monospace'
    }, 0.5, 0.5);
    this.overlay.add(eyebrow);

    const hint = this._makeText(
      layout.centerX,
      layout.hintY,
      '↑/W up   ↓/S down   ENTER pick   ESC cancel',
      {
        fontSize: `${layout.fonts.hint}px`,
        fill: '#9dd9e6',
        fontFamily: 'Orbitron, monospace'
      },
      0.5,
      0.5
    );
    this.overlay.add(hint);

    const headerDivider = this.scene.add.rectangle(
      layout.centerX,
      layout.headerDividerY,
      layout.panelWidth - 84,
      2,
      0x67ecff,
      0.22
    ).setOrigin(0.5, 0.5);
    this.overlay.add(headerDivider);

    const columnBar = this.scene.add.rectangle(
      layout.centerX,
      layout.columnBarY,
      layout.rowWidth,
      layout.columnBarHeight,
      0x0c1a24,
      0.86
    ).setStrokeStyle(1, 0x67ecff, 0.16);
    this.overlay.add(columnBar);

    this._addColumnHeaders(layout);

    this._buildRows(cam, layout);
    this._setupKeyboard();
    this._refresh();

    this.isOpen = true;
  }

  /**
   * Calculate the centered picker layout.
   *
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   * @returns {Object}
   * @private
   */
  _getLayout(cam) {
    const scale = 0.8;
    const compact = cam.height < 720 || cam.width < 1100;
    const rowWidth = Math.round(Math.min(900, Math.max(680, cam.width - 220)) * scale);
    const rowHeight = Math.round((compact ? 118 : 128) * scale);
    const rowGap = Math.round((compact ? 18 : 22) * scale);
    const rowStackHeight = (this.classKeys.length * rowHeight) + ((this.classKeys.length - 1) * rowGap);
    const headerHeight = Math.round((compact ? 108 : 118) * scale);
    const topPadding = Math.round((compact ? 22 : 28) * scale);
    const bottomPadding = Math.round((compact ? 26 : 32) * scale);
    const headerGap = Math.round(14 * scale);
    const columnBarHeight = Math.round(34 * scale);
    const rowsTopGap = Math.round(18 * scale);
    const estimatedHeight = (
      topPadding +
      headerHeight +
      headerGap +
      columnBarHeight +
      rowsTopGap +
      rowStackHeight +
      bottomPadding
    );
    const top = Math.max(24, Math.round((cam.height - estimatedHeight) / 2));
    const centerX = cam.width / 2;
    const headerTopY = top + topPadding;
    const columnBarY = headerTopY + headerHeight + headerGap + (columnBarHeight / 2);
    const rowsStartY = columnBarY + (columnBarHeight / 2) + rowsTopGap + (rowHeight / 2);
    const panelBottomY = rowsStartY + rowStackHeight - (rowHeight / 2) + bottomPadding;
    const panelHeight = panelBottomY - top;
    const panelCenterY = top + (panelHeight / 2);
    const statBlockWidth = Math.round(74 * scale);
    const statBlockHeight = Math.round(54 * scale);
    const statBlockGap = Math.round(12 * scale);
    const columns = {
      dockCenterX: -rowWidth / 2 + Math.round(90 * scale),
      dockWidth: Math.round(116 * scale),
      dockHeight: rowHeight - Math.round(24 * scale),
      nameX: -rowWidth / 2 + Math.round(168 * scale),
      nameY: -Math.round(8 * scale),
      statCenterStartX: Math.round(24 * scale),
      statBlockWidth,
      statBlockHeight,
      statBlockGap,
      statLabelY: -Math.round(11 * scale),
      statValueY: Math.round(10 * scale),
      performanceCenterX: Math.round(24 * scale) + statBlockWidth + statBlockGap,
      statusDividerX: rowWidth / 2 - Math.round(124 * scale),
      statusX: rowWidth / 2 - Math.round(34 * scale),
      statusY: -Math.round(10 * scale),
      costY: Math.round(16 * scale)
    };

    return {
      centerX,
      scale,
      panelWidth: rowWidth + Math.round(96 * scale),
      panelHeight,
      panelCenterY,
      headerHeight,
      headerCenterY: headerTopY + (headerHeight / 2),
      topRailY: headerTopY - Math.round(10 * scale),
      eyebrowY: headerTopY + Math.round(14 * scale),
      titleY: headerTopY + Math.round((compact ? 46 : 50) * scale),
      hintY: headerTopY + Math.round((compact ? 78 : 86) * scale),
      headerDividerY: headerTopY + headerHeight + Math.round(headerGap / 2),
      columnBarY,
      columnBarHeight,
      rowsStartY,
      rowWidth,
      rowHeight,
      rowGap,
      columns,
      fonts: {
        eyebrow: Math.max(10, Math.round(12 * scale)),
        title: Math.round(30 * scale),
        hint: Math.max(10, Math.round(13 * scale)),
        column: Math.max(10, Math.round(12 * scale)),
        name: Math.round(22 * scale),
        statLabel: Math.max(10, Math.round(12 * scale)),
        statValue: Math.max(12, Math.round(16 * scale)),
        tag: Math.max(11, Math.round(15 * scale)),
        cost: Math.max(10, Math.round(12 * scale))
      }
    };
  }

  /**
   * Add the row column labels.
   *
   * @param {Object} layout
   * @private
   */
  _addColumnHeaders(layout) {
    const headers = [
      {
        x: layout.centerX + layout.columns.dockCenterX,
        label: 'SHIP',
        originX: 0.5
      },
      {
        x: layout.centerX + layout.columns.nameX,
        label: 'CLASS',
        originX: 0
      },
      {
        x: layout.centerX + layout.columns.performanceCenterX,
        label: 'PERFORMANCE',
        originX: 0.5
      },
      {
        x: layout.centerX + layout.columns.statusX,
        label: 'STATUS',
        originX: 1
      }
    ];

    headers.forEach((header) => {
      const text = this._makeText(header.x, layout.columnBarY, header.label, {
        fontSize: `${layout.fonts.column}px`,
        fill: '#8dc8d8',
        fontFamily: 'Orbitron, monospace'
      }, header.originX, 0.5);

      this.overlay.add(text);
    });
  }

  /**
   * Create text with rounded placement and more stable browser rendering.
   *
   * @param {number} x
   * @param {number} y
   * @param {string} value
   * @param {Object} style
   * @param {number} originX
   * @param {number} originY
   * @returns {Phaser.GameObjects.Text}
   * @private
   */
  _makeText(x, y, value, style, originX = 0, originY = 0.5) {
    const text = this.scene.add.text(Math.round(x), Math.round(y), value, style)
      .setOrigin(originX, originY);

    if (typeof text.setResolution === 'function') {
      const dpr = typeof window !== 'undefined' ? Math.max(1, Math.round(window.devicePixelRatio || 1)) : 1;
      text.setResolution(Math.min(2, dpr));
    }

    if (text.context && 'fontKerning' in text.context) {
      text.context.fontKerning = 'none';
      if (typeof text.updateText === 'function') {
        text.updateText();
      }
    }

    return text;
  }

  /**
   * Build the ship rows.
   *
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   * @private
   */
  _buildRows(cam, layout) {
    const config = this.config || getConfig();
    const shipWidth = (config.sprites && config.sprites.ship && config.sprites.ship.width) || 53;
    const shipHeight = (config.sprites && config.sprites.ship && config.sprites.ship.height) || 40;
    const shipScale = 1.9 * layout.scale;
    const columns = layout.columns;

    this.classKeys.forEach((key, i) => {
      const classCfg = this.shipClasses[key];
      const y = layout.rowsStartY + i * (layout.rowHeight + layout.rowGap);

      const row = this.scene.add.container(layout.centerX, y);
      this.overlay.add(row);

      const rowW = layout.rowWidth;
      const rowH = layout.rowHeight;

      const glow = this.scene.add.rectangle(0, 0, rowW + Math.round(12 * layout.scale), rowH + Math.round(12 * layout.scale), 0x00c8ff, 0.08)
        .setStrokeStyle(2, 0x00c8ff, 0.18)
        .setVisible(false);
      row.add(glow);

      const box = this.scene.add.rectangle(0, 0, rowW, rowH, 0x0b141b, 0.94)
        .setStrokeStyle(2, 0x1fb6d1, 0.35);
      row.add(box);

      const rowLine = this.scene.add.rectangle(
        0,
        -rowH / 2 + Math.round(8 * layout.scale),
        rowW - Math.round(28 * layout.scale),
        2,
        0x67ecff,
        0.18
      ).setOrigin(0.5, 0.5);
      row.add(rowLine);

      const accent = this.scene.add.rectangle(-rowW / 2 + Math.round(12 * layout.scale), 0, Math.max(4, Math.round(6 * layout.scale)), rowH - Math.round(20 * layout.scale), 0x00ffcc, 0.85)
        .setOrigin(0.5, 0.5);
      row.add(accent);

      const dock = this.scene.add.rectangle(
        columns.dockCenterX,
        0,
        columns.dockWidth,
        columns.dockHeight,
        0x0a1620,
        0.92
      ).setStrokeStyle(1, 0x67ecff, 0.18);
      row.add(dock);

      const innerLine = this.scene.add.rectangle(columns.statusDividerX, 0, 2, rowH - Math.round(22 * layout.scale), 0x67ecff, 0.14)
        .setOrigin(0.5, 0.5);
      row.add(innerLine);

      const shipImg = this.scene.add.image(Math.round(columns.dockCenterX), 0, classCfg.spriteKey);
      shipImg.setDisplaySize(shipWidth * shipScale, shipHeight * shipScale);
      row.add(shipImg);

      const nameText = this._makeText(columns.nameX, columns.nameY, classCfg.name, {
        fontSize: `${layout.fonts.name}px`,
        fill: '#e9fbff',
        fontFamily: 'Orbitron, monospace'
      }, 0, 0.5);
      row.add(nameText);

      const st = getShipStats(key, this.progress) || classCfg.stats;
      const stats = [
        { label: 'HP', value: `${st.maxHp}` },
        { label: 'SPD', value: `${st.speed}` },
        { label: 'ACC', value: `${st.accel}` }
      ];

      const statBoxes = [];
      const statLabelTexts = [];
      const statValueTexts = [];

      stats.forEach((stat, statIndex) => {
        const statX = columns.statCenterStartX + (
          statIndex * (columns.statBlockWidth + columns.statBlockGap)
        );

        const statBox = this.scene.add.rectangle(
          statX,
          0,
          columns.statBlockWidth,
          columns.statBlockHeight,
          0x0b1722,
          0.96
        ).setStrokeStyle(1, 0x67ecff, 0.12);
        row.add(statBox);
        statBoxes.push(statBox);

        const statLabelText = this._makeText(statX, columns.statLabelY, stat.label, {
          fontSize: `${layout.fonts.statLabel}px`,
          fill: '#b8d7e2',
          fontFamily: 'Orbitron, monospace'
        }, 0.5, 0.5);
        row.add(statLabelText);
        statLabelTexts.push(statLabelText);

        const statValueText = this._makeText(statX, columns.statValueY, stat.value, {
          fontSize: `${layout.fonts.statValue}px`,
          fill: '#e9fbff',
          fontFamily: 'Orbitron, monospace'
        }, 0.5, 0.5);
        row.add(statValueText);
        statValueTexts.push(statValueText);
      });

      const tag = this._makeText(columns.statusX, columns.statusY, '', {
        fontSize: `${layout.fonts.tag}px`,
        fill: '#00ffcc',
        fontFamily: 'Orbitron, monospace'
      }, 1, 0.5);
      row.add(tag);

      const costText = this._makeText(columns.statusX, columns.costY, '', {
        fontSize: `${layout.fonts.cost}px`,
        fill: '#ffd27f',
        fontFamily: 'Orbitron, monospace'
      }, 1, 0.5);
      row.add(costText);

      box.setInteractive({ useHandCursor: true });

      box.on('pointerover', () => {
        this.selectedIndex = i;
        this._refresh();
      });

      box.on('pointerdown', () => {
        this.selectedIndex = i;
        this._refresh();

        const pickedKey = this.classKeys[this.selectedIndex];
        if (!this._isOwned(pickedKey)) return;

        this._complete(pickedKey);
      });

      this.rows.push({
        key,
        box,
        glow,
        rowLine,
        accent,
        dock,
        shipImg,
        nameText,
        innerLine,
        statBoxes,
        statLabelTexts,
        statValueTexts,
        tag,
        costText
      });
    });
  }

  /**
   * Set up keyboard input.
   *
   * @private
   */
  _setupKeyboard() {
    const kb = this.scene.input.keyboard;

    this.keyboardHandler = (ev) => {
      const code = ev.code;

      if (code === 'KeyP' || code === 'KeyW' || code === 'ArrowUp') {
        this.selectedIndex = (this.selectedIndex - 1 + this.classKeys.length) % this.classKeys.length;
        this._refresh();
        return;
      }

      if (code === 'KeyL' || code === 'KeyS' || code === 'ArrowDown') {
        this.selectedIndex = (this.selectedIndex + 1) % this.classKeys.length;
        this._refresh();
        return;
      }

      if (code === 'Enter' || code === 'Space') {
        const pickedKey = this.classKeys[this.selectedIndex];
        if (!this._isOwned(pickedKey)) return;
        this._complete(pickedKey);
        return;
      }

      if (code === 'Escape') {
        this._complete(this.defaultClass);
      }
    };

    kb.on('keydown', this.keyboardHandler);
  }

  /**
   * Check if a ship is owned.
   *
   * @param {string} key
   * @returns {boolean}
   * @private
   */
  _isOwned(key) {
    return Array.isArray(this.progress.unlockedShips) && this.progress.unlockedShips.includes(key);
  }

  /**
   * Refresh row visuals.
   *
   * @private
   */
  _refresh() {
    this.rows.forEach((r, i) => {
      const selected = i === this.selectedIndex;
      const owned = this._isOwned(r.key);
      const isCurrent = this.progress.selectedShip === r.key;
      const cost = CLASS_STATS[r.key]?.unlockCost ?? 0;
      const accentColor = selected ? 0x00ffcc : (owned ? 0x8ed5e4 : 0xff8f8f);
      const panelFill = selected ? 0x102738 : 0x08111a;

      r.box.setFillStyle(panelFill, selected ? 0.98 : 0.94);
      r.box.setStrokeStyle(
        2,
        accentColor,
        selected ? 0.95 : 0.22
      );

      if (r.glow) {
        r.glow.setVisible(selected);
      }

      if (r.rowLine) {
        r.rowLine.setFillStyle(accentColor, selected ? 0.46 : 0.20);
      }

      if (r.accent) {
        r.accent.setFillStyle(
          accentColor,
          selected ? 0.95 : 0.55
        );
      }

      if (r.dock) {
        r.dock.setFillStyle(selected ? 0x0e2230 : 0x0a1620, owned ? 0.96 : 0.88);
        r.dock.setStrokeStyle(1, accentColor, selected ? 0.38 : 0.18);
      }

      if (r.innerLine) {
        r.innerLine.setFillStyle(accentColor, selected ? 0.26 : 0.12);
      }

      if (r.shipImg) {
        r.shipImg.setAlpha(owned ? (selected ? 1 : 0.90) : 0.40);
      }

      if (r.nameText) {
        r.nameText.setAlpha(selected ? 1 : 0.92);
        r.nameText.setColor(owned ? '#e9fbff' : '#bdc9d4');
      }

      if (Array.isArray(r.statBoxes)) {
        r.statBoxes.forEach((box) => {
          box.setFillStyle(selected ? 0x102435 : 0x0b1722, selected ? 1 : 0.96);
          box.setStrokeStyle(1, accentColor, selected ? 0.34 : 0.10);
        });
      }

      if (Array.isArray(r.statLabelTexts)) {
        r.statLabelTexts.forEach((text) => {
          text.setAlpha(selected ? 0.96 : 0.80);
          text.setColor(selected ? '#bfeeff' : '#9ab7c1');
        });
      }

      if (Array.isArray(r.statValueTexts)) {
        r.statValueTexts.forEach((text) => {
          text.setAlpha(selected ? 1 : 0.92);
          text.setColor(owned ? '#e9fbff' : '#c0c9d0');
        });
      }

      if (!owned) {
        r.tag.setText('LOCKED');
        r.tag.setColor('#ff8f8f');
        r.costText.setText(`COST ${cost}`);
        r.costText.setAlpha(1);
      } else if (isCurrent) {
        r.tag.setText('SELECTED');
        r.tag.setColor('#00ffcc');
        r.costText.setText('');
        r.costText.setAlpha(0);
      } else {
        r.tag.setText('OWNED');
        r.tag.setColor('#8de6ff');
        r.costText.setText('');
        r.costText.setAlpha(0);
      }
    });
  }

  /**
   * Update progress state.
   *
   * @param {Object} progress
   */
  setProgress(progress) {
    this.progress = cloneProgress(progress);
    this._refresh();
  }

  /**
   * Finish the selection.
   *
   * @param {string} classKey
   * @private
   */
  _complete(classKey) {
    this._cleanup();

    if (this.onPick) {
      this.onPick(classKey);
    }
  }

  /**
   * Clean up the picker.
   *
   * @private
   */
  _cleanup() {
    if (this.keyboardHandler) {
      this.scene.input.keyboard.off('keydown', this.keyboardHandler);
      this.keyboardHandler = null;
    }

    if (this.overlay) {
      this.overlay.destroy();
      this.overlay = null;
    }

    this.rows = [];
    this.isOpen = false;
  }

  /**
   * Check if picker is visible.
   *
   * @returns {boolean}
   */
  isVisible() {
    return this.isOpen;
  }

  /**
   * Force close the picker.
   */
  close() {
    if (this.isOpen) {
      this._complete(this.defaultClass);
    }
  }
}

/**
 * Backward-compatible helper.
 *
 * @param {Phaser.Scene} scene
 * @param {Function} onPick
 * @param {Object} options
 * @returns {ClassPicker}
 */
function openClassPickerKeyboard(scene, onPick, options = {}) {
  return new ClassPicker(scene, onPick, options);
}

if (typeof window !== 'undefined') {
  window.ClassPicker = ClassPicker;
  window.openClassPickerKeyboard = openClassPickerKeyboard;
}

export { ClassPicker, openClassPickerKeyboard };
export default ClassPicker;
