require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');

const client = axios.create({
  baseURL: process.env.DOLPHINS_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});
client.interceptors.response.use(res => res, err => err.response);

const MINIMAL_XML = `<?xml version="1.0" encoding="UTF-8"?>
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

async function run() {
  console.log('\n======= POST /v1/transformations (fixed logisticsMetadata) =======');
  const form = new FormData();
  form.append('orderXmlFile', Buffer.from(MINIMAL_XML), { filename: 'order.xml', contentType: 'application/xml' });
  form.append('DespatchSupplierParty', 'Supplier Co.');
  form.append('DeliveryCustomerParty', 'Customer Co.');
  form.append('logisticsMetadata', '{"carrier":"FastShip","eta":"2024-02-01"}');

  const res = await client.post('/v1/transformations', form, { headers: form.getHeaders() });
  console.log('status:', res.status);
  console.log('data:', JSON.stringify(res.data, null, 2).slice(0, 1000));
}

run().catch(console.error);