/**
 * Jest global setup — runs ONCE before all test suites in a worker.
 * Pre-warms the MongoMemoryServer binary download so individual
 * test suite beforeAll hooks never time out waiting for the binary.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async () => {
  // Starting and immediately stopping a server forces the binary to be
  // downloaded and cached. Subsequent MongoMemoryServer.create() calls
  // in test suites will start in milliseconds.
  const mongod = await MongoMemoryServer.create();
  await mongod.stop({ doCleanup: true });
};
