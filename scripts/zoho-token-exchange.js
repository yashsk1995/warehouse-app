#!/usr/bin/env node
// Exchange a Zoho self-client code for a refresh token.
// Usage: node scripts/zoho-token-exchange.js <CODE>
// Reads ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_ACCOUNTS_BASE from .env

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const code = process.argv[2];
if (!code) {
  console.error('Usage: node scripts/zoho-token-exchange.js <CODE>');
  process.exit(1);
}

const envPath = path.resolve(__dirname, '..', '.env');
const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const accountsBase = env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com';

(async () => {
  try {
    const res = await axios.post(`${accountsBase}/oauth/v2/token`, null, {
      params: {
        code,
        client_id: env.ZOHO_CLIENT_ID,
        client_secret: env.ZOHO_CLIENT_SECRET,
        grant_type: 'authorization_code',
      },
    });
    console.log('SUCCESS — Zoho returned:');
    console.log(JSON.stringify(res.data, null, 2));
    if (res.data.refresh_token) {
      console.log('\nUpdate ZOHO_REFRESH_TOKEN in your .env to:');
      console.log(res.data.refresh_token);
    } else {
      console.log(
        '\n⚠️  No refresh_token returned. The code may already have been used. Generate a fresh code.',
      );
    }
  } catch (e) {
    console.error('FAILED:', e.response?.status, JSON.stringify(e.response?.data));
    process.exit(1);
  }
})();
