import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho Organization module — Doc07 TC-ORG-01..04.
 *
 * Test users (seed):
 *   - admin.bootstrap / ChangeMe@2026 → ADMIN
 *   - (test tạo user mới nếu cần)
 *
 * Tests:
 *   - TC-ORG-01: tạo + list departments
 *   - TC-ORG-02: tạo locations có parent + getLocationTree trả cây đúng
 *   - TC-ORG-03: update location cycle (parent = self) → 422
 *   - TC-ORG-04: tạo asset-type, list, get
 *
 * Yêu cầu: Postgres có sẵn ở DATABASE_URL + đã seed. Skip nếu DB không connect.
 */
describe('Organization E2E (TC-ORG-01..04)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAccessToken: string;
  const tag = Date.now();

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
    } catch (err) {
      console.warn('[org.e2e] DB unavailable — skipping:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await disconnectPrisma();
    }
  });

  // -------------------------------------------------------------------------
  // TC-ORG-01: tạo + list departments
  // -------------------------------------------------------------------------
  it('TC-ORG-01: tạo department mới + list có nó', async () => {
    if (!server) return;
    const code = `E2E${tag.toString().slice(-6)}`;
    const createRes = await request(server)
      .post('/departments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ code, name: `E2E Department ${tag}` })
      .expect(201);
    expect(createRes.body.code).toBe(code);
    expect(createRes.body.is_active).toBe(true);

    const listRes = await request(server)
      .get('/departments')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(listRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  // -------------------------------------------------------------------------
  // TC-ORG-02: locations có parent + tree
  // -------------------------------------------------------------------------
  it('TC-ORG-02: tạo location parent + child, GET /locations/tree đúng cấu trúc', async () => {
    if (!server) return;
    const parentCode = `PAR${tag.toString().slice(-5)}`;
    const parentRes = await request(server)
      .post('/locations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ code: parentCode, name: `Parent ${tag}` })
      .expect(201);
    const parentId = parentRes.body.id;

    const childCode = `CHI${tag.toString().slice(-5)}`;
    await request(server)
      .post('/locations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ code: childCode, name: `Child ${tag}`, parentId })
      .expect(201);

    const treeRes = await request(server)
      .get('/locations/tree')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);

    const parentNode = (treeRes.body as Array<{ code: string; children: unknown[] }>).find(
      (n) => n.code === parentCode,
    );
    expect(parentNode).toBeDefined();
    expect(parentNode!.children).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: childCode })]),
    );
  });

  // -------------------------------------------------------------------------
  // TC-ORG-03: update location với parentId = id → cycle → 422
  // -------------------------------------------------------------------------
  it('TC-ORG-03: update location parentId = self → 422 ORG_LOCATION_CYCLE', async () => {
    if (!server) return;
    // Tạo 1 location mới.
    const code = `CYC${tag.toString().slice(-5)}`;
    const created = await request(server)
      .post('/locations')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ code, name: `Cycle ${tag}` })
      .expect(201);

    // Cố set parentId = chính nó.
    await request(server)
      .patch(`/locations/${created.body.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ name: 'Renamed', parentId: created.body.id })
      .expect(422);
  });

  // -------------------------------------------------------------------------
  // TC-ORG-04: tạo asset-type + get
  // -------------------------------------------------------------------------
  it('TC-ORG-04: tạo asset-type + list + get', async () => {
    if (!server) return;
    const code = `PUMP${tag.toString().slice(-6)}`;
    const createRes = await request(server)
      .post('/asset-types')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ code, name: `E2E Pump ${tag}`, description: 'Centrifugal pump for testing' })
      .expect(201);
    expect(createRes.body.code).toBe(code);

    const listRes = await request(server)
      .get('/asset-types')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(listRes.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );

    await request(server)
      .get(`/asset-types/${createRes.body.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.code).toBe(code);
      });
  });
});
