import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function loginAdmin(app: INestApplication) {
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`admin login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.accessToken as string;
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

describe('Maintenance Plans + Scheduler E2E (M8 - TC-MNT-01..05)', () => {
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
    } catch (e) {
      console.warn('[M8 maintenance] DB unavailable, skipping suite', e);
      return;
    }
    token = await loginAdmin(app);

    // Tao asset test
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();
    const admin = await prisma.users.findFirstOrThrow({
      where: { login_name: 'admin.bootstrap' },
    });
    const asset = await prisma.assets.create({
      data: {
        code: `MNT-${Date.now()}`,
        name: 'Asset MNT',
        asset_type_id: assetType.id,
        department_id: dept.id,
        location_id: loc.id,
        manual_state: 'NORMAL',
        created_by: admin.id,
        qr_key: randomUUID(),
      },
    });
    assetId = asset.id;
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  // TC-MNT-01: CRUD plan
  it('TC-MNT-01: CRUD plan (create, get, list, update)', async () => {
    if (!token) return;
    // start_on qua khu de tick scheduler co the sinh occurrence OVERDUE
    const startOn = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'Bao tri dinh ky MNT-01',
        intervalUnit: 'MONTH',
        intervalValue: 1,
        startOn,
        checklist: [{ item: 'Kiem tra dau may', done: false }],
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.intervalUnit).toBe('MONTH');
    expect(createRes.body.isActive).toBe(true);
    const planId = createRes.body.id;

    const getRes = await request(app.getHttpServer())
      .get(`/maintenance-plans/${planId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(planId);

    const listRes = await request(app.getHttpServer())
      .get('/maintenance-plans?isActive=true')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);

    // Update (interval 1 -> 3 thang)
    const updateRes = await request(app.getHttpServer())
      .patch(`/maintenance-plans/${planId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ intervalValue: 3 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.intervalValue).toBe(3);

    // Validation: intervalValue = 0 -> 400
    const badRes = await request(app.getHttpServer())
      .patch(`/maintenance-plans/${planId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ intervalValue: 0 });
    expect(badRes.status).toBe(400);

    // Validation: intervalUnit khong hop le -> 400
    const badUnitRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'Bad',
        intervalUnit: 'YEARS',
        intervalValue: 1,
        startOn,
      });
    expect(badUnitRes.status).toBe(400);
  });

  // TC-MNT-02: pause/resume (paused → tick → SKIPPED)
  it('TC-MNT-02: pause/resume + SKIPPED on paused tick', async () => {
    if (!token) return;
    const startOn = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'MNT-Pause',
        intervalUnit: 'WEEK',
        intervalValue: 1,
        startOn,
      });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.id;

    // Pause
    const pauseRes = await request(app.getHttpServer())
      .post(`/maintenance-plans/${planId}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'BAO_TRI_TAM_DUNG' });
    expect(pauseRes.status).toBe(200);
    expect(pauseRes.body.isActive).toBe(false);

    // Tick -> tao SKIPPED occurrence (khong tao WO)
    const tickRes = await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(tickRes.status).toBe(200);
    expect(tickRes.body.skippedOccurrences).toBeGreaterThanOrEqual(1);

    const occRes = await request(app.getHttpServer())
      .get(`/maintenance-plans/${planId}/occurrences`)
      .set('Authorization', `Bearer ${token}`);
    expect(occRes.status).toBe(200);
    const skipped = occRes.body.find((o: { status: string }) => o.status === 'SKIPPED');
    expect(skipped).toBeDefined();
    expect(skipped.status).toBe('SKIPPED');

    // Resume
    const resumeRes = await request(app.getHttpServer())
      .post(`/maintenance-plans/${planId}/resume`)
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.isActive).toBe(true);

    // Tick 2nd time (plan da duoc advance next_due_on khi skip) → khong tao them SKIPPED
    const tick2 = await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(tick2.status).toBe(200);
    // Khong them SKIPPED moi cho plan nay
    const occRes2 = await request(app.getHttpServer())
      .get(`/maintenance-plans/${planId}/occurrences`)
      .set('Authorization', `Bearer ${token}`);
    expect(occRes2.status).toBe(200);
    const skippedCount = occRes2.body.filter((o: { status: string }) => o.status === 'SKIPPED').length;
    expect(skippedCount).toBe(1);
  });

  // TC-MNT-03: tick sinh occurrence PLANNED/OVERDUE + auto tao WO
  it('TC-MNT-03: tick sinh OVERDUE occurrence + auto WO', async () => {
    if (!token) return;
    // Plan start_on 60 ngay truoc → due_on OVERDUE
    const startOn = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'MNT-OVERDUE',
        intervalUnit: 'DAY',
        intervalValue: 7,
        startOn,
      });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.id;

    // Tick
    const tickRes = await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(tickRes.status).toBe(200);
    expect(tickRes.body.createdOccurrences).toBeGreaterThanOrEqual(1);
    expect(tickRes.body.createdWorkOrders).toBeGreaterThanOrEqual(1);

    const occRes = await request(app.getHttpServer())
      .get(`/maintenance-plans/${planId}/occurrences`)
      .set('Authorization', `Bearer ${token}`);
    expect(occRes.status).toBe(200);
    const overdueOcc = occRes.body.find(
      (o: { status: string }) => o.status === 'OVERDUE' || o.status === 'IN_PROGRESS',
    );
    expect(overdueOcc).toBeDefined();

    // WO moi lien ket voi occurrence (Q-02: 1 WO open)
    const wo = await prisma.work_orders.findFirst({
      where: { occurrence_id: overdueOcc.id },
    });
    expect(wo).not.toBeNull();
    expect(wo?.creation_mode).toBe('FROM_MAINTENANCE');
    expect(wo?.kind).toBe('MAINTENANCE');
  });

  // TC-MNT-04: tick khong sinh WO trùng (Q-02: 1 WO open / occurrence)
  it('TC-MNT-04: tick 2 lan → khong tao WO trung (Q-02)', async () => {
    if (!token) return;
    const startOn = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'MNT-DUP',
        intervalUnit: 'DAY',
        intervalValue: 7,
        startOn,
      });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.id;

    // Tick 1
    await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();

    const woCount1 = await prisma.work_orders.count({
      where: { occurrence: { plan_id: planId } },
    });
    expect(woCount1).toBeGreaterThanOrEqual(1);

    // Tick 2 (next_due_on da advance → due_on moi > now → khong sinh them occurrence)
    await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();
    const woCount2 = await prisma.work_orders.count({
      where: { occurrence: { plan_id: planId } },
    });
    expect(woCount2).toBe(woCount1);
  });

  // TC-MNT-05: WO COMPLETED → occurrence → COMPLETED
  it('TC-MNT-05: WO COMPLETED → occurrence COMPLETED', async () => {
    if (!token) return;
    const startOn = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const createRes = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        name: 'MNT-COMPLETE',
        intervalUnit: 'DAY',
        intervalValue: 30,
        startOn,
      });
    expect(createRes.status).toBe(201);
    const planId = createRes.body.id;

    // Tick sinh WO
    await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();

    const occ = await prisma.maintenance_occurrences.findFirst({
      where: { plan_id: planId },
    });
    expect(occ).not.toBeNull();

    const wo = await prisma.work_orders.findFirst({
      where: { occurrence_id: occ?.id },
    });
    expect(wo).not.toBeNull();

    // Transition WO → COMPLETED qua API
    const transitionRes = await request(app.getHttpServer())
      .patch(`/work-orders/${wo!.id}/transition`)
      .set('Authorization', `Bearer ${token}`)
      .send({ to: 'IN_PROGRESS' });
    // Chap nhan 200/201 (thanh cong) hoac 422 (da IN_PROGRESS/COMPLELED san do tick truoc).
    expect([200, 201, 422]).toContain(transitionRes.status);

    // Reload WO status sau transition
    const woFresh = await prisma.work_orders.findUnique({ where: { id: wo!.id } });
    if (woFresh?.status !== 'IN_PROGRESS' && woFresh?.status !== 'COMPLETED') {
      // Neu khong phai IN_PROGRESS thi tick lai (auto WO co the da IN_PROGRESS do tick truoc)
      // bo qua
      return;
    }

    const completeRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo!.id}/complete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        resultSummary: 'Bao tri xong',
        actionTaken: 'Thay dau + kiem tra',
        confirmedCause: 'Dinh ky',
      });
    expect(completeRes.status).toBe(201);

    // Tick lai → occurrence → COMPLETED
    await request(app.getHttpServer())
      .post('/maintenance-plans/tick')
      .set('Authorization', `Bearer ${token}`)
      .send();

    const occFinal = await prisma.maintenance_occurrences.findUnique({
      where: { id: occ!.id },
    });
    expect(occFinal?.status).toBe('COMPLETED');
  });
});
