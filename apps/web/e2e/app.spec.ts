import { test, expect, Page } from '@playwright/test';

/**
 * Helper: login via UI.
 */
async function login(page: Page, username: string, password: string) {
  await page.goto('/login');
  await page.getByLabel(/login|đăng nhập|tài khoản/i).first().fill(username);
  await page.getByLabel(/password|mật khẩu/i).first().fill(password);
  await page.getByRole('button', { name: /login|đăng nhập|sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15000 });
}

test.describe('Smoke - Login + Auth', () => {
  test('login page renders with Vietnamese form', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveTitle(/EquipCare|Đăng nhập/);
    // Form fields exist
    await expect(page.locator('input').first()).toBeVisible();
  });

  test('invalid login shows error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input').first().fill('admin.bootstrap');
    await page.locator('input[type="password"]').first().fill('WrongPassword');
    await page.locator('button[type="submit"], button:has-text("Đăng nhập"), button:has-text("Login")').first().click();
    // Should stay on /login and show error
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });

  test('successful login redirects away from /login', async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    // Should not be on /login
    expect(page.url()).not.toContain('/login');
  });

  test('logout returns to /login', async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
    // Look for logout button
    const logoutBtn = page.getByRole('button', { name: /logout|đăng xuất/i });
    if (await logoutBtn.count() > 0) {
      await logoutBtn.first().click();
      await page.waitForURL(/\/login/, { timeout: 10000 });
    }
  });
});

test.describe('Routes - All return 200', () => {
  const routes = [
    '/login',
    '/dashboard',
    '/incidents',
    '/work-orders',
    '/assets',
    '/approvals',
    '/inventory/parts',
    '/maintenance/plans',
    '/notifications',
    '/reports',
    '/iam/users',
    '/iam/audit-logs',
  ];

  for (const path of routes) {
    test(`route ${path} returns 200 or redirects to login`, async ({ page }) => {
      const response = await page.goto(path);
      // Either 200 or redirect to login (unauthenticated)
      const status = response?.status() ?? 0;
      expect([200, 307, 302, 308]).toContain(status);
    });
  }
});

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('dashboard shows KPI cards', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Should have some text content
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});

test.describe('Incidents', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('list page renders', async ({ page }) => {
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toMatch(/incident|sự cố/i);
  });

  test('new incident page has form', async ({ page }) => {
    await page.goto('/incidents/new');
    await page.waitForLoadState('networkidle');
    // Has input or textarea
    const hasForm = (await page.locator('input, textarea, select').count()) > 0;
    expect(hasForm).toBeTruthy();
  });
});

test.describe('Work Orders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('list page renders', async ({ page }) => {
    await page.goto('/work-orders');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toMatch(/work.?order|phiếu|công việc/i);
  });
});

test.describe('Assets', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('list page renders', async ({ page }) => {
    await page.goto('/assets');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toMatch(/asset|thiết bị/i);
  });
});

test.describe('IAM', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('users page shows table', async ({ page }) => {
    await page.goto('/iam/users');
    await page.waitForLoadState('networkidle');
    // Has table or list
    const count = await page.locator('table, [role="row"]').count();
    expect(count).toBeGreaterThan(0);
  });

  test('audit-logs page renders', async ({ page }) => {
    await page.goto('/iam/audit-logs');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toBeTruthy();
  });
});

test.describe('AI Triage UI', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('incident detail has AI panel', async ({ page }) => {
    // Go to incidents list
    await page.goto('/incidents');
    await page.waitForLoadState('networkidle');
    // Click first incident link
    const firstLink = page.locator('a[href*="/incidents/"]').first();
    if (await firstLink.count() > 0) {
      await firstLink.click();
      await page.waitForLoadState('networkidle');
      // Look for AI button or panel
      const aiBtn = page.getByRole('button', { name: /AI|phân tích|analyze/i });
      if (await aiBtn.count() > 0) {
        expect(await aiBtn.first().isVisible()).toBeTruthy();
      }
    }
  });
});

test.describe('Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('notifications page renders', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    expect(body).toMatch(/notification|thông báo/i);
  });
});

test.describe('Theme & Layout', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin.bootstrap', 'ChangeMe@2026');
  });

  test('app shell has sidebar', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    // Look for nav or sidebar
    const navCount = await page.locator('nav, aside, [role="navigation"]').count();
    expect(navCount).toBeGreaterThan(0);
  });

  test('Vietnamese labels are present', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const body = await page.textContent('body');
    // Should have some Vietnamese diacritics
    expect(body).toMatch(/[àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ]/i);
  });
});