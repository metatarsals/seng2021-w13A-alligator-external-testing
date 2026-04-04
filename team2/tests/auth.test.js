const client = require('../client');

const UNIQUE_EMAIL = `testauth+${Date.now()}@example.com`;
const UNIQUE_PASSWORD = 'ValidPass123!';

// ─── POST /v1/auth/signup ─────────────────────────────────────────────────────

describe('POST /v1/auth/signup', () => {
  it('creates a new user and returns 201 with a userId', async () => {
    const res = await client.post('/v1/auth/signup', { email: UNIQUE_EMAIL, password: 'ValidPass123!' });
    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty('userId');
  });

  it('returns 4xx when email is missing', async () => {
    const res = await client.post('/v1/auth/signup', { password: 'ValidPass123!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 4xx when password is missing', async () => {
    const res = await client.post('/v1/auth/signup', { email: 'nopass@example.com' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 4xx when email format is invalid', async () => {
    const res = await client.post('/v1/auth/signup', { email: 'not-an-email', password: 'ValidPass123!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 4xx when registering the same email twice', async () => {
    const res = await client.post('/v1/auth/signup', { email: UNIQUE_EMAIL, password: 'ValidPass123!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ─── POST /v1/auth/login ──────────────────────────────────────────────────────

describe('POST /v1/auth/login', () => {
  it('logs in with valid credentials and returns 200 with a session cookie', async () => {
    const res = await client.post('/v1/auth/login', { email: UNIQUE_EMAIL, password: UNIQUE_PASSWORD });
    expect(res.status).toBe(200);
    const cookie = res.headers['set-cookie'];
    expect(cookie).toBeDefined();
    expect(cookie[0]).toMatch(/token=/);
  });

  it('returns 4xx for wrong password', async () => {
    const res = await client.post('/v1/auth/login', { email: UNIQUE_EMAIL, password: 'wrongpassword' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 4xx for non-existent email', async () => {
    const res = await client.post('/v1/auth/login', { email: 'nobody@example.com', password: 'ValidPass123!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('returns 4xx when body is empty', async () => {
    const res = await client.post('/v1/auth/login', {});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});

// ─── POST /v1/api-key ─────────────────────────────────────────────────────────

describe('POST /v1/api-key', () => {
  let sessionCookie;

  beforeAll(async () => {
    const email = `apikey+${Date.now()}@example.com`;
    await client.post('/v1/auth/signup', { email, password: 'ValidPass123!' });
    const loginRes = await client.post('/v1/auth/login', { email, password: 'ValidPass123!' });
    sessionCookie = loginRes.headers['set-cookie']?.[0];
  });

  it('creates a token and returns 201 with a token string', async () => {
    const res = await client.post('/v1/api-key', { name: 'my-token' }, { headers: { Cookie: sessionCookie } });
    expect(res.status).toBe(201);
    expect(res.data).toHaveProperty('token');
    expect(typeof res.data.token).toBe('string');
    expect(res.data.token.length).toBeGreaterThan(0);
  });

  it('returns 401 without a session cookie', async () => {
    const res = await client.post('/v1/api-key', { name: 'no-auth-token' });
    expect(res.status).toBe(401);
  });

  it('returns 4xx when name is missing', async () => {
    const res = await client.post('/v1/api-key', {}, { headers: { Cookie: sessionCookie } });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});