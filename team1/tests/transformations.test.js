const client = require('../client');
const FormData = require('form-data');

let createdId;

// POST /v1/transformations

const MINIMAL_ORDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Order xmlns="urn:oasis:names:specification:ubl:schema:xsd:Order-2">
  <ID>ORDER-001</ID>
  <IssueDate>2024-01-01</IssueDate>
  <BuyerCustomerParty>
    <Party><PartyName><Name>Test Buyer</Name></PartyName></Party>
  </BuyerCustomerParty>
  <SellerSupplierParty>
    <Party><PartyName><Name>Test Seller</Name></PartyName></Party>
  </SellerSupplierParty>
  <OrderLine>
    <LineItem>
      <ID>1</ID>
      <Quantity unitCode="EA">5</Quantity>
      <Item><Name>Widget</Name></Item>
    </LineItem>
  </OrderLine>
</Order>`;

function buildForm({
  includeFile      = true,
  includeSupplier  = true,
  includeCustomer  = true,
  includeLogistics = true,
} = {}) {
  const form = new FormData();
  if (includeFile) {
    form.append('orderXmlFile', Buffer.from(MINIMAL_ORDER_XML), {
      filename: 'order.xml',
      contentType: 'application/xml',
    });
  }
  if (includeSupplier)  form.append('DespatchSupplierParty', 'Supplier Co.');
  if (includeCustomer)  form.append('DeliveryCustomerParty', 'Customer Co.');
  if (includeLogistics) form.append('logisticsMetadata', '{"carrier":"FastShip","eta":"2024-02-01"}');
  return form;
}

describe('POST /v1/transformations — transform order to despatch advice', () => {
  it('transforms a valid order XML and returns 201', async () => {
    const form = buildForm();
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).toBe(201);
    if (res.data && res.data.id) createdId = res.data.id;
  });

  it('returns 422 when orderXmlFile is missing', async () => {
    const form = buildForm({ includeFile: false });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).toBe(422);
    expect(res.data).toHaveProperty('detail');
  });

  it('returns 422 when DespatchSupplierParty is missing', async () => {
    const form = buildForm({ includeSupplier: false });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).toBe(422);
  });

  it('returns 422 when DeliveryCustomerParty is missing', async () => {
    const form = buildForm({ includeCustomer: false });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).toBe(422);
  });

  it('returns 422 when logisticsMetadata is missing', async () => {
    const form = buildForm({ includeLogistics: false });
    const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
    expect(res.status).toBe(422);
  });
});

// GET /v1/transformations/all

describe('GET /v1/transformations/all — list all', () => {
  it('returns 200 with default pagination', async () => {
    const res = await client.get('/v1/transformations/all');
    expect(res.status).toBe(200);
  });

  it('returns 200 with explicit page and limit', async () => {
    const res = await client.get('/v1/transformations/all?page=1&limit=5');
    expect(res.status).toBe(200);
  });

  it('returns 200 when filtered by status', async () => {
    const res = await client.get('/v1/transformations/all?status=completed');
    expect(res.status).toBe(200);
  });

  it('returns 200 when status is null/empty', async () => {
    const res = await client.get('/v1/transformations/all?status=');
    expect(res.status).toBe(200);
  });

  it('returns 422 for non-integer page value', async () => {
    const res = await client.get('/v1/transformations/all?page=abc');
    expect(res.status).toBe(422);
  });

  it('returns 422 for non-integer limit value', async () => {
    const res = await client.get('/v1/transformations/all?limit=abc');
    expect(res.status).toBe(422);
  });
});

// GET /v1/transformations/{id} 

describe('GET /v1/transformations/{id} — get by id', () => {
  it('returns 200 for a known id', async () => {
    if (!createdId) return;
    const res = await client.get(`/v1/transformations/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.data).toHaveProperty('id', createdId);
  });

  it('returns 404 for a non-existent id', async () => {
    const res = await client.get('/v1/transformations/nonexistent-id-00000');
    expect(res.status).toBe(404);
  });
});

// PUT /v1/transformations/{id}/update

describe('PUT /v1/transformations/{id}/update — update', () => {
  it('updates an existing transformation and returns 200', async () => {
    if (!createdId) return;
    const form = buildForm();
    const res = await client.put(`/v1/transformations/${createdId}/update`, form, { headers: form.getHeaders() });
    expect(res.status).toBe(200);
  });

  it('returns 404 for a non-existent id', async () => {
    const form = buildForm();
    const res = await client.put('/v1/transformations/nonexistent-id-00000/update', form, { headers: form.getHeaders() });
    expect(res.status).toBe(404);
  });

  it('returns 422 for missing required fields on update', async () => {
    if (!createdId) return;
    const form = buildForm({ includeFile: false });
    const res = await client.put(`/v1/transformations/${createdId}/update`, form, { headers: form.getHeaders() });
    expect(res.status).toBe(422);
  });
});

// DELETE /v1/transformations/{id}/delete

describe('DELETE /v1/transformations/{id}/delete — delete', () => {
  it('deletes an existing transformation and returns 200 or 204', async () => {
    if (!createdId) return;
    const res = await client.delete(`/v1/transformations/${createdId}/delete`);
    expect([200, 204]).toContain(res.status);
  });

  it('returns 404 when deleting a non-existent id', async () => {
    const res = await client.delete('/v1/transformations/nonexistent-id-00000/delete');
    expect(res.status).toBe(404);
  });

  it('returns 404 when deleting the same id twice', async () => {
    if (!createdId) return;
    const res = await client.delete(`/v1/transformations/${createdId}/delete`);
    expect(res.status).toBe(404);
  });
});