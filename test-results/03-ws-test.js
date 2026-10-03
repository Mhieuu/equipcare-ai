// Test Socket.IO connection
const { io } = require('socket.io-client');

const API = 'http://localhost:3001';

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginName: 'demo.manager1', password: 'Demo@2026' }),
  });
  const j = await res.json();
  return j.accessToken;
}

async function main() {
  const token = await login();
  console.log('[WS] Got token, connecting to /ws with auth...');

  const socket = io(`${API}/ws`, {
    path: '/ws',
    auth: { token },
    transports: ['polling'],
    reconnection: false,
    timeout: 10000,
  });

  let connected = false;
  socket.on('connect', () => {
    connected = true;
    console.log('[WS] CONNECTED, id=' + socket.id);
  });
  socket.on('disconnect', (reason) => {
    console.log('[WS] DISCONNECTED: ' + reason);
  });
  socket.on('connect_error', (err) => {
    console.log('[WS] CONNECT ERROR: ' + err.message);
    process.exit(1);
  });

  // Listen for events
  socket.on('notification.created', (data) => {
    console.log('[WS] notification.created:', JSON.stringify(data).substring(0, 200));
  });
  socket.on('work_order.assigned', (data) => {
    console.log('[WS] work_order.assigned:', JSON.stringify(data).substring(0, 200));
  });
  socket.onAny((event, ...args) => {
    console.log('[WS] event=' + event + ' args=' + JSON.stringify(args).substring(0, 200));
  });

  // Wait for connect
  await new Promise(r => setTimeout(r, 2000));
  if (!connected) {
    console.log('[WS] Failed to connect after 2s');
    process.exit(1);
  }

  // Trigger an event: create a new incident via API
  console.log('[WS] Triggering event by creating incident...');
  const reporterLogin = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginName: 'demo.reporter1', password: 'Demo@2026' }),
  });
  const repToken = (await reporterLogin.json()).accessToken;

  const ast = await fetch(`${API}/assets?limit=1`, {
    headers: { Authorization: `Bearer ${repToken}` },
  });
  const astJson = await ast.json();
  const assetId = astJson.items[0].id;

  const newInc = await fetch(`${API}/incidents`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${repToken}`,
    },
    body: JSON.stringify({
      assetId,
      description: 'WS TEST: motor kêu to',
      impactDescription: 'Test WS event trigger',
    }),
  });
  console.log('[WS] Created incident: ' + newInc.status);

  // Wait for events
  await new Promise(r => setTimeout(r, 3000));
  console.log('[WS] Done');
  socket.disconnect();
  process.exit(0);
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
