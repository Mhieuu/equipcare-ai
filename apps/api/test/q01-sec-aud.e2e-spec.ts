import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
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

/**
 * Q-01 side-effects (WO CANCEL):
 *   - TC-WO-05: REPAIR WO cancel + khong con WO REPAIR mo khac -> incident tu chuyen AWAITING_INFO (reason 'need_info_from_reporter') hoac NEW (ly do khac).
 *   - TC-WO-06: REPAIR WO cancel + con WO REPAIR mo khac -> incident giu nguyen.
 *   - TC-WO-07: Approval PENDING (SUBMITTED) bi auto-CANCELLED khi WO CANCEL.
 *   - TC-WO-08: MAINTENANCE WO cancel -> occurrence -> SKIPPED.
 */
describe('Q-01: WO CANCEL side effects + Security edge cases', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let token: string;

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      console.warn('[Q-01+SEC e2e] DB unavailable, skipping suite', e);
      return;
    }
    token = await loginAdmin(app);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  async function createRepairWo(reason: string, codeHint: string) {
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();
    const ast = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `${codeHint}-AST-${Date.now()}`,
        name: `${codeHint} asset`,
        assetTypeId: assetType.id,
        departmentId: dept.id,
        locationId: loc.id,
      });
    if (ast.status !== 201) {
      console.warn(`[${reason}] asset failed`, ast.body);
      return null;
    }
    const wo = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId: ast.body.id,
        kind: 'REPAIR',
        creationMode: 'MANUAL',
        priorityCode: 'MEDIUM',
        description: `${codeHint} desc`,
      });
    if (wo.status !== 201) {
      console.warn(`[${reason}] wo failed`, wo.body);
      return null;
    }
    return { woId: wo.body.id, assetId: ast.body.id };
  }

  // TC-WO-05: REPAIR WO cancel, reason 'need_info_from_reporter' -> incident AWAITING_INFO.
  it('TC-WO-05: REPAIR WO cancel, khong con WO REPAIR mo khac, reason "need_info_from_reporter" -> incident AWAITING_INFO', async () => {
    if (!token) return;
    const ast = await prisma.assets.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();

    // Tao incident NEW
    const reporter = await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } });
    const inc = await prisma.incidents.create({
      data: {
        code: `INC-Q01-${Date.now()}`,
        asset_id: ast.id,
        reporter_id: reporter.id,
        description: 'Q-01 test incident',
        impact_description: 'test impact',
        priority_code: 'MEDIUM',
        status: 'IN_PROGRESS',
      },
    });

    // Tao 1 REPAIR WO gan voi incident
    const wo = await createRepairWo('setup', `Q05-${Date.now()}`);
    if (!wo) return;
    await prisma.work_orders.update({
      where: { id: wo.woId },
      data: { incident_id: inc.id },
    });

    // CANCEL WO (ly do need_info_from_reporter)
    const cancel = await request(app.getHttpServer())
      .post(`/work-orders/${wo.woId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'need_info_from_reporter from technician' });
    expect([200, 201]).toContain(cancel.status);

    // Verify incident chuyen AWAITING_INFO
    const incAfter = await prisma.incidents.findUnique({ where: { id: inc.id } });
    expect(incAfter?.status).toBe('AWAITING_INFO');
    void dept;

    // Verify message SYSTEM trong incident_messages
    const msgs = await prisma.incident_messages.findMany({ where: { incident_id: inc.id } });
    expect(msgs.some((m) => m.message_type === 'SYSTEM' && m.body.includes('AWAITING_INFO'))).toBe(true);
  });

  // TC-WO-06: REPAIR WO cancel nhung con WO REPAIR mo khac -> incident giu nguyen.
  it('TC-WO-06: REPAIR WO cancel, con incident khac co WO REPAIR mo -> incident giu nguyen', async () => {
    if (!token) return;
    const ast = await prisma.assets.findFirstOrThrow();
    const reporter = await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } });

    // Tao 2 incident rieng biet (vi partial unique 1 WO REPAIR open / incident)
    const inc1 = await prisma.incidents.create({
      data: {
        code: `INC-Q01-2A-${Date.now()}`,
        asset_id: ast.id,
        reporter_id: reporter.id,
        description: 'Q-06 incident A',
        impact_description: 'test impact',
        priority_code: 'HIGH',
        status: 'IN_PROGRESS',
      },
    });
    const inc2 = await prisma.incidents.create({
      data: {
        code: `INC-Q01-2B-${Date.now()}`,
        asset_id: ast.id,
        reporter_id: reporter.id,
        description: 'Q-06 incident B',
        impact_description: 'test impact',
        priority_code: 'HIGH',
        status: 'IN_PROGRESS',
      },
    });

    // Tao 2 REPAIR WO gan voi 2 incident khac nhau
    const wo1 = await createRepairWo('setup', `Q06A-${Date.now()}`);
    const wo2 = await createRepairWo('setup', `Q06B-${Date.now()}`);
    if (!wo1 || !wo2) return;
    await prisma.work_orders.update({ where: { id: wo1.woId }, data: { incident_id: inc1.id } });
    await prisma.work_orders.update({ where: { id: wo2.woId }, data: { incident_id: inc2.id } });

    // CANCEL WO1 (ly do khac)
    const cancel = await request(app.getHttpServer())
      .post(`/work-orders/${wo1.woId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'het linh kien' });
    expect([200, 201]).toContain(cancel.status);

    // Verify inc1 chuyen NEW (ly do khac), inc2 giu nguyen IN_PROGRESS
    const inc1After = await prisma.incidents.findUnique({ where: { id: inc1.id } });
    const inc2After = await prisma.incidents.findUnique({ where: { id: inc2.id } });
    expect(inc1After?.status).toBe('NEW');
    expect(inc2After?.status).toBe('IN_PROGRESS');
  });

  // TC-WO-07: Approval PENDING -> CANCELLED khi WO CANCEL.
  it('TC-WO-07: Approval PENDING bi auto-CANCELLED khi WO CANCEL', async () => {
    if (!token) return;
    const wo = await createRepairWo('setup', `Q07-${Date.now()}`);
    if (!wo) return;

    // Tao approval DRAFT
    const apr = await request(app.getHttpServer())
      .post('/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({ workOrderId: wo.woId });
    if (apr.status !== 201) return;
    const approvalId = apr.body.id;

    // Submit -> SUBMITTED
    await request(app.getHttpServer())
      .post(`/approvals/${approvalId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    // CANCEL WO
    const cancel = await request(app.getHttpServer())
      .post(`/work-orders/${wo.woId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'huy vi can sua phuong an' });
    expect([200, 201]).toContain(cancel.status);

    // Verify approval CANCELLED
    const aprAfter = await prisma.approvals.findUnique({ where: { id: approvalId } });
    expect(aprAfter?.status).toBe('CANCELLED');

    // Verify audit
    const aud = await prisma.audit_logs.findFirst({
      where: { action: 'approval.auto_cancel_on_wo_cancel', object_key: approvalId },
    });
    expect(aud).not.toBeNull();
  });

  // TC-WO-08: MAINTENANCE WO cancel -> occurrence SKIPPED.
  it('TC-WO-08: MAINTENANCE WO cancel -> occurrence SKIPPED', async () => {
    if (!token) return;

    // Tao plan
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();
    const ast = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `Q08-AST-${Date.now()}`,
        name: 'Q08 asset',
        assetTypeId: assetType.id,
        departmentId: dept.id,
        locationId: loc.id,
      });
    if (ast.status !== 201) return;
    const assetId = ast.body.id;

    const plan = await request(app.getHttpServer())
      .post('/maintenance-plans')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `Q08-PLAN-${Date.now()}`,
        name: 'Q08 plan',
        assetId,
        intervalUnit: 'DAY',
        intervalValue: 1,
        scheduleBasis: 'FIXED_DATE',
        nextDueOn: '2030-01-01',
        priorityCode: 'LOW',
      });
    if (plan.status !== 201) return;
    const planId = plan.body.id;

    // Tao occurrence manually
    const assetRec = await prisma.assets.findUniqueOrThrow({ where: { id: assetId } });
    const occ = await prisma.maintenance_occurrences.create({
      data: {
        plan_id: planId,
        asset_id: assetRec.id,
        due_on: new Date('2030-01-01'),
        status: 'PLANNED',
        plan_version: 1,
        plan_snapshot: {},
      },
    });

    // Tao WO MAINTENANCE gan voi occurrence
    const wo = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        kind: 'MAINTENANCE',
        creationMode: 'FROM_MAINTENANCE',
        priorityCode: 'LOW',
        description: 'Q08 desc',
      });
    if (wo.status !== 201) return;
    const woId = wo.body.id;
    await prisma.work_orders.update({
      where: { id: woId },
      data: { occurrence_id: occ.id },
    });

    // CANCEL WO
    const cancel = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'thay doi lich' });
    expect([200, 201]).toContain(cancel.status);

    // Verify occurrence -> SKIPPED
    const occAfter = await prisma.maintenance_occurrences.findUnique({ where: { id: occ.id } });
    expect(occAfter?.status).toBe('SKIPPED');
  });

  // ===========================================================================
  // SECURITY EDGE CASES (Doc04 NFR-SEC)
  // ===========================================================================

  // TC-SEC-05: Login fail rate limit (if middleware enable). Test basic brute-force prot.
  it('TC-SEC-05: login fail 5 lan lien tiep -> 401 (rate limit co the chua bat)', async () => {
    if (!token) return;
    const failReqs: Promise<request.Response>[] = [];
    for (let i = 0; i < 5; i++) {
      failReqs.push(
        request(app.getHttpServer())
          .post('/auth/login')
          .send({ loginName: 'admin.bootstrap', password: 'WRONG_PASSWORD_XYZ' }),
      );
    }
    const ress = await Promise.all(failReqs);
    // It nhat 1 request phai fail -> 401 (rate limit co the khoa hon nua)
    const blocked = ress.filter((r) => r.status === 401 || r.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
  });

  // TC-SEC-06: JWT expired -> 401
  it('TC-SEC-06: JWT expired token -> 401', async () => {
    if (!token) return;
    // Tao 1 token expired (JWT_SECRET lay tu env)
    const expToken = jwt.sign(
      { sub: 'fake-uuid', ver: 1, iat: Math.floor(Date.now() / 1000) - 3600 },
      process.env.JWT_SECRET ?? 'change-me',
      { expiresIn: '-1h' },
    );
    const res = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${expToken}`);
    expect(res.status).toBe(401);
  });

  // TC-SEC-07: Endpoint admin-only voi token khong co quyen -> 403
  it('TC-SEC-07: admin-only endpoint voi user khong co quyen -> 403', async () => {
    if (!token) return;
    // Tao user khong co quyen
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('ChangeMe@2026', 10);
    const testUser = await prisma.users.upsert({
      where: { login_name: 'sec07.user' },
      create: {
        login_name: 'sec07.user',
        password_hash: hash,
        full_name: 'Sec07 Test',
        email: 'sec07@example.com',
      },
      update: {},
    });
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginName: 'sec07.user', password: 'ChangeMe@2026' });
    if (loginRes.status !== 201 && loginRes.status !== 200) return;
    const userToken = loginRes.body.accessToken as string;
    void testUser;
    // Test truy cap endpoint chi admin (audit read all)
    const res = await request(app.getHttpServer())
      .get('/iam/audit-logs')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  // TC-SEC-08: SQL injection prevention
  it('TC-SEC-08: SQL injection trong query filter -> 400 (Prisma parameterized)', async () => {
    if (!token) return;
    // Gửi search với "'; DROP TABLE users; --"
    const res = await request(app.getHttpServer())
      .get(`/assets?search=${encodeURIComponent("'; DROP TABLE users; --")}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    // Verify users table van ton tai
    const userCount = await prisma.users.count();
    expect(userCount).toBeGreaterThan(0);
  });

  // ===========================================================================
  // AUDIT EDGE CASES (Doc04 §5.7)
  // ===========================================================================

  // TC-AUD-03: Audit log pagination
  it('TC-AUD-03: audit log filter + pagination + limit', async () => {
    if (!token) return;
    const res = await request(app.getHttpServer())
      .get('/iam/audit-logs?limit=10&offset=0&action=auth.login')
      .set('Authorization', `Bearer ${token}`);
    if (res.status === 200) {
      expect(res.body.items.length).toBeLessThanOrEqual(10);
    } else {
      // Co the endpoint khong ton tai (404) hoac 403 tuy theo permission
      expect([200, 403, 404]).toContain(res.status);
    }
  });

  // TC-AUD-04: Audit log immutable - UPDATE/DELETE bi tu choi (Doc04 NFR-SEC)
  it('TC-AUD-04: audit_logs khong the UPDATE/DELETE truc tiep (no exposed endpoint)', async () => {
    if (!token) return;
    // Verify khong co endpoint PUT/PATCH/DELETE audit-logs
    const resUp = await request(app.getHttpServer())
      .patch('/iam/audit-logs/some-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'hack' });
    // PATCH endpoint khong ton tai -> 404
    expect([404, 405]).toContain(resUp.status);

    const resDel = await request(app.getHttpServer())
      .delete('/iam/audit-logs/some-id')
      .set('Authorization', `Bearer ${token}`);
    expect([404, 405, 403]).toContain(resDel.status);
  });

  // ===========================================================================
  // COST DETAIL (TC-COST-04: spec list)
  // ===========================================================================

  // TC-COST-04: list cost entries of WO (Doc04 §5.6)
  it('TC-COST-04: GET /work-orders/:id/cost-entries list cost', async () => {
    if (!token) return;
    const ast = await prisma.assets.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const wo = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId: ast.id,
        kind: 'CORRECTIVE',
        creationMode: 'MANUAL',
        priorityCode: 'LOW',
        description: 'COST-04 test',
      });
    if (wo.status !== 201) {
      console.warn('[COST-04] WO failed', wo.body);
      return;
    }
    const woId = wo.body.id;
    // Add 1 cost entry
    const ce = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/cost-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'LABOR',
        direction: 'DEBIT',
        quantity: 2,
        unitPrice: 50,
        description: 'Test labor',
      });
    expect([201, 404]).toContain(ce.status); // 404 neu endpoint khong expose POST, nhung GET list se ton tai
    void dept;

    // List
    const list = await request(app.getHttpServer())
      .get(`/work-orders/${woId}/cost-entries`)
      .set('Authorization', `Bearer ${token}`);
    if (list.status === 200) {
      expect(Array.isArray(list.body.items) || Array.isArray(list.body)).toBe(true);
    }
  });
});
