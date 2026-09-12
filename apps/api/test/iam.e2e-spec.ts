import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho IAM module — Doc07 TC-RBAC-01..06.
 *
 * Yêu cầu: Postgres có sẵn ở DATABASE_URL và đã chạy `pnpm db:seed`.
 * Nếu không, test sẽ skip.
 *
 * Test users (seed):
 *   - admin.bootstrap / ChangeMe@2026   → ADMIN, có tất cả permission
 *   - (test tạo user mới)               → TECHNICIAN (qua grant role)
 *
 * Strategy: dùng admin để setup + verify; tạo 1 user TECHNICIAN thật qua
 * grant role → verify user đó thấy permission mới qua /iam/me/permissions.
 */
describe('IAM E2E (TC-RBAC-01..06)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAccessToken: string;
  const TEST_TECH_LOGIN = `tech.rbac.${Date.now()}`;
  const TEST_TECH_PASS = 'TechSecure@Pass2026!';
  let testTechUserId: string;
  let technicianAccessToken: string;

  /** Login admin → trả access token */
  async function loginAdmin(): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
      .expect(200);
    return res.body.accessToken as string;
  }

  /** Login user bất kỳ */
  async function loginUser(loginName: string, password: string): Promise<string> {
    const res = await request(server)
      .post('/auth/login')
      .send({ loginName, password })
      .expect(200);
    return res.body.accessToken as string;
  }

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

      adminAccessToken = await loginAdmin();
    } catch (err) {
      console.warn('[iam.e2e] DB unavailable — skipping:', (err as Error).message);
      return;
    }
  });

  afterAll(async () => {
    if (app) {
      // Dọn: revoke role + (optional) delete user test nếu muốn — hiện để
      // idempotent (seed data không bị ảnh hưởng vì user test có login_name
      // unique với timestamp).
      await app.close();
      await disconnectPrisma();
    }
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-01: admin create user → 201, login được với password khởi tạo
  // -------------------------------------------------------------------------
  it('TC-RBAC-01: admin tạo user mới, user login được với initialPassword', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/iam/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        loginName: TEST_TECH_LOGIN,
        fullName: 'Tech Test User',
        email: `${TEST_TECH_LOGIN}@equipcare.local`,
        initialPassword: TEST_TECH_PASS,
      })
      .expect(201);

    expect(res.body.loginName).toBe(TEST_TECH_LOGIN);
    expect(res.body.mustChangePassword).toBe(true);
    expect(res.body.isLocked).toBe(false);
    testTechUserId = res.body.id;

    // Login với initial password → 200.
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ loginName: TEST_TECH_LOGIN, password: TEST_TECH_PASS })
      .expect(200);
    technicianAccessToken = loginRes.body.accessToken;
    expect(loginRes.body.mustChangePassword).toBe(true);
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-02: list users pagination + filter
  // -------------------------------------------------------------------------
  it('TC-RBAC-02: list users có pagination + search theo loginName', async () => {
    if (!server) return;
    const res = await request(server)
      .get('/iam/users')
      .query({ search: TEST_TECH_LOGIN, limit: 10, offset: 0 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items.some((u: { loginName: string }) => u.loginName === TEST_TECH_LOGIN)).toBe(
      true,
    );
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-03: grant role TECHNICIAN → user có permission `incident:read`
  // -------------------------------------------------------------------------
  it('TC-RBAC-03: grant TECHNICIAN role → user có permission mới', async () => {
    if (!server) return;
    // Lấy role TECHNICIAN id từ list roles.
    const rolesRes = await request(server)
      .get('/iam/roles')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const techRole = (rolesRes.body as Array<{ code: string; id: string }>).find(
      (r) => r.code === 'TECHNICIAN',
    );
    expect(techRole).toBeDefined();

    // Grant role.
    await request(server)
      .post(`/iam/users/${testTechUserId}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleId: techRole!.id })
      .expect(201);

    // User hiện không còn permission nào (vì chưa được cấp role active trước).
    // Sau grant, /iam/me/permissions phải có TECHNICIAN + một số permission.
    const meRes = await request(server)
      .get('/iam/me/permissions')
      .set('Authorization', `Bearer ${technicianAccessToken}`)
      .expect(200);
    expect(meRes.body.roles).toContain('TECHNICIAN');
    expect(meRes.body.permissions).toEqual(expect.arrayContaining(['incident:read']));
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-04: revoke role → permission biến mất
  // -------------------------------------------------------------------------
  it('TC-RBAC-04: revoke role → permission biến mất (khi refresh token mới)', async () => {
    if (!server) return;
    // Tìm user_role vừa grant.
    const userRes = await request(server)
      .get(`/iam/users/${testTechUserId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const techUr = (userRes.body.roles as Array<{ roleCode: string; userRoleId: string }>).find(
      (r) => r.roleCode === 'TECHNICIAN',
    );
    expect(techUr).toBeDefined();

    // Revoke.
    await request(server)
      .delete(`/iam/users/${testTechUserId}/roles/${techUr!.userRoleId}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(204);

    // Sau revoke → user chưa có role nào → permissions rỗng.
    // Lưu ý: JWT cũ vẫn có permissions cũ cho đến khi expire. Nhưng /me/permissions
    // sẽ refresh từ DB mỗi request (JwtStrategy validate), nên phản ánh đúng.
    const meRes = await request(server)
      .get('/iam/me/permissions')
      .set('Authorization', `Bearer ${technicianAccessToken}`)
      .expect(200);
    expect(meRes.body.roles).not.toContain('TECHNICIAN');
    expect(meRes.body.permissions).not.toContain('incident:read');
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-05: user không có IAM_USER_MANAGE → 403 khi create user
  // -------------------------------------------------------------------------
  it('TC-RBAC-05: user không có IAM_USER_MANAGE → 403 khi POST /iam/users', async () => {
    if (!server) return;
    // user 'admin.bootstrap' có admin → 201 OK (sanity check).
    // User test TECHNICIAN không có quyền → phải tạo 1 user không có role nào
    // để chắc chắn thiếu quyền. Tạo 1 user mới qua admin, không grant role,
    // login với user đó.
    const userLogin = `norbac.${Date.now()}`;
    const userPass = 'NoRbacSecure@2026!';
    await request(server)
      .post('/iam/users')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        loginName: userLogin,
        fullName: 'No RBAC User',
        initialPassword: userPass,
      })
      .expect(201);

    const noRbacToken = await loginUser(userLogin, userPass);

    await request(server)
      .post('/iam/users')
      .set('Authorization', `Bearer ${noRbacToken}`)
      .send({
        loginName: 'should.fail',
        fullName: 'Should Fail',
        initialPassword: 'FailSecure@2026!',
      })
      .expect(403);
  });

  // -------------------------------------------------------------------------
  // TC-RBAC-06: GET /iam/me/permissions trả đúng permissions cho admin
  // -------------------------------------------------------------------------
  it('TC-RBAC-06: admin /iam/me/permissions có đầy đủ permissions của ADMIN role', async () => {
    if (!server) return;
    const meRes = await request(server)
      .get('/iam/me/permissions')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    expect(meRes.body.roles).toContain('ADMIN');
    // Admin có nhiều permission — sanity check 3 permission đặc trưng.
    expect(meRes.body.permissions).toEqual(
      expect.arrayContaining([
        'iam:user:manage',
        'iam:role:manage',
        'incident:create',
      ]),
    );
  });
});
