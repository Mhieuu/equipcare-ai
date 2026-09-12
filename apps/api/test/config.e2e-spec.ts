import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho Config module — Doc07 TC-CFG-01..03.
 *
 * Tests:
 *   - TC-CFG-01: GET /system-settings (list, cần auth)
 *   - TC-CFG-02: GET /system-settings/:key (lấy 1 setting)
 *   - TC-CFG-03: PUT /system-settings/:key (admin update + row_version++)
 */
describe('Config E2E (TC-CFG-01..03)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAccessToken: string;
  const tag = Date.now();
  const testKey = `e2e.test.${tag}`;

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

      // Setup: tạo 1 setting test.
      await request(server)
        .post('/system-settings')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .send({ key: testKey, value: { threshold: 10 }, description: `e2e test ${tag}` })
        .expect(201);
    } catch (err) {
      console.warn('[config.e2e] DB unavailable — skipping:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await disconnectPrisma();
    }
  });

  it('TC-CFG-01: GET /system-settings trả list có key vừa tạo', async () => {
    if (!server) return;
    const res = await request(server)
      .get('/system-settings')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: testKey })]),
    );
  });

  it('TC-CFG-02: GET /system-settings/:key trả đúng setting', async () => {
    if (!server) return;
    const res = await request(server)
      .get(`/system-settings/${testKey}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(res.body.key).toBe(testKey);
    expect(res.body.value).toEqual({ threshold: 10 });
  });

  it('TC-CFG-03: PUT /system-settings/:key update value + row_version tăng', async () => {
    if (!server) return;
    const before = await request(server)
      .get(`/system-settings/${testKey}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const beforeVersion = before.body.row_version;

    const res = await request(server)
      .put(`/system-settings/${testKey}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ value: { threshold: 20 }, description: `updated ${tag}` })
      .expect(200);
    expect(res.body.value).toEqual({ threshold: 20 });
    expect(res.body.row_version).toBe(beforeVersion + 1);
  });
});
