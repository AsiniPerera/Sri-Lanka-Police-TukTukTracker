/**
 * Dev launcher: start an in-memory MongoDB, seed it, then boot the API.
 *
 * This is the "dev launcher" referenced by the MONGO_URI comment in .env. It
 * exists so the stack can be demonstrated on a machine with no MongoDB
 * installed — the normal case for an Asgardeo/SPA demo, where the interesting
 * part is the OIDC flow rather than the database.
 *
 *   npm run dev:memory          # seed, then serve
 *   npm run dev:memory -- --no-seed
 *
 * Data lives only as long as the process. Point MONGO_URI at a real server or
 * an Atlas cluster for anything that needs to persist.
 */

/* eslint-disable no-console */
require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');
const { MongoMemoryServer } = require('mongodb-memory-server');

/**
 * src/seed/seed.js is a standalone script: it seeds, closes the connection and
 * calls process.exit(0). So it cannot be required in-process without killing
 * this launcher — it runs as a child instead, connecting to the in-memory
 * server over its real TCP port.
 */
const runSeed = (uri) =>
  new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [path.join(__dirname, '..', 'src', 'seed', 'seed.js')],
      { stdio: 'inherit', env: { ...process.env, MONGO_URI: uri } }
    );
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`seed exited with code ${code}`))
    );
  });

const start = async () => {
  console.log('[dev] starting in-memory MongoDB…');
  const mongo = await MongoMemoryServer.create({
    instance: { dbName: 'tuktuk_tracker' },
  });
  const uri = mongo.getUri('tuktuk_tracker');

  const shutdown = async (signal) => {
    console.log(`\n[dev] ${signal} — stopping in-memory MongoDB`);
    try {
      await mongo.stop();
    } catch (_) {
      /* already gone */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // connectDB() reads process.env.MONGO_URI, so overriding it here is what
  // redirects the API away from the (absent) local mongod. Must happen before
  // server.js is required.
  process.env.MONGO_URI = uri;
  console.log(`[dev] MONGO_URI -> ${uri}`);

  if (!process.argv.includes('--no-seed')) {
    console.log('[dev] seeding reference data and officer accounts…');
    await runSeed(uri);
  }

  console.log('[dev] booting API…');
  require('../server');
};

start().catch((err) => {
  console.error('[dev] launcher failed:', err);
  process.exit(1);
});
