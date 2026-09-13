import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AiRequestStatus } from '@equipcare/shared';

async function loginAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
}

async function ensureTestAsset(prisma: PrismaService, code: string) {
  const existing = await prisma.assets.findUnique({ where: { code } });
  if (existing) return existing.id;
  const assetType = await prisma.asset_types.findFirstOrThrow();
  const dept = await prisma.departments.findFirstOrThrow();
  const loc = await prisma.locations.findFirstOrThrow();
  const user = await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } });
  return (
    await prisma.assets.create({
      data: {
        code,
        name: 'Test asset for AI E2E',
        asset_type_id: assetType.id,
        department_id: dept.id,
        location_id: loc.id,
        manual_state: 'NORMAL',
        created_by: user.id,
        qr_key: randomUUID(),
      },
    })
  ).id;
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

/**
 * Wait poll util — Polling request status đến khi terminal state.
 */
async function pollUntilTerminal(
  app: INestApplication,
  token: string,
  requestId: string,
  maxMs = 8000,
): Promise<{ status: string; output?: unknown; errorCode?: string }> {
  const start = Date.now();
  let lastBody: any = null;
  while (Date.now() - start < maxMs) {
    const res = await request(app.getHttpServer())
      .get(`/ai/requests/${requestId}`)
      .set({ Authorization: `Bearer ${token}` });
    lastBody = res.body;
    if ([AiRequestStatus.SUCCEEDED, AiRequestStatus.FAILED, AiRequestStatus.TIMED_OUT].includes(res.body.status)) {
      return res.body;
    }
    await new Promise<void>((r) => setTimeout(r, 200));
  }
  return lastBody;
}

describe('AI E2E (M4 — TC-AI-01..06)', () => {
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
      console.warn('[ai e2e] DB not reachable, skipping:', (err as Error).message);
      await app.close();
      return;
    }

    token = await loginAdmin(app);
    const uniqueCode = `TEST-AI-${Date.now()}`;
    assetId = await ensureTestAsset(prisma, uniqueCode);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
  });

  // -------------------------------------------------------------------------
  // TC-AI-01: POST analyze → 202 với requestId
  // -------------------------------------------------------------------------
  it('TC-AI-01: POST /ai/incidents/:id/analyze returns 202 + requestId', async () => {
    if (!token) return;
    // Tạo incident trước
    const inc = await request(app.getHttpServer())
      .post('/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        assetId,
        description: 'Cháy máy, cần phân loại ngay',
        impactDescription: 'Mất điện toàn bộ khu vực',
      });
    expect(inc.status).toBe(201);

    const res = await request(app.getHttpServer())
      .post(`/ai/incidents/${inc.body.id}/analyze`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(res.status).toBe(202);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.status).toBe(AiRequestStatus.QUEUED);
  });

  // -------------------------------------------------------------------------
  // TC-AI-02: Mock provider trả SUCCEEDED trong vòng vài giây
  // -------------------------------------------------------------------------
  it('TC-AI-02: Mock provider completes SUCCEEDED with output_payload', async () => {
    if (!token) return;
    const inc = await request(app.getHttpServer())
      .post('/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        assetId,
        description: 'Bơm kẹt, không hoạt động',
        impactDescription: 'Dây chuyền dừng 15 phút',
      });
    expect(inc.status).toBe(201);

    const submit = await request(app.getHttpServer())
      .post(`/ai/incidents/${inc.body.id}/analyze`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(submit.status).toBe(202);

    const final = await pollUntilTerminal(app, token, submit.body.requestId);
    expect(final.status).toBe(AiRequestStatus.SUCCEEDED);
    expect(final.output).toBeTruthy();
    expect((final.output as Record<string, unknown>).priority).toMatch(/^(LOW|MEDIUM|HIGH|CRITICAL)$/);
  });

  // -------------------------------------------------------------------------
  // TC-AI-03: Output snapshot có assetCode + description (filtered PII)
  // -------------------------------------------------------------------------
  it('TC-AI-03: input_snapshot chứa assetCode + description (filtered)', async () => {
    if (!token) return;
    const inc = await request(app.getHttpServer())
      .post('/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        assetId,
        description: 'Mô tả ngắn về sự cố',
        impactDescription: 'Không ảnh hưởng',
      });
    expect(inc.status).toBe(201);

    const submit = await request(app.getHttpServer())
      .post(`/ai/incidents/${inc.body.id}/analyze`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(submit.status).toBe(202);

    // Đọc DB trực tiếp để verify snapshot.
    const row = await prisma.ai_requests.findUnique({ where: { id: submit.body.requestId } });
    expect(row).toBeTruthy();
    expect(row!.input_snapshot).toBeTruthy();
    const snap = row!.input_snapshot as Record<string, unknown>;
    expect(snap.assetCode).toBeTruthy();
    expect(snap.description).toBe('Mô tả ngắn về sự cố');
  });

  // -------------------------------------------------------------------------
  // TC-AI-04: GET requestId sai trả 404
  // -------------------------------------------------------------------------
  it('TC-AI-04: GET /ai/requests/<unknown-uuid> returns 404', async () => {
    if (!token) return;
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app.getHttpServer())
      .get(`/ai/requests/${fakeId}`)
      .set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(404);
  });

  // -------------------------------------------------------------------------
  // TC-AI-05: Poll không có token → 401
  // -------------------------------------------------------------------------
  it('TC-AI-05: Poll without token → 401', async () => {
    if (!token) return;
    const inc = await request(app.getHttpServer())
      .post('/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        assetId,
        description: 'Test poll ACL',
        impactDescription: 'n/a',
      });
    expect(inc.status).toBe(201);

    const submit = await request(app.getHttpServer())
      .post(`/ai/incidents/${inc.body.id}/analyze`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(submit.status).toBe(202);

    // Không có token → JwtAuthGuard block với 401.
    const noTokenRes = await request(app.getHttpServer())
      .get(`/ai/requests/${submit.body.requestId}`);
    expect(noTokenRes.status).toBe(401);
  });

  // -------------------------------------------------------------------------
  // TC-AI-06: Audit log cho ai.request.create
  // -------------------------------------------------------------------------
  it('TC-AI-06: ai.request.create writes audit log', async () => {
    if (!token) return;
    const inc = await request(app.getHttpServer())
      .post('/incidents')
      .set({ Authorization: `Bearer ${token}` })
      .send({
        assetId,
        description: 'Test audit AI',
        impactDescription: 'n/a',
      });
    expect(inc.status).toBe(201);

    const submit = await request(app.getHttpServer())
      .post(`/ai/incidents/${inc.body.id}/analyze`)
      .set({ Authorization: `Bearer ${token}` })
      .send({});
    expect(submit.status).toBe(202);

    const audit = await prisma.audit_logs.findFirst({
      where: { object_key: submit.body.requestId, action: 'ai.request.create' },
    });
    expect(audit).toBeTruthy();
  });
});
