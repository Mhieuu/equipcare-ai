const puppeteer = require('puppeteer-core');
const path = require('path');

const SHOTS = [
  ['/dashboard', 'dashboard'],
  ['/approvals', 'approvals'],
  ['/incidents', 'incidents'],
  ['/work-orders', 'work-orders'],
  ['/assets', 'assets'],
  ['/inventory/parts', 'parts'],
  ['/maintenance/plans', 'plans'],
];

(async () => {
  const outDir = process.env.SHOT_DIR || path.join(__dirname, '..', '..', 'screenshots');
  require('fs').mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[placeholder="admin.bootstrap"]', { timeout: 20000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.type('input[placeholder="admin.bootstrap"]', 'admin.bootstrap');
  await (await page.$$('input[type="password"]'))[0].type('ChangeMe@2026');
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 6000));
  for (let i = 0; i < 20 && page.url().includes('/login'); i++) await new Promise((r) => setTimeout(r, 1000));
  console.log('LOGIN ->', page.url());

  for (const [route, name] of SHOTS) {
    await page.goto('http://localhost:3000' + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 3000));
    const file = path.join(outDir, name + '.png');
    await page.screenshot({ path: file, fullPage: false });
    console.log('shot ->', file);
  }
  await browser.close();
})();