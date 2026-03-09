const { Router } = require('express');
const bcrypt = require('bcrypt');
const { getPrismaClient } = require('../persistence/prisma');

const router = Router();
const SALT_ROUNDS = 10;
const USERNAME_RE = /^[a-zA-Z0-9_-]{1,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function looksLikeEmail(str) {
  return str.includes('@');
}

router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email, and password are required.' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 1-20 characters (letters, numbers, _ -).' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (!/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one letter.' });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one number.' });
  }
  if (!/[^a-zA-Z0-9]/.test(password)) {
    return res.status(400).json({ error: 'Password must contain at least one special character.' });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    // Dev fallback (no DB)
    if (process.env.NODE_ENV !== 'production') {
      const input = String(username).trim().toLowerCase();
      const devUser = (process.env.DEV_USER_USERNAME || 'test').toLowerCase();
      const devPass = process.env.DEV_USER_PASSWORD || 'Password123!';

      if (input === devUser && password === devPass) {
        req.session.username = devUser;
        return res.json({ username: devUser });
      }

      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    return res.status(503).json({ error: 'Database unavailable.' });
  }


  const normalizedEmail = email.toLowerCase().trim();
  const normalizedUsername = username.toLowerCase();

  try {
    // Check for existing username
    const existingByName = await prisma.playerProfile.findUnique({
      where: { username: normalizedUsername },
    });

    if (existingByName && existingByName.passwordHash) {
      return res.status(409).json({ error: 'Username already taken.' });
    }

    // Check for existing email
    const existingByEmail = await prisma.playerProfile.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      return res.status(409).json({ error: 'Email already in use.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    if (existingByName) {
      // Existing passwordless profile — claim it by setting a password + email
      await prisma.playerProfile.update({
        where: { id: existingByName.id },
        data: { passwordHash, email: normalizedEmail },
      });
    } else {
      const cuid = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      await prisma.playerProfile.create({
        data: {
          id: cuid,
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
        },
      });
    }

    req.session.username = normalizedUsername;
    res.json({ username: normalizedUsername });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username/email and password are required.' });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    // Dev fallback (no DB)
    if (process.env.NODE_ENV !== 'production') {
      const input = String(username).trim().toLowerCase();
      const devUser = (process.env.DEV_USER_USERNAME || 'test').toLowerCase();
      const devPass = process.env.DEV_USER_PASSWORD || 'Password123!';

      // Allow "test" login without DB
      if (input === devUser && password === devPass) {
        req.session.username = devUser;
        return res.json({ username: devUser });
      }

      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    return res.status(503).json({ error: 'Database unavailable.' });
  }


  try {
    const input = username.trim().toLowerCase();
    let profile;

    if (looksLikeEmail(input)) {
      profile = await prisma.playerProfile.findUnique({
        where: { email: input },
      });
    } else {
      profile = await prisma.playerProfile.findUnique({
        where: { username: input },
      });
    }

    if (!profile || !profile.passwordHash) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    const match = await bcrypt.compare(password, profile.passwordHash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid username/email or password.' });
    }

    req.session.username = profile.username;
    res.json({ username: profile.username });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Failed to log out.' });
    }
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  if (req.session && req.session.username) {
    return res.json({ username: req.session.username });
  }
  res.status(401).json({ error: 'Not logged in.' });
});

router.get('/stats', async (req, res) => {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: 'Not logged in.' });
  }

  const prisma = getPrismaClient();
  if (!prisma) {
    return res.status(503).json({ error: 'Database unavailable.' });
  }

  try {
    const username = String(req.session.username).toLowerCase().trim();
    const profile = await prisma.playerProfile.findUnique({
      where: { username },
      select: {
        username: true,
        email: true,
        xp: true,
        maxXp: true,
        starsCollected: true,
        gamesPlayed: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found.' });
    }

    return res.json(profile);
  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
