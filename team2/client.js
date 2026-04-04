require('dotenv').config();
const axios = require('axios');

const client = axios.create({
  baseURL: process.env.BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

client.interceptors.response.use(
  res => res,
  err => {
    if (err.response) return err.response;
    const reason = err.code || err.message || 'unknown';
    throw new Error(`Network error (${reason}): could not reach ${err.config?.baseURL}${err.config?.url}`);
  }
);

module.exports = client;