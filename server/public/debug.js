/**
 * Debug Tools - Backward compatibility wrapper
 *
 * This file provides backward compatibility by loading the ES6 DebugTools class
 * and exposing it in the original IIFE format.
 */

// Load the new DebugTools class
// For non-module environments, the class is loaded via separate script tag
// and exposed on window.DebugTools

// If the new class isn't loaded yet, define a compatible interface
if (typeof window.DebugTools === 'undefined') {
  // Private state (matches original IIFE)
  let debugPanelVisible = false;
  let positionUpdateInterval = null;
  let gameInstance = null;
  let getPlayerCallback = null;
  let debugGridGraphics = null;

  // Check if running locally
  function isRunningLocally() {
    const hostname = window.location.hostname;
    return hostname === 'localhost' ||
           hostname === '127.0.0.1' ||
           hostname === '' ||
           hostname.startsWith('192.168.') ||
           hostname.startsWith('10.') ||
           hostname.startsWith('172.');
  }

  // Initialize debug tools
  function init(game, getPlayer, gridGraphics) {
    gameInstance = game;
    getPlayerCallback = getPlayer;
    debugGridGraphics = gridGraphics;

    const debugButton = document.getElementById('debug-button');
    const debugPanel = document.getElementById('debug-panel');

    if (!debugButton || !debugPanel) {
      console.warn('DebugTools: Required DOM elements not found');
      return;
    }

    debugButton.style.display = 'block';

    const savedDebugState = localStorage.getItem('debugPanelVisible');
    if (savedDebugState === 'true') {
      debugPanelVisible = true;
      debugPanel.style.display = 'block';
      if (debugGridGraphics) debugGridGraphics.setVisible(true);
      startPositionUpdates();
    }

    debugButton.addEventListener('click', () => {
      debugPanelVisible = !debugPanelVisible;
      debugPanel.style.display = debugPanelVisible ? 'block' : 'none';
      localStorage.setItem('debugPanelVisible', debugPanelVisible.toString());

      if (debugGridGraphics) debugGridGraphics.setVisible(debugPanelVisible);

      if (debugPanelVisible) {
        startPositionUpdates();
      } else {
        stopPositionUpdates();
      }
    });

    debugButton.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
    });

    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement === debugButton) {
        e.preventDefault();
        debugButton.blur();
      }
    });
  }

  function startPositionUpdates() {
    if (positionUpdateInterval) clearInterval(positionUpdateInterval);
    positionUpdateInterval = setInterval(() => updatePlayerPosition(), 50);
  }

  function stopPositionUpdates() {
    if (positionUpdateInterval) {
      clearInterval(positionUpdateInterval);
      positionUpdateInterval = null;
    }
  }

  function updatePlayerPosition() {
    const posXElement = document.getElementById('pos-x');
    const posYElement = document.getElementById('pos-y');
    const camXElement = document.getElementById('cam-x');
    const camYElement = document.getElementById('cam-y');
    const velocityElement = document.getElementById('velocity');
    const pingElement = document.getElementById('ping');
    const playerCountElement = document.getElementById('player-count');
    const playerNamesSection = document.getElementById('player-names-section');
    const playerNamesList = document.getElementById('player-names-list');

    const scene = gameInstance?.scene?.scenes?.[0];

    if (scene && scene.cameras && scene.cameras.main) {
      const camera = scene.cameras.main;
      camXElement.textContent = Math.round(camera.scrollX);
      camYElement.textContent = Math.round(camera.scrollY);
    } else {
      camXElement.textContent = '-';
      camYElement.textContent = '-';
    }

    const playerInfo = getPlayerCallback ? getPlayerCallback() : null;

    if (playerInfo && playerInfo.allPlayers) {
      const allPlayers = playerInfo.allPlayers;
      const playerCount = Object.keys(allPlayers).length;
      playerCountElement.textContent = playerCount;

      if (playerInfo.playerNames && playerCount > 0) {
        const playerNames = playerInfo.playerNames;
        const namesList = Object.entries(playerNames)
          .map(([id, name]) => `• ${name}`)
          .join('<br>');

        if (namesList) {
          playerNamesList.innerHTML = namesList;
          playerNamesSection.style.display = 'block';
        } else {
          playerNamesSection.style.display = 'none';
        }
      } else {
        playerNamesSection.style.display = 'none';
      }
    } else {
      playerCountElement.textContent = '0';
      playerNamesSection.style.display = 'none';
    }

    if (playerInfo && playerInfo.player) {
      const player = playerInfo.player;

      if (player.predicted) {
        posXElement.textContent = Math.round(player.predicted.x);
        posYElement.textContent = Math.round(player.predicted.y);
        const velX = player.predicted.vx || 0;
        const velY = player.predicted.vy || 0;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        velocityElement.textContent = speed;
      } else if (player.body) {
        posXElement.textContent = Math.round(player.x);
        posYElement.textContent = Math.round(player.y);
        const velX = player.body.velocity.x;
        const velY = player.body.velocity.y;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        velocityElement.textContent = speed;
      } else if (player.velocityX !== undefined || player.velocityY !== undefined) {
        posXElement.textContent = Math.round(player.x);
        posYElement.textContent = Math.round(player.y);
        const velX = player.velocityX || 0;
        const velY = player.velocityY || 0;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        velocityElement.textContent = speed;
      } else {
        posXElement.textContent = Math.round(player.x);
        posYElement.textContent = Math.round(player.y);
        velocityElement.textContent = '0';
      }
    } else {
      posXElement.textContent = '-';
      posYElement.textContent = '-';
      velocityElement.textContent = '-';
    }

    if (window.getCurrentPing) {
      pingElement.textContent = window.getCurrentPing();
    } else {
      pingElement.textContent = '-';
    }
  }

  window.DebugTools = { init, isRunningLocally };
}
