/**
 * StatsTools - Player stats panel component
 *
 * Displays persisted player stats from the database.
 * Togglable via a button in the UI.
 */

class StatsTools {
  constructor() {
    this.visible = false;
    this.updateInterval = null;
    this.game = null;

    // DOM element references
    this.statsButton = null;
    this.statsPanel = null;
    this.elements = {};
  }

  /**
   * Initialize stats tools.
   * @param {Phaser.Game} game - The Phaser game instance.
   */
  init(game) {
    this.game = game;

    this.statsButton = document.getElementById('stats-button');
    this.statsPanel = document.getElementById('stats-panel');

    if (!this.statsButton || !this.statsPanel) {
      console.warn('StatsTools: Required DOM elements not found');
      return;
    }

    this.elements = {
      username: document.getElementById('stats-username'),
      email: document.getElementById('stats-email'),
      xp: document.getElementById('stats-xp'),
      stars: document.getElementById('stats-stars'),
      games: document.getElementById('stats-games'),
      lastSeen: document.getElementById('stats-last-seen'),
      created: document.getElementById('stats-created'),
      updated: document.getElementById('stats-updated'),
      status: document.getElementById('stats-status')
    };

    this.statsButton.style.display = 'block';

    const savedState = localStorage.getItem('statsPanelVisible');
    if (savedState === 'true') {
      this.show();
    }

    this._setupEventListeners();
  }

  _setupEventListeners() {
    this.statsButton.addEventListener('click', () => this.toggle());

    this.statsButton.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement === this.statsButton) {
        e.preventDefault();
        this.statsButton.blur();
      }
    });
  }

  toggle() {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }

  show() {
    this.visible = true;
    this.statsPanel.style.display = 'block';
    localStorage.setItem('statsPanelVisible', 'true');
    void this._update();
    this._startUpdates();
  }

  hide() {
    this.visible = false;
    this.statsPanel.style.display = 'none';
    localStorage.setItem('statsPanelVisible', 'false');
    this._stopUpdates();
  }

  _startUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }

    this.updateInterval = setInterval(() => {
      void this._update();
    }, 3000);
  }

  _stopUpdates() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  async _update() {
    const el = this.elements;
    el.status.textContent = 'loading...';

    try {
      const res = await fetch('/api/stats', { method: 'GET' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      el.username.textContent = data.username || '-';
      el.email.textContent = data.email || '-';
      el.xp.textContent = `${data.xp ?? 0}/${data.maxXp ?? 0}`;
      el.stars.textContent = `${data.starsCollected ?? 0}`;
      el.games.textContent = `${data.gamesPlayed ?? 0}`;
      el.lastSeen.textContent = this._fmtDate(data.lastSeenAt);
      el.created.textContent = this._fmtDate(data.createdAt);
      el.updated.textContent = this._fmtDate(data.updatedAt);
      el.status.textContent = 'ok';
    } catch (err) {
      el.status.textContent = String(err?.message || 'fetch failed');
    }
  }

  _fmtDate(value) {
    if (!value) return '-';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }

  destroy() {
    this._stopUpdates();
    this.game = null;
  }
}

const statsTools = new StatsTools();

if (typeof window !== 'undefined') {
  window.StatsTools = {
    init: (game) => statsTools.init(game)
  };
  window.statsToolsInstance = statsTools;
}

export { StatsTools };
export default statsTools;
