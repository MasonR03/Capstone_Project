// ~~~ Auth Screen Handler ~~~
// Manages login/signup overlay and communicates with /api auth endpoints.

let playerName = null;

document.addEventListener('DOMContentLoaded', async function () {
  const loginOverlay = document.getElementById('login-overlay');
  const authError = document.getElementById('auth-error');
  const tabs = document.querySelectorAll('.auth-tab');
  const panels = document.querySelectorAll('.auth-panel');

  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');

  // --- Tab switching ---
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + target).classList.add('active');
      authError.textContent = '';
    });
  });

  function showError(msg) {
    authError.textContent = msg;
  }

  const logoutButton = document.getElementById('logout-button');

  function enterGame(username) {
    playerName = username;
    window.playerName = username;
    window.loginComplete = true;
    loginOverlay.classList.add('hidden');
    document.getElementById('top-toolbar').classList.add('visible');
    const hudBars = document.getElementById('hud-bars');
    if (hudBars) hudBars.classList.add('visible');
    console.log('👤 Player logged in as:', username);
  }

  // --- Logout ---
  logoutButton.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (err) {
      // best-effort
    }
    window.location.reload();
  });

  // --- Check existing session on load ---
  try {
    const res = await fetch('/api/me');
    if (res.ok) {
      const data = await res.json();
      if (data.username) {
        enterGame(data.username);
        return;
      }
    }
  } catch (err) {
    // No session or server down — show login form
  }

  // --- Password visibility toggles ---
  const eyeOpen = '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const eyeShut = '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  document.querySelectorAll('.pw-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.innerHTML = isHidden ? eyeShut : eyeOpen;
      btn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });
  });

  // --- Live password requirements checker ---
  const pwInput = document.getElementById('signup-password');
  const reqItems = document.querySelectorAll('#pw-requirements li');

  const rules = {
    length:  (pw) => pw.length >= 8,
    letter:  (pw) => /[a-zA-Z]/.test(pw),
    number:  (pw) => /[0-9]/.test(pw),
    special: (pw) => /[^a-zA-Z0-9]/.test(pw),
  };

  pwInput.addEventListener('input', () => {
    const pw = pwInput.value;
    reqItems.forEach((li) => {
      const check = rules[li.dataset.rule];
      li.classList.toggle('met', check ? check(pw) : false);
    });
  });

  // Focus first visible input
  document.getElementById('login-username').focus();

  // --- Login form ---
  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    authError.textContent = '';

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
      showError('Please fill in all fields.');
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Login failed.');
        return;
      }
      enterGame(data.username);
    } catch (err) {
      showError('Could not reach server.');
    }
  });

  // --- Signup form ---
  signupForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    authError.textContent = '';

    const username = document.getElementById('signup-username').value.trim();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    if (!username || !email || !password || !confirm) {
      showError('Please fill in all fields.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      showError('Password must be at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
      showError('Password needs at least 1 letter, 1 number, and 1 special character.');
      return;
    }

    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || 'Signup failed.');
        return;
      }
      enterGame(data.username);
    } catch (err) {
      showError('Could not reach server.');
    }
  });
});
