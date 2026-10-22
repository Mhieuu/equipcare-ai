import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

async function loginAdmin(app: INestApplication): Promise<string> {
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

describe('Dashboard + Reports E2E', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let adminToken: string;

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      console.warn('[Dashboard+Reports] DB unavailable, skipping suite', e);
      return;
    }
    adminToken = await loginAdmin(app);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  // DASHBOARD - smoke
  it('TC-DASH-01: dashboard KPIs', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/kpis')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.openWorkOrders).toBe('number');
    expect(typeof res.body.overdueWorkOrders).toBe('number');
    expect(typeof res.body.pendingApprovals).toBe('number');
    expect(typeof res.body.lowStockParts).toBe('number');
  });

  it('TC-DASH-02: dashboard overdue (returns array)', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/overdue')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('TC-DASH-03: dashboard technician-load', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/technician-load')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('TC-DASH-04: dashboard asset-critical', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/asset-critical?months=12&limit=20')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  // REPORTS
  it('TC-REP-01: CSV incidents export', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/incidents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.text).toMatch(/^﻿code,/);
  });

  it('TC-REP-02: CSV work-orders export', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/work-orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('code,');
  });

  it('TC-REP-03: CSV cost-summary export', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/cost-summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/(workOrderCode|netCost)/);
  });

  it('TC-REP-04: CSV asset-critical export', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/asset-critical')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/(assetId|incidentCount180d|totalCost180d)/);
  });

  it('TC-REP-05: CSV unsupported -> 400', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/unsupported-type')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  it('TC-REP-06: export co permission check (admin OK)', async () => {
    if (!adminToken) return;
    const res = await request(app.getHttpServer())
      .get('/reports/incidents')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  // TC-DATA-01..05: data integrity spot checks
  it('TC-DATA-01 (DT-09): stock_transactions operation_key UNIQUE index', async () => {
    if (!adminToken) return;
    const r = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'stock_transactions_operation_key_key'
      ) as exists`;
    expect(r[0].exists).toBe(true);
  });

  it('TC-DATA-02 (DT-10): approvals revision_no unique per approval (Doc04)', async () => {
    if (!adminToken) return;
    const r = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname LIKE 'approval_revisions_%_key'
           OR conname = 'uniq_approval_revision_no'
      ) as exists`;
    expect(r[0].exists).toBe(true);
  });

  it('TC-DATA-03 (DT-12): parts on_hand >= 0 CHECK', async () => {
    if (!adminToken) return;
    const r = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'parts_on_hand_non_negative'
      ) as exists`;
    expect(r[0].exists).toBe(true);
  });

  it('TC-DATA-04 (DT-17): no-self-approval trigger (FR-APR-09)', async () => {
    if (!adminToken) return;
    const r = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_trigger WHERE tgname = 'trg_approval_events_no_self_approval'
      ) as exists`;
    expect(r[0].exists).toBe(true);
  });

  it('TC-DATA-05 (DT-18): uniq_open_wo_per_occurrence partial unique', async () => {
    if (!adminToken) return;
    const r = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_open_wo_per_occurrence'
      ) as exists`;
    expect(r[0].exists).toBe(true);
  });
});
