const client = require('../client');

describe('GET / — root', () => {
  it('returns 200', async () => {
    const res = await client.get('/');
    expect(res.status).toBe(200);
  });
});

describe('GET /health — health check', () => {
  it('returns 200', async () => {
    const res = await client.get('/health');
    expect(res.status).toBe(200);
  });
});