const client = require('../client');

// GET /v1/orders

describe('GET /v1/orders — list orders', () => {
  it('returns 200', async () => {
    const res = await client.get('/v1/orders');
    expect(res.status).toBe(200);
  });

  it('returns an object with an orders array', async () => {
    const res = await client.get('/v1/orders');
    expect(res.data).toHaveProperty('orders');
    expect(Array.isArray(res.data.orders)).toBe(true);
  });
});

// POST /v1/orders

describe('POST /v1/orders — create order (stub)', () => {
  it('returns 200 with a not-implemented message', async () => {
    const res = await client.post('/v1/orders', {});
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('message');
    expect(res.data.message).toMatch(/to be implemented/i);
  });
});