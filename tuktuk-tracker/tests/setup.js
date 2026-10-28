/**
 * Global test setup – starts an in-memory MongoDB server so tests never touch
 * a real database. The app module is loaded AFTER the Mongoose URI has been
 * injected into process.env so connectDB() picks it up automatically.
 */
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

/**
 * Start the in-memory server and connect Mongoose before all tests in a suite.
 */
const connectTestDB = async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'test-secret-key-for-jest';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.JWT_DEVICE_EXPIRES_IN = '365d';
  process.env.NODE_ENV = 'test';
  await mongoose.connect(uri);
};

/**
 * Drop all collections between tests so each test starts with a clean slate.
 */
const clearTestDB = async () => {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((col) => col.deleteMany({})));
};

/**
 * Disconnect and stop the in-memory server after all tests in a suite.
 */
const closeTestDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    try {
      await mongoose.connection.dropDatabase();
    } catch (_) { /* ignore if db not reachable */ }
    await mongoose.connection.close();
  }
  if (mongod) await mongod.stop();
};

module.exports = { connectTestDB, clearTestDB, closeTestDB };
