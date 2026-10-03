/**
 * E2E UI tests using Puppeteer + system Chrome.
 *
 * Runs against http://localhost:3000 (web) and assumes API at :3001.
 * Uses system Chrome at C:\Program Files\Google\Chrome\Application\chrome.exe
 *
 * Usage:  node tools/e2e.mjs
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const puppeteerPath = path.resolve('tools', 'pw', 'node_modules', 'puppeteer-core', 'lib', 'esm', 'puppeteer', 'puppeteer-core.js');
const { default: puppeteer } = await import(pathToFileURL(puppeteerPath).href);

const WEB = 'http://localhost:3000';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const REPORT = 'e2e-report.json';
const PAGE_TIMEOUT = 60000;
const NAV_TIMEOUT = 30000;
const RENDER_WAIT = 4000;

const results = [];
let browser;

async function login(page, username, password) {
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  page.setDefaultTimeout(NAV_TIMEOUT);
  await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input', { timeout: PAGE_TIMEOUT });
  const inputs = await page.$$('input');
  if (inputs.length < 2) throw new Error('login form missing inputs');
  await inputs[0].click({ clickCount: 3 });
  await inputs[0].type(username);
  await inputs[1].click({ clickCount: 3 });
  await inputs[1].type(password);
  const buttons = await page.$$('button');
  for (const btn of buttons) {
    const text = await page.evaluate((el) => el.textContent, btn);
    if (text && /login|đăng nhập|sign in/i.test(text)) {
      await btn.click();
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}

async function navigateAndWait(page, url) {
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded' });
  if (!resp) throw new Error('no response');
  await new Promise((r) => setTimeout(r, RENDER_WAIT));
  return resp;
}

async function runTest(id, desc, fn) {
  const page = await browser.newPage();
  try {
    const detail = await fn(page);
    results.push({ id, desc, status: 'PASS', detail });
    process.stdout.write(`PASS  ${id}  ${desc}\n`);
  } catch (err) {
    results.push({ id, desc, status: 'FAIL', detail: err.message });
    process.stdout.write(`FAIL  ${id}  ${desc}  ${err.message}\n`);
  } finally {
    await page.close();
  }
}

async function getText(page) {
  return await page.evaluate(() => document.body.innerText);
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error(`Chrome not found at ${CHROME}`);
    process.exit(1);
  }

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  // ===== SMOKE: All routes =====
  const routes = [
    '/login', '/dashboard', '/incidents', '/work-orders', '/assets',
    '/approvals', '/inventory/parts', '/maintenance/plans', '/notifications',
    '/reports', '/iam/users', '/iam/audit-logs',
  ];
  for (const r of routes) {
    await runTest(`SM-${r.replace(/\//g, '-')}`, `Route ${r} returns 200`, async (page) => {
      page.setDefaultNavigationTimeout(NAV_TIMEOUT);
      const resp = await page.goto(`${WEB}${r}`, { waitUntil: 'domcontentloaded' });
      const status = resp.status();
      if (![200, 307, 302, 308].includes(status)) {
        throw new Error(`status ${status}`);
      }
      return `status=${status}`;
    });
  }

  // ===== LOGIN =====
  await runTest('UI-LOGIN-01', 'Login page renders Vietnamese form', async (page) => {
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    await page.goto(`${WEB}/login`, { waitUntil: 'domcontentloaded' });
    await new Promise((r) => setTimeout(r, 2000));
    const text = await getText(page);
    if (!/đăng nhập|login/i.test(text)) throw new Error('no login text');
    return 'ok';
  });

  await runTest('UI-LOGIN-02', 'Invalid login stays on /login', async (page) => {
    await login(page, 'admin.bootstrap', 'WrongPassword');
    if (!page.url().includes('/login')) throw new Error('not on login');
    return 'stayed on /login';
  });

  await runTest('UI-LOGIN-03', 'Successful login redirects', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    if (page.url().includes('/login')) throw new Error('still on login');
    return `landed: ${page.url()}`;
  });

  // ===== PAGES (need auth) =====
  await runTest('UI-DASH', 'Dashboard has KPI content', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/dashboard`);
    const text = await getText(page);
    if (text.length < 50) throw new Error('too short');
    return `body_len=${text.length} status=${resp.status()}`;
  });

  await runTest('UI-INC', 'Incidents list renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/incidents`);
    const text = await getText(page);
    if (!/sự cố|incident/i.test(text)) throw new Error('no incident text');
    return `status=${resp.status()}`;
  });

  await runTest('UI-WO', 'Work orders list renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/work-orders`);
    const text = await getText(page);
    if (!/work.?order|phiếu|công việc/i.test(text)) throw new Error('no WO text');
    return `status=${resp.status()}`;
  });

  await runTest('UI-ASSET', 'Assets list renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/assets`);
    const text = await getText(page);
    if (!/thiết bị|asset/i.test(text)) throw new Error('no asset text');
    return `status=${resp.status()}`;
  });

  await runTest('UI-IAM-USERS', 'IAM Users page renders table', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/iam/users`);
    const tableCount = await page.$$eval('table, [role="row"]', (els) => els.length);
    if (tableCount === 0) throw new Error('no table');
    return `rows=${tableCount} status=${resp.status()}`;
  });

  await runTest('UI-NTF', 'Notifications page renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/notifications`);
    const text = await getText(page);
    if (!/thông báo|notification/i.test(text)) throw new Error('no notification text');
    return `status=${resp.status()}`;
  });

  await runTest('UI-LANG', 'Vietnamese diacritics present', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    await navigateAndWait(page, `${WEB}/dashboard`);
    const text = await getText(page);
    if (!/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i.test(text)) {
      throw new Error('no Vietnamese chars');
    }
    return 'ok';
  });

  await runTest('UI-NAV', 'App shell has sidebar/nav', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    await navigateAndWait(page, `${WEB}/dashboard`);
    const navCount = await page.$$eval('nav, aside, [role="navigation"]', (els) => els.length);
    if (navCount === 0) throw new Error('no nav');
    return `nav_count=${navCount}`;
  });

  await runTest('UI-APR', 'Approvals page renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/approvals`);
    return `status=${resp.status()}`;
  });

  await runTest('UI-MP', 'Maintenance plans renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/maintenance/plans`);
    return `status=${resp.status()}`;
  });

  await runTest('UI-INV', 'Inventory parts renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/inventory/parts`);
    return `status=${resp.status()}`;
  });

  await runTest('UI-RPT', 'Reports page renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/reports`);
    return `status=${resp.status()}`;
  });

  await runTest('UI-AUDIT', 'Audit logs page renders', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    const resp = await navigateAndWait(page, `${WEB}/iam/audit-logs`);
    return `status=${resp.status()}`;
  });

  // Detail page link discovery
  await runTest('UI-INC-LINKS', 'Incidents has detail links', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    await navigateAndWait(page, `${WEB}/incidents`);
    const link = await page.$('a[href*="/incidents/"]');
    if (!link) throw new Error('no incident link');
    const href = await page.evaluate((el) => el.href, link);
    return `found: ${href}`;
  });

  await runTest('UI-WO-LINKS', 'Work-orders has detail links', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    await navigateAndWait(page, `${WEB}/work-orders`);
    const link = await page.$('a[href*="/work-orders/"]');
    if (!link) throw new Error('no WO link');
    const href = await page.evaluate((el) => el.href, link);
    return `found: ${href}`;
  });

  await runTest('UI-ASSET-LINKS', 'Assets has detail links', async (page) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    await navigateAndWait(page, `${WEB}/assets`);
    const link = await page.$('a[href*="/assets/"]');
    if (!link) throw new Error('no asset link');
    const href = await page.evaluate((el) => el.href, link);
    return `found: ${href}`;
  });

  await browser.close();

  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  console.log('\n========================================');
  console.log(`E2E SUMMARY:  PASS=${pass}  FAIL=${fail}  TOTAL=${results.length}`);
  console.log(`Report: ${REPORT}`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});