const puppeteer = require('puppeteer-core');

// Detail-page + interactive-write checks.
const API = 'http://localhost:3001';

async function apiLogin() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' }),
  });
  const j = await res.json();
  if (!j.accessToken) throw new Error('API login failed: ' + JSON.stringify(j).slice(0, 200));
  return j.accessToken;
}

(async () => {
  const token = await apiLogin();
  const h = { Authorization: `Bearer ${token}` };

  // Pick real IDs from the API to visit the matching detail pages.
  const firstId = async (p) => {
    const r = await fetch(`${API}${p}`, { headers: h });
    const j = await r.json();
    return j.items && j.items[0] ? j.items[0].id : null;
  };
  const incId = await firstId('/incidents?limit=1');
  const woId = await firstId('/work-orders?limit=1');
  const aprId = await firstId('/approvals?limit=1');
  const astId = await firstId('/assets?limit=1');
  const plnId = await firstId('/maintenance-plans?limit=1');

  const DETAIL = [
    ['/incidents/' + incId, ['Người báo', 'Mô tả', 'Ảnh hưởng']],
    ['/work-orders/' + woId, ['Mô tả', 'Chu kỳ']],
    ['/approvals/' + aprId, ['Lý do']],
    ['/assets/' + astId, []],
    ['/maintenance/plans/' + plnId, []],
    ['/assets/' + astId + '/qr', []],
    ['/iam/users/' + 'x', []],
  ];

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + String(e.message).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="admin.bootstrap"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.type('input[placeholder="admin.bootstrap"]', 'admin.bootstrap');
  (await page.$$('input[type="password"]'))[0] ? null : null;
  await (await page.$$('input[type="password"]'))[0].type('ChangeMe@2026');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 6000));
  for (let i = 0; i < 20 && page.url().includes('/login'); i++) await new Promise((r) => setTimeout(r, 1000));
  console.log('LOGIN ->', page.url());

  for (const [route, expect] of DETAIL) {
    errs.length = 0;
    try {
      await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await new Promise((r) => setTimeout(r, 3000));
      const info = await page.evaluate(() => {
        const t = document.body.innerText;
        return {
          len: t.length,
          undef: (t.match(/undefined/g) || []).length,
          nan: (t.match(/\bNaN\b/g) || []).length,
          objObj: (t.match(/\[object Object\]/g) || []).length,
          head: t.slice(0, 300).replace(/\n+/g, ' | '),
        };
      });
      console.log('\n=== ' + route + ' ===');
      console.log('  len=' + info.len + ' undefined=' + info.undef + ' NaN=' + info.nan + ' [object Object]=' + info.objObj);
      expect.forEach((e) => { if (!info.head.includes(e)) console.log('  !! missing expected text: ' + e); });
      if (info.undef) console.log('  !! contains "undefined"');
      if (info.nan) console.log('  !! contains "NaN"');
      if (errs.length) console.log('  !! errors: ' + JSON.stringify(errs.slice(0, 3)));
      console.log('  head: ' + info.head);
    } catch (e) {
      console.log('\n=== ' + route + ' === FAILED: ' + e.message.slice(0, 120));
    }
  }

  await browser.close();
})();