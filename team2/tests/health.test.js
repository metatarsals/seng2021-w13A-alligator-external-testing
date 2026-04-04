const client = require('../client');

describe('GET /health — health check', () => {
  it('returns 200', async () => {
    const res = await client.get('/health');
    expect(res.status).toBe(200);
  });

  it('response body has status, uptime, and timestamp fields', async () => {
    const res = await client.get('/health');
    expect(res.data).toHaveProperty('status');
    expect(res.data).toHaveProperty('uptime');
    expect(res.data).toHaveProperty('timestamp');
  });

  it('status field is a non-empty string', async () => {
    const res = await client.get('/health');
    expect(typeof res.data.status).toBe('string');
    expect(res.data.status.length).toBeGreaterThan(0);
  });
});