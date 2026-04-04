const client = require('../client');

const TEST_EMAIL = `testuser+${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

let apiToken = null;

async function getApiToken() {
  if (apiToken) return apiToken;

  await client.post('/v1/auth/signup', { email: TEST_EMAIL, password: TEST_PASSWORD });

  const loginRes = await client.post('/v1/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD });
  if (loginRes.status !== 200) throw new Error(`Login failed: ${loginRes.status}`);

  const cookie = loginRes.headers['set-cookie']?.[0];
  if (!cookie) throw new Error('No session cookie returned from login');

  const tokenRes = await client.post(
    '/v1/api-key',
    { name: 'test-token' },
    { headers: { Cookie: cookie } }
  );
  if (tokenRes.status !== 201) throw new Error(`Token creation failed: ${tokenRes.status}`);

  apiToken = tokenRes.data.token;
  return apiToken;
}

async function authHeaders() {
  const token = await getApiToken();
  return { headers: { Authorization: `Bearer ${token}` } };
}

module.exports = { getApiToken, authHeaders, TEST_EMAIL, TEST_PASSWORD };