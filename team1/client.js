const axios = require('axios');

const dolphinsClient = axios.create({
  baseURL: process.env.DOLPHINS_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

dolphinsClient.interceptors.response.use(
  res => res,
  err => {
    if (err.response) {
      return err.response;
    }
    const reason = err.code || err.message || 'unknown';
    throw new Error(`Network error (${reason}): could not reach ${err.config?.baseURL}${err.config?.url}`);
  }
);

module.exports = dolphinsClient;