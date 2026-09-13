import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WorkOrderNoteType, WorkOrderStatus } from '@equipcare/shared';

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
        name: 'Test asset for WO E2E',
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

describe('Work Order E2E (M5 - TC-WO-01..04 + concurrency + auto-resolve)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let token: string;
  let assetId: string;
  let adminUserId: string;

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.warn('[wo e2e] DB not reachable, skipping:', (err as Error).message);
      await app.close();
      return;
    }
    token = await loginAdmin(app);
    const user = await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } });
    adminUserId = user.id;
    const uniqueCode = `TEST-WO-${Date.now()}`;
    assetId = await ensureTestAsset(prisma, uniqueCode);
  });

  afterAll(async () => {
    if (app) await app.close();
    if (moduleRef) await moduleRef.close();
  });

  function bearer() {
    return { Authorization: `Bearer ${token}` };
  }

  async function createIncident() {
    const res = await request(app.getHttpServer())
      .post('/incidents')
      .set(bearer())
      .send({
        assetId,
        description: 'WO test incident',
        impactDescription: 'n/a',
      });
    expect([200, 201]).toContain(res.status);
    return res.body;
  }

  async function createWorkOrder(incidentId?: string, assigneeId?: string) {
    const res = await request(app.getHttpServer())
      .post('/work-orders')
      .set(bearer())
      .send({
        assetId,
        kind: incidentId ? 'REPAIR' : 'MAINTENANCE',
        incidentId: incidentId ?? null,
        assigneeId: assigneeId ?? null,
        creationMode: incidentId ? 'FROM_INCIDENT' : 'MANUAL',
        description: 'WO test description',
        priorityCode: 'HIGH',
      });
    expect([200, 201]).toContain(res.status);
    return res.body;
  }

  // -------------------------------------------------------------------------
  // TC-WO-01: state machine + side-effects
  // -------------------------------------------------------------------------
  it('TC-WO-01: NEW -> ASSIGNED -> IN_PROGRESS -> COMPLETED set timestamps + audit', async () => {
    if (!token) return;
    const wo = await createWorkOrder();
    expect(wo.status).toBe(WorkOrderStatus.NEW);

    // Assign
    const userTech = await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } });
    const assigned = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/assign`)
      .set(bearer())
      .send({ assigneeId: userTech.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.status).toBe(WorkOrderStatus.ASSIGNED);

    // Transition ASSIGNED -> IN_PROGRESS
    const started = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.IN_PROGRESS, rowVersion: String(assigned.body.rowVersion) });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe(WorkOrderStatus.IN_PROGRESS);
    expect(started.body.startedAt).toBeTruthy();

    // Complete
    const completed = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/complete`)
      .set(bearer())
      .send({
        resultSummary: 'Đã xử lý xong',
        actionTaken: 'Thay thế cầu chì',
        confirmedCause: 'Cầu chì đứt',
      });
    expect(completed.status).toBe(201);
    expect(completed.body.status).toBe(WorkOrderStatus.COMPLETED);
    expect(completed.body.completedAt).toBeTruthy();
    expect(completed.body.resultSummary).toBe('Đã xử lý xong');

    // Audit record work_order.complete
    const audit = await prisma.audit_logs.findFirst({
      where: { object_key: wo.id, action: 'work_order.complete' },
    });
    expect(audit).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // TC-WO-02: invalid transition
  // -------------------------------------------------------------------------
  it('TC-WO-02: NEW -> COMPLETED (skip IN_PROGRESS) returns 422', async () => {
    if (!token) return;
    const wo = await createWorkOrder();
    const res = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.COMPLETED });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WO_INVALID_TRANSITION');
  });

  // -------------------------------------------------------------------------
  // TC-WO-03: cancel require reason
  // -------------------------------------------------------------------------
  it('TC-WO-03: cancel without reason returns 422; cancel with reason -> CANCELLED', async () => {
    if (!token) return;
    const wo = await createWorkOrder();
    const noReason = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/cancel`)
      .set(bearer())
      .send({ reason: '' });
    expect(noReason.status).toBe(422);
    expect(noReason.body.code).toBe('WO_CANCEL_REQUIRES_REASON');

    const cancelled = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/cancel`)
      .set(bearer())
      .send({ reason: 'Không cần thiết nữa' });
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe(WorkOrderStatus.CANCELLED);
    expect(cancelled.body.cancelReason).toBe('Không cần thiết nữa');
    expect(cancelled.body.cancelledAt).toBeTruthy();
    expect(cancelled.body.cancelledBy).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // TC-WO-04: pause/resume via notes, SLA pause-aware
  // -------------------------------------------------------------------------
  it('TC-WO-04: PAUSE_START/PAUSE_END notes + sla-status pause-aware', async () => {
    if (!token) return;
    const wo = await createWorkOrder();
    const userTech = adminUserId;

    // Assign + start
    let res = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/assign`)
      .set(bearer())
      .send({ assigneeId: userTech });
    let currentVer = res.body.rowVersion;
    res = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.IN_PROGRESS, rowVersion: String(currentVer) });
    currentVer = res.body.rowVersion;
    expect(res.body.status).toBe(WorkOrderStatus.IN_PROGRESS);

    // Add PAUSE_START (reason bat buoc)
    const pauseStart = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/notes`)
      .set(bearer())
      .send({
        noteType: WorkOrderNoteType.PAUSE_START,
        note: 'Tạm dừng chờ linh kiện',
        pauseReason: 'WAITING_PART',
      });
    expect(pauseStart.status).toBe(201);

    // Sleep 1.2s để có pause_seconds > 0
    await new Promise((r) => setTimeout(r, 1200));

    // Add PAUSE_END
    const pauseEnd = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/notes`)
      .set(bearer())
      .send({ noteType: WorkOrderNoteType.PAUSE_END, note: 'Đã có linh kiện' });
    expect(pauseEnd.status).toBe(201);

    // SLA status
    const sla = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}/sla-status`)
      .set(bearer());
    expect(sla.status).toBe(200);
    expect(sla.body.status).toBe(WorkOrderStatus.IN_PROGRESS);
    expect(sla.body.pauseSeconds).toBeGreaterThanOrEqual(1);
    expect(sla.body.slaSeconds).toBeGreaterThan(0);
    expect(sla.body.activeElapsedSeconds).toBeLessThanOrEqual(sla.body.slaSeconds);

    // Resume without pause -> 422
    const wo2 = await createWorkOrder();
    await request(app.getHttpServer())
      .patch(`/work-orders/${wo2.id}/assign`)
      .set(bearer())
      .send({ assigneeId: userTech });
    const resumeNoPause = await request(app.getHttpServer())
      .post(`/work-orders/${wo2.id}/notes`)
      .set(bearer())
      .send({ noteType: WorkOrderNoteType.PAUSE_END, note: '?' });
    expect(resumeNoPause.status).toBe(422);
    expect(resumeNoPause.body.code).toBe('WO_RESUME_WITHOUT_PAUSE');
  });

  // -------------------------------------------------------------------------
  // TC-WO-CONCURRENCY: optimistic lock — 2 transition cung rowVersion -> 1 thắng 1 thua
  // -------------------------------------------------------------------------
  it('TC-WO-CONCURRENCY: optimistic lock - second transition with stale rowVersion returns 409', async () => {
    if (!token) return;
    const wo = await createWorkOrder();
    const userTech = adminUserId;
    // Assign + start -> version 2
    let r = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/assign`)
      .set(bearer())
      .send({ assigneeId: userTech });
    r = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.IN_PROGRESS, rowVersion: String(r.body.rowVersion) });
    const freshVersion = r.body.rowVersion;

    // First transition IN_PROGRESS -> COMPLETED thành công
    const ok = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.COMPLETED, rowVersion: String(freshVersion) });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe(WorkOrderStatus.COMPLETED);

    // Second transition cùng version (stale) -> conflict
    const conflict = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.CANCELLED, rowVersion: String(freshVersion) });
    expect(conflict.status).toBe(409);
    expect(conflict.body.code).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // TC-WO-AUTO-RESOLVE: REPAIR COMPLETED -> incident tu RESOLVED
  // -------------------------------------------------------------------------
  it('TC-WO-AUTO-RESOLVE: REPAIR COMPLETED auto-resolves incident (only 1 WO)', async () => {
    if (!token) return;
    const inc = await createIncident();
    expect(inc.status).toBe('NEW');

    const wo = await createWorkOrder(inc.id, adminUserId);
    // Move to IN_PROGRESS
    let r = await request(app.getHttpServer())
      .patch(`/work-orders/${wo.id}/transition`)
      .set(bearer())
      .send({ to: WorkOrderStatus.IN_PROGRESS, rowVersion: String(wo.rowVersion) });
    expect(r.body.status).toBe(WorkOrderStatus.IN_PROGRESS);

    // Complete
    const done = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/complete`)
      .set(bearer())
      .send({ resultSummary: 'OK', actionTaken: 'Test' });
    expect(done.status).toBe(201);

    // Incident -> RESOLVED (auto)
    const incAfter = await request(app.getHttpServer())
      .get(`/incidents/${inc.id}`)
      .set(bearer());
    expect(incAfter.body.status).toBe('RESOLVED');
    expect(incAfter.body.resolved_at ?? incAfter.body.resolvedAt).toBeTruthy();

    // SYSTEM message event
    const sysMsg = incAfter.body.messages.find(
      (m: { message_type: string }) => m.message_type === 'SYSTEM',
    );
    expect(sysMsg).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // TC-WO-PARTIAL-UNIQUE: 2 REPAIR WO cho cùng incident -> 409
  // -------------------------------------------------------------------------
  it('TC-WO-PARTIAL-UNIQUE: 2 REPAIR WO cùng incident (cả 2 mở) -> 409', async () => {
    if (!token) return;
    const inc = await createIncident();
    const first = await createWorkOrder(inc.id);
    expect(first.status ?? first.id).toBeTruthy();

    const second = await request(app.getHttpServer())
      .post('/work-orders')
      .set(bearer())
      .send({
        assetId,
        kind: 'REPAIR',
        incidentId: inc.id,
        creationMode: 'FROM_INCIDENT',
        description: 'Second REPAIR',
        priorityCode: 'MEDIUM',
      });
    expect(second.status).toBe(409);
  });

  // -------------------------------------------------------------------------
  // TC-WO-STUB: filter list
  // -------------------------------------------------------------------------
  it('TC-WO-STUB: list filter by status returns matching items', async () => {
    if (!token) return;
    const res = await request(app.getHttpServer())
      .get(`/work-orders?status=${WorkOrderStatus.COMPLETED}`)
      .set(bearer());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    for (const item of res.body.items) {
      expect(item.status).toBe(WorkOrderStatus.COMPLETED);
    }
  });
});
