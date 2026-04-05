/**
 * Toolbar - StarCraft-style top toolbar (DOM-based)
 *
 * Replaces the Phaser-based HUD. Manages HP/XP bars and
 * provides the container for Logout, Stats, Debug buttons.
 */

class Toolbar {
  constructor() {
    this.toolbar = document.getElementById('top-toolbar');
    this.hudBars = document.getElementById('hud-bars');
    this.hpFill = document.getElementById('toolbar-hp-fill');
    this.hpText = document.getElementById('toolbar-hp-text');
    this.xpFill = document.getElementById('toolbar-xp-fill');
    this.xpText = document.getElementById('toolbar-xp-text');
  }

  show() {
    if (this.toolbar) this.toolbar.classList.add('visible');
    if (this.hudBars) this.hudBars.classList.add('visible');
  }

  hide() {
    if (this.toolbar) this.toolbar.classList.remove('visible');
    if (this.hudBars) this.hudBars.classList.remove('visible');
  }

  updateHpXp({ hp = 0, maxHp = 0, xp = 0, maxXp = 0 } = {}) {
    const FILL_MAX = 74; // px — matches Bar.png fill area width

    if (this.hpFill) {
      const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      this.hpFill.style.width = `${Math.round(FILL_MAX * ratio)}px`;
    }
    if (this.hpText) {
      this.hpText.textContent = `${Math.max(0, Math.floor(hp))}/${maxHp}`;
    }

    if (this.xpFill) {
      const ratio = maxXp > 0 ? Math.max(0, Math.min(1, xp / maxXp)) : 0;
      this.xpFill.style.width = `${Math.round(FILL_MAX * ratio)}px`;
    }
    if (this.xpText) {
      this.xpText.textContent = `${Math.max(0, Math.floor(xp))}/${maxXp}`;
    }
  }

  tick() {}

  destroy() {
    this.hide();
  }
}

if (typeof window !== 'undefined') {
  window.Toolbar = Toolbar;
}

export default Toolbar;
