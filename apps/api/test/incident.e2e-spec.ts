import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { writeAudit } from '@equipcare/backend-core';

/**
 * Helper cho E2E: login admin → token cho request.
 */
async function loginAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

/**
 * Tạo asset test nếu chưa có (idempotent). Trả id.
 */
async function ensureTestAsset(prisma: PrismaService, code: string, assetTypeId: string, deptId: string, locId: string) {
  const existing = await prisma.assets.findUnique({ where: { code } });
  if (existing) return existing.id;
  const created = await prisma.assets.create({
    data: {
      code,
      name: 'Test asset for incident E2E',
      asset_type_id: assetTypeId,
      department_id: deptId,
      location_id: locId,
      manual_state: 'NORMAL',
      created_by: (await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } })).id,
      qr_key: randomUUID(),
    },
  });
  return created.id;
}

async function bootstrap() {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  return { app, moduleRef };
}

describe('Incident E2E (M4 — TC-INC-01..06)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let token: string;
  let assetId: string;

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.warn('[incident e2e] DB not reachable, skipping:', (err as Error).message);
      await app.close();
      return;
    }

    token = await loginAdmin(app);
    // Lấy 1 asset_type / dept / loc để tạo asset test nếu cần
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();
    const uniqueCode = `TEST-INC-${Date.now()}`;
    assetId = await ensureTestAsset(prisma, uniqueCode, assetType.id, dept.id, loc.id);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
  });

  function bearer() {
    return { Authorization: `Bearer ${token}` };
  }

  // -------------------------------------------------------------------------
  // TC-INC-01: tạo incident thành công
  // -------------------------------------------------------------------------
  it('TC-INC-01: POST /incidents creates a NEW incident with REPORTER message', async () => {
    if (!token) return;
    const res = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Máy rung mạnh bất thường',
        impactDescription: 'Tạm dừng sản xuất',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('NEW');
    expect(res.body.code).toMatch(/^INC-\d{8}-\d{5}$/);
    expect(Array.isArray(res.body.messages)).toBe(true);
    expect(res.body.messages[0].message_type).toBe('REPORTER');
    expect(res.body.messages[0].body).toBe('Máy rung mạnh bất thường');
  });

  // -------------------------------------------------------------------------
  // TC-INC-02: NEW → AWAITING_INFO hợp lệ
  // -------------------------------------------------------------------------
  it('TC-INC-02: transition NEW → AWAITING_INFO succeeds', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Cần bổ sung thông tin',
        impactDescription: 'Không rõ',
      });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'AWAITING_INFO' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('AWAITING_INFO');
  });

  // -------------------------------------------------------------------------
  // TC-INC-03: NEW → IN_PROGRESS hợp lệ
  // -------------------------------------------------------------------------
  it('TC-INC-03: transition NEW → IN_PROGRESS succeeds', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Bắt đầu xử lý luôn',
        impactDescription: 'KT nhận',
      });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'IN_PROGRESS' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  // -------------------------------------------------------------------------
  // TC-INC-04: transition invalid (NEW → CLOSED) bị reject
  // -------------------------------------------------------------------------
  it('TC-INC-04: invalid transition (NEW → CLOSED) returns 422', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Test invalid transition',
        impactDescription: 'Test',
      });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'CLOSED' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INCIDENT_INVALID_TRANSITION');
  });

  // -------------------------------------------------------------------------
  // TC-INC-05: CANCELLED yêu cầu reason
  // -------------------------------------------------------------------------
  it('TC-INC-05: CANCELLED without reason returns 422', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Sẽ hủy',
        impactDescription: 'Không rõ',
      });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'CANCELLED' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INCIDENT_CANCEL_REQUIRES_REASON');
  });

  // -------------------------------------------------------------------------
  // TC-INC-06: CANCELLED hợp lệ khi có reason + ghi SYSTEM message
  // -------------------------------------------------------------------------
  it('TC-INC-06: valid CANCELLED writes SYSTEM message + audit', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Sự cố không có thật',
        impactDescription: 'Báo nhầm',
      });
    expect(created.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'CANCELLED', reason: 'Báo nhầm thiết bị' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancel_reason).toBe('Báo nhầm thiết bị');
    expect(res.body.cancelled_at).toBeTruthy();

    // SYSTEM message được ghi.
    const sysMsg = res.body.messages.find((m: { message_type: string }) => m.message_type === 'SYSTEM');
    expect(sysMsg).toBeTruthy();
    expect(sysMsg.body).toContain('CANCELLED');

    // Audit log có record incident.transition.
    const audit = await prisma.audit_logs.findFirst({
      where: { object_key: created.body.id, action: 'incident.transition' },
      orderBy: { created_at: 'desc' },
    });
    expect(audit).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Bonus: STAFF message trong AWAITING_INFO auto → IN_PROGRESS
  // -------------------------------------------------------------------------
  it('TC-INC-07 (bonus): STAFF message in AWAITING_INFO auto-transitions to IN_PROGRESS', async () => {
    if (!token) return;
    const created = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'Yêu cầu bổ sung',
        impactDescription: 'Cần thêm thông tin',
      });
    expect(created.status).toBe(201);

    await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/transition`)
      .set(bearer())
      .send({ to: 'AWAITING_INFO' })
      .expect(200);

    const msgRes = await request(app.getHttpServer())
      .post(`/incidents/${created.body.id}/messages`)
      .set(bearer())
      .send({ body: 'Tôi đang xử lý, vui lòng đợi 5 phút' });
    expect(msgRes.status).toBe(201);

    const refreshed = await request(app.getHttpServer())
      .get(`/incidents/${created.body.id}`)
      .set(bearer());
    expect(refreshed.body.status).toBe('IN_PROGRESS');
  });

  // Lint guard — giữ audit import để tránh unused khi writeAudit không dùng trực tiếp.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _audit = writeAudit;
});
