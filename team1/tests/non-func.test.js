const client = require('../client');
const FormData = require('form-data');

const MINIMAL_ORDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2">
  <ID>ORDER-001</ID>
  <IssueDate>2024-01-01</IssueDate>
  <BuyerCustomerParty>
    <Party><PartyName><n>Test Buyer</n></PartyName></Party>
  </BuyerCustomerParty>
  <SellerSupplierParty>
    <Party><PartyName><n>Test Seller</n></PartyName></Party>
  </SellerSupplierParty>
  <OrderLine>
    <LineItem>
      <ID>1</ID>
      <Quantity unitCode="EA">5</Quantity>
      <Item><n>Widget</n></Item>
    </LineItem>
  </OrderLine>
</Order>`;

function buildForm(overrides = {}) {
  const opts = {
    includeFile: true,
    includeSupplier: true,
    includeCustomer: true,
    includeLogistics: true,
    logisticsMetadata: '{"carrier":"FastShip","eta":"2024-02-01"}',
    xml: MINIMAL_ORDER_XML,
    ...overrides,
  };
  const form = new FormData();
  if (opts.includeFile) {
    form.append('orderXmlFile', Buffer.from(opts.xml), { filename: 'order.xml', contentType: 'application/xml' });
  }
  if (opts.includeSupplier) form.append('DespatchSupplierParty', opts.DespatchSupplierParty ?? 'Supplier Co.');
  if (opts.includeCustomer)  form.append('DeliveryCustomerParty', opts.DeliveryCustomerParty ?? 'Customer Co.');
  if (opts.includeLogistics) form.append('logisticsMetadata', opts.logisticsMetadata);
  return form;
}

async function safeGet(url) {
  try {
    return await client.get(url);
  } catch (e) {
    if (/ECONNRESET|Network error/i.test(e.message)) return { status: 'ECONNRESET' };
    throw e;
  }
}

// Performance

describe('Performance', () => {
  it.each([
    ['GET /health responds within 1000ms',                   () => client.get('/health'),                                1000],
    ['GET /v1/orders responds within 2000ms',                () => client.get('/v1/orders'),                             2000],
    ['GET /v1/transformations/all responds within 3000ms',   () => client.get('/v1/transformations/all'),                3000],
    ['GET /v1/transformations/all?limit=100 within 5000ms',  () => client.get('/v1/transformations/all?page=1&limit=100'), 5000],
  ])('%s', async (_, req, limit) => {
    const start = Date.now();
    const res = await req();
    expect([200, 422]).toContain(res.status);
    expect(Date.now() - start).toBeLessThan(limit);
  });

  it('handles 10 concurrent GET /health requests without errors', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => client.get('/health')));
    results.forEach(res => expect(res.status).toBe(200));
  });

  it('handles 5 concurrent GET /v1/transformations/all requests without errors', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => client.get('/v1/transformations/all')));
    results.forEach(res => expect(res.status).toBe(200));
  });
});

// Security

describe('Security', () => {
  it('SQL injection in status param is blocked or sanitised', async () => {
    const res = await safeGet("/v1/transformations/all?status=' OR '1'='1");
    // ECONNRESET means the WAF dropped the connection — also acceptable
    expect(res.status === 'ECONNRESET' || res.status !== 500).toBe(true);
  });

  it('SQL injection in id path returns 4xx or is blocked', async () => {
    const res = await safeGet("/v1/transformations/' OR '1'='1");
    expect(res.status === 'ECONNRESET' || [400, 404, 422].includes(res.status)).toBe(true);
  });

  it('NoSQL injection in id path returns 4xx', async () => {
    const res = await client.get('/v1/transformations/%7B%24gt%3A%22%22%7D');
    expect([400, 404, 422]).toContain(res.status);
  });

  it('XSS in form string fields does not cause 500', async () => {
    const form = buildForm({ DespatchSupplierParty: '<script>alert(1)</script>' });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).not.toBe(500);
  });

  it('XXE payload in XML does not expose server files', async () => {
    const xxeXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE Order [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2">
  <ID>&xxe;</ID><IssueDate>2024-01-01</IssueDate>
</Order>`;
    const form = buildForm({ xml: xxeXml });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).not.toBe(500);
    const body = JSON.stringify(res.data ?? '');
    expect(body).not.toMatch(/root:|\/bin\/bash/);
  });

  it('2MB XML payload is rejected gracefully', async () => {
    const bigXml = `<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2">
  <ID>ORDER-BIG</ID><IssueDate>2024-01-01</IssueDate>
  <Item><n>${'A'.repeat(2 * 1024 * 1024)}</n></Item>
</Order>`;
    const res = await client.post('/v1/transformations', buildForm({ xml: bigXml }), { headers: buildForm({ xml: bigXml }).getHeaders() });
    expect([400, 413, 422]).toContain(res.status);
  });

  it('error responses do not leak stack traces or server paths', async () => {
    const r1 = await client.get('/v1/transformations/nonexistent-id-00000');
    const r2 = await client.post('/v1/transformations', buildForm({ includeFile: false }), { headers: buildForm({ includeFile: false }).getHeaders() });
    for (const res of [r1, r2]) {
      expect(JSON.stringify(res.data ?? '')).not.toMatch(/Traceback|at Object\.|\/home\/|\/var\//);
    }
  });

  it('unsupported HTTP methods return 404 or 405', async () => {
    const r1 = await client.patch('/v1/transformations/some-id');
    const r2 = await client.delete('/v1/transformations/all');
    expect([404, 405]).toContain(r1.status);
    expect([404, 405]).toContain(r2.status);
  });
});

// Edge Cases

describe('Edge Cases', () => {
  it.each([
    ['page=0',  '/v1/transformations/all?page=0'],
    ['page=-1', '/v1/transformations/all?page=-1'],
    ['limit=0', '/v1/transformations/all?limit=0'],
  ])('GET /v1/transformations/all — %s is handled without 500', async (_, url) => {
    const res = await client.get(url);
    expect([200, 400, 422]).toContain(res.status);
  });

  it.each([
    ['page=1.5',  '/v1/transformations/all?page=1.5'],
    ['limit=1.5', '/v1/transformations/all?limit=1.5'],
  ])('GET /v1/transformations/all — %s (float) is rejected', async (_, url) => {
    const res = await client.get(url);
    expect(res.status).toBe(422);
  });

  it.each([
    ['invalid JSON',  'not-valid-json'],
    ['empty string',  ''],
  ])('logisticsMetadata (%s) is rejected', async (_, metadata) => {
    const form = buildForm({ logisticsMetadata: metadata });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect([400, 422]).toContain(res.status);
  });

  it('logisticsMetadata as a JSON array does not cause 500', async () => {
    const form = buildForm({ logisticsMetadata: '[1,2,3]' });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).not.toBe(500);
  });

  it.each([
    ['plain text',    'this is not xml at all'],
    ['empty string',  ''],
    ['unclosed tags', '<Order><ID>1</ID>'],
  ])('malformed XML (%s) returns 400 or 422', async (_, xml) => {
    const form = buildForm({ xml });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect([400, 422]).toContain(res.status);
  });

  it.each([
    ['unicode',     '供应商公司 GmbH & Cie.'],
    ['null bytes',  'Supplier\x00Co'],
    ['XSS string',  '<script>alert(1)</script>'],
  ])('supplier name with %s does not cause 500', async (_, name) => {
    const form = buildForm({ DespatchSupplierParty: name });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).not.toBe(500);
  });

  it.each([
    ['URL-encoded spaces', '/v1/transformations/some%20id%20with%20spaces'],
    ['500-char ID',        `/v1/transformations/${'a'.repeat(500)}`],
  ])('GET /v1/transformations/{id} — %s is handled gracefully', async (_, url) => {
    const res = await client.get(url);
    expect([400, 404, 422]).toContain(res.status);
  });

  it('unrecognised and special-character status values do not cause 500', async () => {
    const r1 = await client.get('/v1/transformations/all?status=completelyunknownstatus');
    const r2 = await client.get('/v1/transformations/all?status=done%3Cscript%3E');
    expect([200, 422]).toContain(r1.status);
    expect(r2.status).not.toBe(500);
  });

  it('sending JSON body instead of multipart returns 4xx', async () => {
    const res = await client.post('/v1/transformations', {
      orderXmlFile: '<Order/>', DespatchSupplierParty: 'Supplier Co.',
      DeliveryCustomerParty: 'Customer Co.', logisticsMetadata: '{}',
    });
    expect([400, 415, 422]).toContain(res.status);
  });
});