import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho Auth module — Doc07 TC-AUTH-01..05.
 *
 * Yêu cầu: Postgres có sẵn ở DATABASE_URL và đã chạy `pnpm db:seed`.
 * Nếu không, test sẽ skip (return sớm khi kết nối fail).
 */
describe('Auth E2E (TC-AUTH-01..05)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;

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
    } catch (err) {
      console.warn('[auth.e2e] DB unavailable — skipping:', (err as Error).message);
      return;
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await disconnectPrisma();
    }
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-01: login với admin.bootstrap/ChangeMe@2026 → 200 + accessToken + cookie
  // -------------------------------------------------------------------------
  it('TC-AUTH-01: login với admin mặc định thành công', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.expiresIn).toEqual(expect.any(Number));

    const cookies = res.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const refresh = (Array.isArray(cookies) ? cookies : [cookies]).find((c: string) =>
      c.startsWith('equipcare_rt='),
    );
    expect(refresh).toBeDefined();
    expect(refresh).toMatch(/HttpOnly/i);
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-02: login sai mật khẩu → 401, không phân biệt "không tồn tại" vs "sai pass"
  // -------------------------------------------------------------------------
  it('TC-AUTH-02: login sai mật khẩu → 401', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'WrongPass!1' })
      .expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    // Không phân biệt loại lỗi (chống enumeration).
    expect(res.body.message).toBe('Sai tên đăng nhập hoặc mật khẩu');
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-03: login với user không tồn tại → 401 (cùng message với TC-AUTH-02)
  // -------------------------------------------------------------------------
  it('TC-AUTH-03: login với user không tồn tại → 401 (cùng message)', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/auth/login')
      .send({ loginName: 'no.such.user', password: 'ChangeMe@2026' })
      .expect(401);

    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.body.message).toBe('Sai tên đăng nhập hoặc mật khẩu');
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-04: refresh token rotation → access mới + cookie mới, session cũ bị revoke
  // -------------------------------------------------------------------------
  it('TC-AUTH-04: refresh rotate access + cookie, session cũ bị revoke', async () => {
    if (!server) return;
    const loginRes = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
      .expect(200);

    const cookies = loginRes.headers['set-cookie'];
    const cookieHeader = (Array.isArray(cookies) ? cookies : [cookies]).join('; ');

    const refreshRes = await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(200);

    expect(refreshRes.body.accessToken).toEqual(expect.any(String));

    // Cookie refresh phải rotate (set-cookie header mới, raw khác cookie cũ).
    // Lưu ý: accessToken có thể GIỐNG nhau nếu refresh trong cùng 1 giây (JWT iat là int seconds).
    // Điều quan trọng là refresh cookie rotate + session cũ bị revoke (check phía dưới).
    const newCookies = refreshRes.headers['set-cookie'];
    const newCookieHeader = (Array.isArray(newCookies) ? newCookies : [newCookies]).join('; ');
    expect(newCookieHeader).toBeTruthy();
    // raw refresh cookie mới phải khác raw cookie cũ.
    const oldRtMatch = (cookieHeader.match(/rt=[^;]+/i) ?? [''])[0];
    const newRtMatch = (newCookieHeader.match(/rt=[^;]+/i) ?? [''])[0];
    expect(newRtMatch).not.toBe('');
    expect(newRtMatch).not.toBe(oldRtMatch);

    // Cookie cũ → không dùng được nữa (session cũ đã bị revoke).
    await request(server)
      .post('/auth/refresh')
      .set('Cookie', cookieHeader)
      .expect(401);
  });

  // -------------------------------------------------------------------------
  // TC-AUTH-05: change-password → revoke all sessions, login với pass mới thành công
  // -------------------------------------------------------------------------
  it('TC-AUTH-05: change-password revoke all sessions + pass mới hoạt động', async () => {
    if (!server) return;
    // Bước 1: login lấy access token.
    const login1 = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
      .expect(200);
    const accessToken1 = login1.body.accessToken as string;

    // Bước 2: đổi password (auth).
    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken1}`)
      .send({ currentPassword: 'ChangeMe@2026', newPassword: 'NewSecure@Pass2026!' })
      .expect(204);

    // Bước 3: login với password cũ → 401.
    await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
      .expect(401);

    // Bước 4: login với password mới → 200, mustChangePassword=false.
    const login2 = await request(server)
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'NewSecure@Pass2026!' })
      .expect(200);
    expect(login2.body.mustChangePassword).toBe(false);

    // Bước 5: reset về password ban đầu để test idempotent.
    await request(server)
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${login2.body.accessToken}`)
      .send({ currentPassword: 'NewSecure@Pass2026!', newPassword: 'ChangeMe@2026' })
      .expect(204);
  });
});
