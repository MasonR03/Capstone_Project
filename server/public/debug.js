// Debug Tools Module
const DebugTools = (() => {
  // Private state
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
    // Store references
    gameInstance = game;
    getPlayerCallback = getPlayer;
    debugGridGraphics = gridGraphics;

    // Show debug tools on all clients (removed local restriction)
    const debugButton = document.getElementById('debug-button');
    const debugPanel = document.getElementById('debug-panel');

    // Show the debug button
    debugButton.style.display = 'block';

    // Check localStorage for saved debug panel state
    const savedDebugState = localStorage.getItem('debugPanelVisible');
    if (savedDebugState === 'true') {
      debugPanelVisible = true;
      debugPanel.style.display = 'block';

      // Enable gridlines if they were visible
      if (debugGridGraphics) {
        debugGridGraphics.setVisible(true);
      }

      startPositionUpdates();
    }

    // Toggle debug panel on button click
    debugButton.addEventListener('click', () => {
      debugPanelVisible = !debugPanelVisible;
      debugPanel.style.display = debugPanelVisible ? 'block' : 'none';

      // Save state to localStorage
      localStorage.setItem('debugPanelVisible', debugPanelVisible.toString());

      // Toggle gridlines visibility
      if (debugGridGraphics) {
        debugGridGraphics.setVisible(debugPanelVisible);
      }

      if (debugPanelVisible) {
        startPositionUpdates();
      } else {
        stopPositionUpdates();
      }
    });

    // Prevent spacebar from triggering the button
    debugButton.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
      }
    });

    // Also prevent spacebar at document level from focusing the button
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && document.activeElement === debugButton) {
        e.preventDefault();
        debugButton.blur();
      }
    });
  }

  // Start position update timer
  function startPositionUpdates() {
    // Clear any existing interval
    if (positionUpdateInterval) {
      clearInterval(positionUpdateInterval);
    }

    // Update position at 20Hz (50ms intervals)
    positionUpdateInterval = setInterval(() => {
      updatePlayerPosition();
    }, 50); // 1000ms / 20Hz = 50ms
  }

  // Stop position update timer
  function stopPositionUpdates() {
    if (positionUpdateInterval) {
      clearInterval(positionUpdateInterval);
      positionUpdateInterval = null;
    }
  }

  // Update player position display
  function updatePlayerPosition() {
    const posXElement = document.getElementById('pos-x');
    const posYElement = document.getElementById('pos-y');
    const camXElement = document.getElementById('cam-x');
    const camYElement = document.getElementById('cam-y');
    const velocityElement = document.getElementById('velocity');
    const playerCountElement = document.getElementById('player-count');
    const playerNamesSection = document.getElementById('player-names-section');
    const playerNamesList = document.getElementById('player-names-list');

    // Get the active scene
    const scene = gameInstance?.scene?.scenes?.[0];

    // Update camera position if scene exists
    if (scene && scene.cameras && scene.cameras.main) {
      const camera = scene.cameras.main;
      camXElement.textContent = Math.round(camera.scrollX);
      camYElement.textContent = Math.round(camera.scrollY);
    } else {
      camXElement.textContent = '-';
      camYElement.textContent = '-';
    }

    // Get player from callback
    const playerInfo = getPlayerCallback ? getPlayerCallback() : null;

    // Update player count and names
    if (playerInfo && playerInfo.allPlayers) {
      const allPlayers = playerInfo.allPlayers;
      const playerCount = Object.keys(allPlayers).length;
      playerCountElement.textContent = playerCount;

      // Display player names if available
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
      posXElement.textContent = Math.round(player.x);
      posYElement.textContent = Math.round(player.y);

      // Calculate velocity if player has body
      if (player.body) {
        const velX = player.body.velocity.x;
        const velY = player.body.velocity.y;
        const speed = Math.round(Math.sqrt(velX * velX + velY * velY));
        velocityElement.textContent = speed;
      } else {
        velocityElement.textContent = '0';
      }
    } else {
      posXElement.textContent = '-';
      posYElement.textContent = '-';
      velocityElement.textContent = '-';
    }
  }

  // Public API
  return {
    init,
    isRunningLocally
  };
})();