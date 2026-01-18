// ~~~ Login Screen Handler ~~~
// This script manages the login overlay and passes player name to the game

let playerName = null;  // Global variable to store the logged-in player name

document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('login-form');
  const loginOverlay = document.getElementById('login-overlay');
  const playerNameInput = document.getElementById('player-name');

  // Handle form submission
  loginForm.addEventListener('submit', function(e) {
    e.preventDefault();

    const name = playerNameInput.value.trim();

    // Validate name is not empty
    if (!name || name.length === 0) {
      alert('Please enter a valid name');
      return;
    }

    // Store the player name globally
    playerName = name;
    
    console.log('👤 Player logged in as:', playerName);

    // Hide the login overlay
    loginOverlay.classList.add('hidden');

    // Notify that login is complete (for clientGame.js to pick up)
    window.loginComplete = true;
  });

  // Allow pressing Enter to submit
  playerNameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      loginForm.dispatchEvent(new Event('submit'));
    }
  });

  // Focus the input field on load
  playerNameInput.focus();
});
