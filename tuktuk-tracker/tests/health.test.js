/**
 * Integration tests for GET /health
 */
const request = require('supertest');
const { connectTestDB, closeTestDB } = require('./setup');

let app;

beforeAll(async () => {
  await connectTestDB();
  app = require('../server');
}, 120000);
afterAll(async () => {
  await closeTestDB();
});

describe('GET /health', () => {
  it('returns 200 with status OK', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('OK');
    expect(res.body.service).toBe('tuktuk-tracker-api');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime_seconds');
  });
});

describe('Unknown routes', () => {
  it('returns 404 for unregistered paths', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
  });
});
