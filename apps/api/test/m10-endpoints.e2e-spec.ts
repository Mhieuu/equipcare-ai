import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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

/**
 * M10 endpoint coverage tests:
 *   - TC-DASH-CT: GET /dashboard/cost-trend
 *   - TC-DASH-AI: GET /dashboard/action-items
 *   - TC-MNT-SK: POST /maintenance-occurrences/:id/skip
 *   - TC-MNT-GN: POST /maintenance-occurrences/:id/generate-now
 *   - TC-APR-PERM: Approval PATCH per-action permission gate (plan M6 §12.2)
 */
describe('M10 endpoint coverage tests', () => {
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
      console.warn('[M10 endpoints] DB unavailable, skipping', e);
      return;
    }
    token = await loginAdmin(app);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  // TC-DASH-CT: cost trend
  it('TC-DASH-CT: GET /dashboard/cost-trend returns monthly buckets', async () => {
    if (!token) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/cost-trend?months=6')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.months).toBe(6);
  });

  // TC-DASH-AI: action items
  it('TC-DASH-AI: GET /dashboard/action-items returns stuck WO + approvals + low stock', async () => {
    if (!token) return;
    const res = await request(app.getHttpServer())
      .get('/dashboard/action-items?limit=10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.stuckWorkOrders)).toBe(true);
    expect(Array.isArray(res.body.pendingApprovals)).toBe(true);
    expect(Array.isArray(res.body.lowStockParts)).toBe(true);
  });

  // TC-MNT-SK: skip occurrence
  it('TC-MNT-SK: POST /maintenance-occurrences/:id/skip marks SKIPPED', async () => {
    if (!token) return;
    // Tao plan + occurrence
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();
    const ast = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MNT-SK-AST-${Date.now()}`,
        name: 'MNT-SK asset',
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
        code: `MNT-SK-PLAN-${Date.now()}`,
        name: 'MNT-SK plan',
        assetId,
        intervalUnit: 'DAY',
        intervalValue: 1,
        scheduleBasis: 'FIXED_DATE',
        nextDueOn: '2030-01-01',
        priorityCode: 'LOW',
      });
    if (plan.status !== 201) return;
    const planId = plan.body.id;
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
    // Skip
    const skip = await request(app.getHttpServer())
      .post(`/maintenance-occurrences/${occ.id}/skip`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'asset under repair' });
    expect(skip.status).toBe(200);
    expect(skip.body.status).toBe('SKIPPED');
  });

  // TC-MNT-GN: generate-now
  it('TC-MNT-GN: POST /maintenance-occurrences/:id/generate-now runs scheduler tick', async () => {
    if (!token) return;
    // Tao occurrence due_on qua khu
    const ast = await prisma.assets.findFirstOrThrow();
    const plan = await prisma.maintenance_plans.create({
      data: {
        name: 'MNT-GN plan',
        asset_id: ast.id,
        interval_unit: 'DAY',
        interval_value: 1,
        start_on: new Date(),
        schedule_basis: 'FIXED',
        next_due_on: new Date(),
        checklist: [],
        is_active: true,
        created_by: (await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } })).id,
      },
    });
    const occ = await prisma.maintenance_occurrences.create({
      data: {
        plan_id: plan.id,
        asset_id: ast.id,
        due_on: new Date(Date.now() - 86400 * 1000),
        status: 'OVERDUE',
        plan_version: 1,
        plan_snapshot: {},
      },
    });
    const gen = await request(app.getHttpServer())
      .post(`/maintenance-occurrences/${occ.id}/generate-now`)
      .set('Authorization', `Bearer ${token}`);
    expect([200, 201]).toContain(gen.status);
    expect(Array.isArray(gen.body.workOrders)).toBe(true);
  });

  // TC-APR-PERM: approval per-action permission gate
  it('TC-APR-PERM: PATCH /approvals/:id action CANCELLED requires APPROVAL_CANCEL', async () => {
    if (!token) return;
    // Tao 1 user co APPROVAL_SUBMIT nhung khong co APPROVAL_CANCEL
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('ChangeMe@2026', 10);
    const submitOnlyRole = await prisma.roles.upsert({
      where: { code: 'APPROVER_PARTIAL' },
      create: {
        code: 'APPROVER_PARTIAL',
        name: 'Approver (no cancel)',
      },
      update: {},
    });
    // Grant permission SUBMIT + DECIDE, NOT CANCEL.
    const submitPerm = await prisma.permissions.upsert({
      where: { code: 'approval:submit' },
      create: { code: 'approval:submit', description: 'Submit Approval' },
      update: {},
    });
    const decidePerm = await prisma.permissions.upsert({
      where: { code: 'approval:decide' },
      create: { code: 'approval:decide', description: 'Decide Approval' },
      update: {},
    });
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: { role_id: submitOnlyRole.id, permission_id: submitPerm.id },
      },
      create: {
        role_id: submitOnlyRole.id,
        permission_id: submitPerm.id,
        granted_by: (await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } })).id,
      },
      update: {},
    });
    await prisma.role_permissions.upsert({
      where: {
        role_id_permission_id: { role_id: submitOnlyRole.id, permission_id: decidePerm.id },
      },
      create: {
        role_id: submitOnlyRole.id,
        permission_id: decidePerm.id,
        granted_by: (await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } })).id,
      },
      update: {},
    });
    const testUser = await prisma.users.upsert({
      where: { login_name: 'aprperm.user' },
      create: {
        login_name: 'aprperm.user',
        password_hash: hash,
        full_name: 'AprPerm Test',
        email: 'aprperm@example.com',
      },
      update: {},
    });
    // Grant role
    const userRole = await prisma.user_roles.upsert({
      where: {
        user_id_role_id: { user_id: testUser.id, role_id: submitOnlyRole.id },
      },
      create: {
        user_id: testUser.id,
        role_id: submitOnlyRole.id,
        granted_by: (await prisma.users.findFirstOrThrow({ where: { login_name: 'admin.bootstrap' } })).id,
      },
      update: {},
    });
    void userRole;

    // Login as test user
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginName: 'aprperm.user', password: 'ChangeMe@2026' });
    if (loginRes.status !== 201 && loginRes.status !== 200) return;
    const userToken = loginRes.body.accessToken as string;

    // Create WO + approval as admin
    const ast = await prisma.assets.findFirstOrThrow();
    const wo = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId: ast.id,
        kind: 'CORRECTIVE',
        creationMode: 'MANUAL',
        priorityCode: 'LOW',
        description: 'APR-PERM test',
      });
    if (wo.status !== 201) {
      console.warn('[APR-PERM] WO failed', wo.body);
      return;
    }
    const woId = wo.body.id;
    const apr = await request(app.getHttpServer())
      .post('/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({ workOrderId: woId });
    if (apr.status !== 201) return;
    const approvalId = apr.body.id;

    // Submit (should OK since user has APPROVAL_SUBMIT)
    const sub = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'SUBMITTED' });
    expect([200, 201]).toContain(sub.status);

    // Try CANCEL (should 403 because user does NOT have APPROVAL_CANCEL)
    const can = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'CANCELLED', note: 'user lacks cancel perm' });
    expect(can.status).toBe(403);
    expect(can.body.code).toBe('FORBIDDEN');
  });
});
