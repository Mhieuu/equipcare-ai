import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho audit_logs + security — Doc07 TC-AUD-01..02 + TC-SEC-01..04.
 *
 * Tests:
 *   - TC-AUD-01: admin có 'audit:read:all' → GET /iam/audit-logs OK
 *   - TC-AUD-02: filter theo action = 'auth.login.success' tìm được login gần nhất
 *   - TC-SEC-01: login fail → audit log ghi 'auth.login.failed'
 *   - TC-SEC-02: change-password → audit log ghi 'auth.change-password'
 *   - TC-SEC-03: user không có audit permission → 403
 *   - TC-SEC-04: audit log có correlationKey + actor_id, KHÔNG lộ password_hash
 */
describe('Audit + Security E2E (TC-AUD-01..02 + TC-SEC-01..04)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAccessToken: string;
  let adminUserId: string;
  const tag = Date.now();
  const newUserLogin = `sec.${tag}`;
  const newUserPass = 'Secure@Pass2026!';

  beforeAll(async () => {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      server = app.getHttpServer();

      const loginRes = await request(server)
        .post('/auth/login')
        .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
        .expect(200);
      adminAccessToken = loginRes.body.accessToken;
      const meRes = await request(server)
        .get('/iam/me/permissions')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      adminUserId = meRes.body.sub;
      // sub không có trong MePermissionsDto → đổi sang /iam/users lấy admin id
      // Fallback: lấy qua list filter login_name.
      const usersRes = await request(server)
        .get(`/iam/users?search=admin.bootstrap`)
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      const adminUser = (usersRes.body.items as Array<{ loginName: string; id: string }>).find(
        (u) => u.loginName === 'admin.bootstrap',
      );
      if (adminUser) adminUserId = adminUser.id;
    } catch (err) {
      console.warn('[audit-security.e2e] DB unavailable — skipping:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await disconnectPrisma();
    }
  });

  // -------------------------------------------------------------------------
  // TC-SEC-01: login fail → audit log ghi 'auth.login.failed'
  // -------------------------------------------------------------------------
  it('TC-SEC-01: login sai password → audit ghi auth.login.failed', async () => {
    if (!server) return;
    await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'WrongPass!1' })
      .expect(401);

    // Đợi 100ms để audit kịp ghi (best-effort).
    await new Promise((r) => setTimeout(r, 100));

    const res = await request(server)
      .get('/iam/audit-logs')
      .query({ action: 'auth.login.failed', limit: 5 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    const fail = (res.body.items as Array<{ action: string; note: string | null }>)[0];
    expect(fail.action).toBe('auth.login.failed');
    expect(fail.note).toMatch(/admin\.bootstrap/);
  });

  // -------------------------------------------------------------------------
  // TC-SEC-02: change-password → audit log ghi 'auth.change-password'
  // -------------------------------------------------------------------------
  it('TC-SEC-02: change-password → audit ghi auth.change-password', async () => {
    if (!server) return;
    // Tạo 1 user test mới (admin tạo + grant role không cần, chỉ cần đổi pass).
    await request(server)
      .post('/iam/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        loginName: newUserLogin,
        fullName: 'Sec Test User',
        initialPassword: newUserPass,
      })
      .expect(201);

    // Login với user mới.
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ loginName: newUserLogin, password: newUserPass })
      .expect(200);
    const userToken = loginRes.body.accessToken as string;

    // Đổi pass.
    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ currentPassword: newUserPass, newPassword: 'NewSecure@Pass2026!' })
      .expect(204);

    await new Promise((r) => setTimeout(r, 100));

    const res = await request(server)
      .get('/iam/audit-logs')
      .query({ action: 'auth.change-password', limit: 5 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);

    // Reset về pass ban đầu để test idempotent.
    const newLogin = await request(server)
      .post('/auth/login')
      .send({ loginName: newUserLogin, password: 'NewSecure@Pass2026!' })
      .expect(200);
    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${newLogin.body.accessToken}`)
      .send({ currentPassword: 'NewSecure@Pass2026!', newPassword: newUserPass })
      .expect(204);
  });

  // -------------------------------------------------------------------------
  // TC-SEC-03: user không có audit permission → 403
  // -------------------------------------------------------------------------
  it('TC-SEC-03: user không có audit:read:all → 403 khi GET /iam/audit-logs', async () => {
    if (!server) return;
    // Tạo 1 user không có role nào.
    const login = `noperm.${tag}`;
    await request(server)
      .post('/iam/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        loginName: login,
        fullName: 'NoPerm User',
        initialPassword: 'NoPerm@Pass2026!',
      })
      .expect(201);

    const loginRes = await request(server)
      .post('/auth/login')
      .send({ loginName: login, password: 'NoPerm@Pass2026!' })
      .expect(200);
    const token = loginRes.body.accessToken as string;

    await request(server)
      .get('/iam/audit-logs')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  // -------------------------------------------------------------------------
  // TC-SEC-04: audit log có correlationKey, actorId, KHÔNG lộ password_hash
  // -------------------------------------------------------------------------
  it('TC-SEC-04: audit log có correlationKey + actor_id; old/newValue không lộ password_hash', async () => {
    if (!server) return;
    const res = await request(server)
      .get('/iam/audit-logs')
      .query({ action: 'auth.login.success', actorId: adminUserId, limit: 5 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    const item = (res.body.items as Array<{
      correlationKey: string;
      actorId: string | null;
      oldValue: unknown;
      newValue: unknown;
    }>)[0];
    expect(item.correlationKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(item.actorId).toBe(adminUserId);
    const blob = JSON.stringify({ old: item.oldValue, new: item.newValue });
    expect(blob).not.toMatch(/password_hash/i);
    expect(blob).not.toMatch(/\$2[abxy]\$/i); // bcrypt hash signature
  });

  // -------------------------------------------------------------------------
  // TC-AUD-01: admin có 'audit:read:all' → GET /iam/audit-logs OK
  // -------------------------------------------------------------------------
  it('TC-AUD-01: admin có audit:read:all → 200 + total > 0', async () => {
    if (!server) return;
    const res = await request(server)
      .get('/iam/audit-logs')
      .query({ limit: 1 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // TC-AUD-02: filter action chính xác
  // -------------------------------------------------------------------------
  it('TC-AUD-02: filter theo action + from/to date', async () => {
    if (!server) return;
    const from = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const to = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await request(server)
      .get('/iam/audit-logs')
      .query({
        action: 'auth.login.success',
        from,
        to,
        limit: 5,
      })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    (res.body.items as Array<{ action: string }>).forEach((it) =>
      expect(it.action).toBe('auth.login.success'),
    );
  });
});
