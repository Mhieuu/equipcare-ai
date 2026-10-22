const puppeteer = require('puppeteer-core');

const ROUTES = [
  ['/dashboard', ['Thiết bị', 'Sự cố mở', 'Phiếu mở']],
  ['/incidents', ['Mã', 'Thiết bị', 'Người báo', 'Mô tả']],
  ['/work-orders', ['Mã', 'Thiết bị', 'Trạng thái']],
  ['/approvals', ['Phiếu WO', 'Người đề xuất', 'Lý do', 'Rev']],
  ['/assets', ['Mã', 'Thiết bị', 'Loại']],
  ['/inventory/parts', ['Mã', 'Tên', 'Tồn kho']],
  ['/maintenance/plans', ['Mã', 'Tên', 'Thiết bị', 'Chu kỳ']],
  ['/reports', [] ],
  ['/iam/users', [] ],
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e.message).slice(0, 200)));

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="admin.bootstrap"]', { timeout: 20000 });
  // Wait for React hydration so the form's onSubmit handler is attached —
  // otherwise the browser does a native GET submit (?loginName=... in the URL).
  await page.waitForFunction(
    () => !!document.querySelector('#__next')?.getAttribute('data-hydrated')
      || Object.keys(document.querySelector('#__next') || {}).length > 0,
    { timeout: 15000 },
  ).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  await page.type('input[placeholder="admin.bootstrap"]', 'admin.bootstrap');
  const pw = await page.$$('input[type="password"]');
  await pw[0].type('ChangeMe@2026');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 5000));
  for (let i = 0; i < 20 && page.url().includes('/login'); i++) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log('LOGIN ->', page.url());
  if (page.url().includes('/login')) {
    console.log('!! LOGIN FAILED — aborting route walk');
    await browser.close();
    process.exit(1);
  }

  for (const [route, expect] of ROUTES) {
    consoleErrors.length = 0;
    await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 3000));
    const info = await page.evaluate(() => {
      const t = document.body.innerText;
      return {
        len: t.length,
        undefinedCount: (t.match(/undefined/g) || []).length,
        nanCount: (t.match(/\bNaN\b/g) || []).length,
        dashCells: (t.match(/\t—\t/g) || []).length,
        head: t.slice(0, 260).replace(/\n+/g, ' | '),
      };
    });
    const missing = expect.filter((e) => !info.head.includes(e) && info.len < 50);
    console.log('\n=== ' + route + ' ===');
    console.log('  textLen=' + info.len + ' undefined=' + info.undefinedCount + ' NaN=' + info.nanCount + ' emptyCells=' + info.dashCells);
    if (missing.length) console.log('  !! MISSING HEADERS: ' + missing.join(', '));
    if (info.undefinedCount) console.log('  !! contains "undefined"');
    if (info.nanCount) console.log('  !! contains "NaN"');
    if (consoleErrors.length) console.log('  !! console errors: ' + JSON.stringify(consoleErrors.slice(0, 3)));
    console.log('  head: ' + info.head);
  }

  await browser.close();
})();