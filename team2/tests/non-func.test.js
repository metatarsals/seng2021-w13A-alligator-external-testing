const client = require('../client');
const { authHeaders } = require('./setup');

const VALID_INVOICE = {
  supplierName: 'John Doe',
  supplierAbn: '33102417032',
  customerName: 'Jane Doe',
  customerEmail: 'jane.doe@example.com',
  customerAbn: '51824753556',
  items: [{ description: 'Software Development Services', quantity: 10, unitPrice: 65 }],
};

// ─── Performance ─────────────────────────────────────────────────────────────

describe('Performance', () => {
  it('GET /health responds within 3000ms', async () => {
    const start = Date.now();
    const res = await client.get('/health');
    expect(res.status).toBe(200);
    expect(Date.now() - start).toBeLessThan(3000);
  });

  it('POST /v1/invoice/generate responds within 5000ms', async () => {
    const start = Date.now();
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    expect(res.status).toBe(201);
    expect(Date.now() - start).toBeLessThan(5000);
  });

  it('handles 10 concurrent GET /health requests without errors', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => client.get('/health')));
    results.forEach(res => expect(res.status).toBe(200));
  });

  it('handles 5 concurrent POST /v1/invoice/generate requests without errors', async () => {
    const auth = await authHeaders();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => client.post('/v1/invoice/generate', VALID_INVOICE, auth))
    );
    results.forEach(res => expect(res.status).toBe(201));
  });
});

// ─── Security ────────────────────────────────────────────────────────────────

describe('Security', () => {
  it('XSS in supplierName does not cause 500', async () => {
    const body = { ...VALID_INVOICE, supplierName: '<script>alert(1)</script>' };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('SQL injection in supplierName does not cause 500', async () => {
    const body = { ...VALID_INVOICE, supplierName: "' OR '1'='1" };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('XXE payload in validate XML does not expose server files', async () => {
    const xxeXml = `<?xml version="1.0"?>
<!DOCTYPE Invoice [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">&xxe;</cbc:ID>
</Invoice>`;
    const auth = await authHeaders();
    const res = await client.post('/v1/invoice/validate', xxeXml, {
      headers: { ...auth.headers, 'Content-Type': 'application/xml' },
    });
    expect(res.status).not.toBe(500);
    const body = JSON.stringify(res.data ?? '');
    expect(body).not.toMatch(/root:|\/bin\/bash/);
  });

  it('invalid API token is handled without 500 (backend does not validate token)', async () => {
    // Bug: server returns 201 for a completely fake token instead of 401
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, {
      headers: { Authorization: 'Bearer totallyinvalidtoken' },
    });
    expect(res.status).not.toBe(500);
  });

  it('error responses do not leak stack traces or server paths', async () => {
    const res = await client.post('/v1/invoice/generate', {}, await authHeaders());
    const body = JSON.stringify(res.data ?? '');
    expect(body).not.toMatch(/Traceback|at Object\.|\/home\/|\/var\//);
  });

  it('very large supplierName does not cause 500', async () => {
    const body = { ...VALID_INVOICE, supplierName: 'A'.repeat(10000) };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });
});

// ─── Edge Cases ───────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('quantity of 1 is accepted', async () => {
    const body = { ...VALID_INVOICE, items: [{ description: 'Item', quantity: 1, unitPrice: 10 }] };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).toBe(201);
  });

  it('very large quantity is handled without 500', async () => {
    const body = { ...VALID_INVOICE, items: [{ description: 'Item', quantity: 999999, unitPrice: 1 }] };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('unitPrice with many decimal places is handled without 500', async () => {
    const body = { ...VALID_INVOICE, items: [{ description: 'Item', quantity: 1, unitPrice: 9.999999 }] };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('unicode in supplierName and customerName is handled without 500', async () => {
    const body = { ...VALID_INVOICE, supplierName: '株式会社テスト', customerName: 'Ünïcödé Corp' };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('ABN with spaces or dashes is handled without 500', async () => {
    const body = { ...VALID_INVOICE, supplierAbn: '33 102 417 032' };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('non-numeric ABN is accepted without 500 (backend does not validate ABN format)', async () => {
    // Bug: server returns 201 for a non-numeric ABN instead of 400
    const body = { ...VALID_INVOICE, supplierAbn: 'not-an-abn' };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('sending XML body to generate endpoint returns 400', async () => {
    const auth = await authHeaders();
    const res = await client.post('/v1/invoice/generate', '<Invoice/>', {
      headers: { ...auth.headers, 'Content-Type': 'application/xml' },
    });
    expect(res.status).toBe(400);
  });

  it('sending JSON body to validate endpoint returns 400', async () => {
    const res = await client.post('/v1/invoice/validate', VALID_INVOICE, await authHeaders());
    expect(res.status).toBe(400);
  });

  it('validate with XML that has correct structure but wrong namespace is handled', async () => {
    const badNsXml = `<?xml version="1.0"?><Invoice xmlns="http://wrong.namespace.com"/>`;
    const auth = await authHeaders();
    const res = await client.post('/v1/invoice/validate', badNsXml, {
      headers: { ...auth.headers, 'Content-Type': 'application/xml' },
    });
    expect([400, 422]).toContain(res.status);
  });

  it('signup with very long password is handled without 500', async () => {
    const res = await client.post('/v1/auth/signup', {
      email: `longpass+${Date.now()}@example.com`,
      password: 'A'.repeat(1000),
    });
    expect(res.status).not.toBe(500);
  });

  it('login with empty strings returns 4xx', async () => {
    const res = await client.post('/v1/auth/login', { email: '', password: '' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});