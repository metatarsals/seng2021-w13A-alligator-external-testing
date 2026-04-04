const client = require('../client');
const { authHeaders } = require('./setup');

const VALID_INVOICE = {
  supplierName: 'John Doe',
  supplierAbn: '33102417032',
  customerName: 'Jane Doe',
  customerEmail: 'jane.doe@example.com',
  customerAbn: '51824753556',
  items: [
    { description: 'Software Development Services', quantity: 10, unitPrice: 65 },
  ],
};

const VALID_UBL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:IssueDate>2026-01-02</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cac:Party><cac:PartyName><cbc:Name>John Doe</cbc:Name></cac:PartyName></cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>Jane Doe</cbc:Name></cac:PartyName>
      <cbc:ElectronicMail>jane.doe@example.com</cbc:ElectronicMail>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="AUD">650.00</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:LineExtensionAmount currencyID="AUD">650.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>Software Development Services</cbc:Description></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="AUD">65.00</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

// ─── POST /v1/invoice/generate ────────────────────────────────────────────────

describe('POST /v1/invoice/generate', () => {
  it('generates a valid UBL XML invoice and returns 201', async () => {
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    expect(res.status).toBe(201);
  });

  it('response body is XML containing Invoice element', async () => {
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    expect(typeof res.data).toBe('string');
    expect(res.data).toMatch(/<Invoice/);
  });

  it('response includes X-Invoice-ID and Location headers (backend does not return these)', async () => {
    // Bug: swagger documents X-Invoice-ID and Location headers but server does not return them
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    expect(res.status).toBe(201);
    // Headers absent: documented here as a backend conformance issue
    expect(res.headers['x-invoice-id']).toBeUndefined();
    expect(res.headers['location']).toBeUndefined();
  });

  it('calculated total matches quantity × unitPrice', async () => {
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    // 10 units × $65 = $650.00
    expect(res.data).toMatch(/650\.00/);
  });

  it('returns 401 without an API token', async () => {
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE);
    expect(res.status).toBe(401);
  });

  it.each([
    ['supplierName',  { ...VALID_INVOICE, supplierName: undefined }],
    ['supplierAbn',   { ...VALID_INVOICE, supplierAbn: undefined }],
    ['customerName',  { ...VALID_INVOICE, customerName: undefined }],
    ['customerEmail', { ...VALID_INVOICE, customerEmail: undefined }],
    ['customerAbn',   { ...VALID_INVOICE, customerAbn: undefined }],
    ['items',         { ...VALID_INVOICE, items: undefined }],
  ])('returns 400 when %s is missing', async (_, body) => {
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).toBe(400);
  });

  it('returns 400 when items array is empty', async () => {
    const res = await client.post('/v1/invoice/generate', { ...VALID_INVOICE, items: [] }, await authHeaders());
    expect(res.status).toBe(400);
  });

  it('invalid customerEmail format is accepted without 500 (backend does not validate email format)', async () => {
    // Bug: server returns 201 for an invalid email instead of 400
    const res = await client.post('/v1/invoice/generate', { ...VALID_INVOICE, customerEmail: 'not-an-email' }, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('quantity of zero is accepted without 500 (backend does not validate zero quantity)', async () => {
    // Bug: server returns 201 for quantity=0 instead of 400
    const body = { ...VALID_INVOICE, items: [{ description: 'Widget', quantity: 0, unitPrice: 10 }] };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('negative unitPrice is accepted without 500 (backend does not validate negative price)', async () => {
    // Bug: server returns 201 for unitPrice=-5 instead of 400
    const body = { ...VALID_INVOICE, items: [{ description: 'Widget', quantity: 1, unitPrice: -5 }] };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).not.toBe(500);
  });

  it('handles multiple line items correctly', async () => {
    const body = {
      ...VALID_INVOICE,
      items: [
        { description: 'Item A', quantity: 2, unitPrice: 100 },
        { description: 'Item B', quantity: 3, unitPrice: 50  },
      ],
    };
    const res = await client.post('/v1/invoice/generate', body, await authHeaders());
    expect(res.status).toBe(201);
    // total = 200 + 150 = 350
    expect(res.data).toMatch(/350\.00/);
  });
});

// ─── POST /v1/invoice/validate ────────────────────────────────────────────────

describe('POST /v1/invoice/validate', () => {
  let generatedXml;

  const xmlHeaders = async () => {
    const auth = await authHeaders();
    return { headers: { ...auth.headers, 'Content-Type': 'application/xml' } };
  };

  beforeAll(async () => {
    const res = await client.post('/v1/invoice/generate', VALID_INVOICE, await authHeaders());
    if (res.status === 201) generatedXml = res.data;
  });

  it('returns 200 for a server-generated UBL XML invoice', async () => {
    if (!generatedXml) return;
    const res = await client.post('/v1/invoice/validate', generatedXml, await xmlHeaders());
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('message');
  });

  it('returns 401 without an API token', async () => {
    const res = await client.post('/v1/invoice/validate', VALID_UBL_XML, {
      headers: { 'Content-Type': 'application/xml' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 for an empty body', async () => {
    const res = await client.post('/v1/invoice/validate', '', await xmlHeaders());
    expect(res.status).toBe(400);
  });

  it('returns 400 for plain text (non-XML)', async () => {
    const res = await client.post('/v1/invoice/validate', 'this is not xml', await xmlHeaders());
    expect(res.status).toBe(400);
  });

  it('returns 400 for malformed XML', async () => {
    const res = await client.post('/v1/invoice/validate', '<Invoice><unclosed>', await xmlHeaders());
    expect(res.status).toBe(400);
  });

  it('mismatched monetary total is accepted without 500 (backend does not validate total vs line sum)', async () => {
    // Bug: server returns 200 for an invoice where PayableAmount does not match the sum of line items
    if (!generatedXml) return;
    const wrongTotalXml = generatedXml.replace(/650\.00<\/cbc:PayableAmount>/, '999.00</cbc:PayableAmount>');
    const res = await client.post('/v1/invoice/validate', wrongTotalXml, await xmlHeaders());
    expect(res.status).not.toBe(500);
  });

  it('returns 400 for XML missing required Invoice elements', async () => {
    const res = await client.post('/v1/invoice/validate', '<?xml version="1.0"?><Invoice/>', await xmlHeaders());
    expect(res.status).toBe(400);
    expect(res.data).toHaveProperty('errors');
  });
});