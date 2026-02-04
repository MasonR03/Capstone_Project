const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

function runCommandQuiet(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      shell: process.platform === 'win32',
      ...options
    });
    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', () => resolve(1));
  });
}

async function detectDockerCompose(cwd) {
  const dockerComposeCode = await runCommandQuiet('docker', ['compose', 'version'], { cwd });
  if (dockerComposeCode === 0) {
    return { cmd: 'docker', prefixArgs: ['compose'] };
  }

  const legacyCode = await runCommandQuiet('docker-compose', ['version'], { cwd });
  if (legacyCode === 0) {
    return { cmd: 'docker-compose', prefixArgs: [] };
  }

  return null;
}

function parseTcpTargetFromDatabaseUrl(databaseUrl) {
  try {
    const u = new URL(databaseUrl);
    const port = u.port ? Number(u.port) : 5432;
    if (!u.hostname || !Number.isFinite(port)) return null;
    return { host: u.hostname, port };
  } catch (err) {
    return null;
  }
}

function isLocalHostname(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

async function waitForTcp(host, port, timeoutMs) {
  const startedAt = Date.now();

  return await new Promise((resolve) => {
    const tryOnce = () => {
      const sock = net.createConnection({ host, port });

      const cleanup = () => {
        try {
          sock.destroy();
        } catch (err) {}
      };

      sock.setTimeout(1000);

      sock.on('connect', () => {
        cleanup();
        resolve(true);
      });

      sock.on('timeout', () => {
        cleanup();
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tryOnce, 400);
      });

      sock.on('error', () => {
        cleanup();
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(tryOnce, 400);
      });
    };

    tryOnce();
  });
}

function ensureDatabaseUrlFromParts() {
  if (process.env.DATABASE_URL) return;

  const password = process.env.POSTGRES_PASSWORD;
  if (!password) return;

  const user = process.env.POSTGRES_USER || 'postgres';
  const database = process.env.POSTGRES_DB || 'orbitfall';
  const host = process.env.DB_HOST || 'localhost';
  const schema = process.env.DB_SCHEMA || 'public';

  const rawPort = Number.parseInt(process.env.DB_PORT || '', 10);
  const port = Number.isFinite(rawPort) ? rawPort : 5432;

  try {
    const url = new URL(`postgresql://${host}:${port}/${database}`);
    url.username = user;
    url.password = password;
    url.searchParams.set('schema', schema);
    process.env.DATABASE_URL = url.toString();
  } catch (err) {
    // Best-effort only.
  }
}

async function bootstrapDatabase(projectRoot) {
  if (process.env.SKIP_DB_BOOTSTRAP === '1') {
    return;
  }

  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    return;
  }

  const schemaPath = path.join(projectRoot, 'prisma', 'schema.prisma');
  if (!fileExists(schemaPath)) {
    return;
  }

  const composeFile = path.join(projectRoot, 'docker-compose.yml');
  const composeAvailable = fileExists(composeFile);

  const DEFAULT_DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/orbitfall?schema=public';

  const compose = composeAvailable ? await detectDockerCompose(projectRoot) : null;
  const canUseCompose = !!compose;

  let startedLocalDb = false;

  // If DATABASE_URL isn't set, try to start the local Postgres container and
  // set a sensible default connection string.
  if (!process.env.DATABASE_URL && canUseCompose) {
    console.log('[bootstrap] DATABASE_URL not set; starting local Postgres via Docker Compose...');

    const upCode = await runCommand(compose.cmd, [...compose.prefixArgs, 'up', '-d', 'db'], {
      cwd: projectRoot
    });

    if (upCode !== 0) {
      console.warn('[bootstrap] Failed to start Postgres via Docker Compose; starting without DB persistence.');
      return;
    }

    process.env.DATABASE_URL = DEFAULT_DATABASE_URL;
    startedLocalDb = true;
  }

  if (!process.env.DATABASE_URL) {
    return;
  }

  const target = parseTcpTargetFromDatabaseUrl(process.env.DATABASE_URL);
  if (!target) {
    console.warn('[bootstrap] DATABASE_URL is not a valid URL; starting server without DB persistence.');
    return;
  }

  // Prisma CLI is a devDependency; don't try to download it at runtime.
  const prismaCmd = path.join(
    projectRoot,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'prisma.cmd' : 'prisma'
  );

  // If Prisma isn't installed locally, skip schema sync.
  const prismaVersionCode = await runCommandQuiet(
    prismaCmd,
    ['--version'],
    { cwd: projectRoot, env: process.env }
  );
  if (prismaVersionCode !== 0) {
    console.warn('[bootstrap] Prisma CLI not installed; skipping DB schema sync.');
    return;
  }

  // Generate Prisma client (doesn't require DB).
  await runCommand(prismaCmd, ['generate'], {
    cwd: projectRoot,
    env: process.env
  });

  // Only auto-push schema when the target is local (or explicitly allowed).
  const allowRemotePush = process.env.ALLOW_REMOTE_DB_PUSH === '1';
  const shouldPushSchema = isLocalHostname(target.host) || startedLocalDb || allowRemotePush;

  if (shouldPushSchema) {
    let dbReady = await waitForTcp(target.host, target.port, 800);

    if (!dbReady && !startedLocalDb && canUseCompose && isLocalHostname(target.host)) {
      console.log('[bootstrap] Local DB not reachable; starting Postgres via Docker Compose...');
      const upCode = await runCommand(compose.cmd, [...compose.prefixArgs, 'up', '-d', 'db'], {
        cwd: projectRoot
      });
      if (upCode === 0) {
        startedLocalDb = true;
      } else {
        console.warn('[bootstrap] Failed to start Postgres via Docker Compose; skipping prisma db push.');
      }
    }

    if (!dbReady && startedLocalDb) {
      dbReady = await waitForTcp(target.host, target.port, 20000);
    }

    if (!dbReady) {
      console.warn('[bootstrap] Database not reachable; skipping prisma db push.');
      return;
    }

    const pushCode = await runCommand(prismaCmd, ['db', 'push'], { cwd: projectRoot, env: process.env });
    if (pushCode !== 0) {
      console.warn('[bootstrap] Prisma db push failed; starting server anyway.');
    }
  } else {
    console.log('[bootstrap] Skipping prisma db push (non-local DATABASE_URL).');
  }
}

async function main() {
  const projectRoot = path.join(__dirname, '..');

  // Load environment variables from .env if present
  try {
    require('dotenv').config({ path: path.join(projectRoot, '.env') });
  } catch (err) {
    // ignore
  }

  ensureDatabaseUrlFromParts();
  await bootstrapDatabase(projectRoot);

  // Start the actual game server
  // eslint-disable-next-line global-require
  require(path.join(projectRoot, 'server', 'index.js'));
}

void main();
