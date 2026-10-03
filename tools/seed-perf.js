/**
 * Seed 1000+ records to test pagination performance.
 *
 * Creates 1000 incidents + 500 work orders + 200 parts
 * via the API directly.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:3001';
const PWD = 'ChangeMe@2026';

async function http(method, url, body, headers) {
  const opts = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(BASE + url, opts);
  if (!resp.ok && resp.status !== 409) {
    const text = await resp.text();
    throw new Error(`${method} ${url} -> ${resp.status}: ${text}`);
  }
  return resp.json();
}

async function main() {
  // Login as admin
  const login = await http('POST', '/auth/login', { loginName: 'admin.bootstrap', password: PWD });
  const h = { Authorization: `Bearer ${login.accessToken}` };

  // Get an asset
  const assets = await http('GET', '/assets?limit=1', null, h);
  const assetId = assets.items[0].id;
  console.log(`Asset: ${assetId}`);

  // Seed 1000 incidents
  console.log('Seeding 1000 incidents...');
  const created = [];
  const errors = [];
  for (let i = 0; i < 1000; i++) {
    try {
      const inc = await http('POST', '/incidents', {
        assetId,
        description: `Perf test incident #${i + 1}`,
        impactDescription: `Impact ${i + 1}`,
      }, h);
      created.push(inc.id);
      if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/1000`);
    } catch (e) {
      errors.push(e.message);
    }
  }
  console.log(`Created ${created.length} incidents (${errors.length} errors)`);

  // Verify count
  const finalCount = await http('GET', '/incidents?limit=1', null, h);
  console.log(`Total incidents in DB: ${finalCount.total}`);
}

main().catch((e) => { console.error(e); process.exit(1); });