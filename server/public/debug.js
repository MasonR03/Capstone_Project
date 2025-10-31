// Debug Tools Module
const DebugTools = (() => {
  // Private state
  let debugPanelVisible = false;
  let positionUpdateInterval = null;
  let gameInstance = null;
  let getPlayerCallback = null;

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
  function init(game, getPlayer) {
    // Store references
    gameInstance = game;
    getPlayerCallback = getPlayer;

    // Only show debug tools if running locally
    if (!isRunningLocally()) return;

    const debugButton = document.getElementById('debug-button');
    const debugPanel = document.getElementById('debug-panel');

    // Show the debug button
    debugButton.style.display = 'block';

    // Toggle debug panel on button click
    debugButton.addEventListener('click', () => {
      debugPanelVisible = !debugPanelVisible;
      debugPanel.style.display = debugPanelVisible ? 'block' : 'none';

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