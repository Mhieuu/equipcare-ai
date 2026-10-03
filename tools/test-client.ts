/**
 * Smoke test for generated TypeScript client.
 * Run:  npx tsx tools/test-client.ts
 */
import { ApiClient } from './api-client.js';

async function main() {
  const client = new ApiClient({ baseUrl: 'http://localhost:3001' });

  // Login
  const auth = await client.post_auth_login({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' } as any);
  console.log('Logged in, token length:', (auth as any).accessToken?.length);

  const authed = new ApiClient({ baseUrl: 'http://localhost:3001', token: (auth as any).accessToken });

  // List incidents
  const incs = await authed.get_incidents({ limit: 3 } as any);
  console.log('Incidents:', (incs as any).items?.length, 'total:', (incs as any).total);

  // List work orders
  const wos = await authed.get_work_orders({ limit: 3 } as any);
  console.log('WOs:', (wos as any).items?.length);

  // Dashboard
  const kpi = await authed.get_dashboard_kpis(undefined);
  console.log('KPIs:', Object.keys((kpi as any) || {}).join(','));
}

main().catch((e) => { console.error('FAIL:', e); process.exit(1); });