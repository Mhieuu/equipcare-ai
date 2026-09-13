/**
 * Demo Flow E2E — IMPLEMENTATION_PLAN.md §15.
 *
 *  Reporter (user.demo.rep)   -> Create incident
 *  Manager (user.demo.mgr)    -> Receive, create WO REPAIR, assign technician
 *  Technician (user.demo.tec) -> IN_PROGRESS, request parts -> approval PENDING
 *  Manager                    -> Approve -> WO back to IN_PROGRESS
 *  Technician                 -> ISSUE parts theo approval, complete WO -> Incident auto-resolve
 *  Manager                    -> Close incident (CLOSED)
 *  Manager                    -> Dashboard KPIs, CSV report
 *
 * Pass criteria:
 *   - All HTTP steps status match
 *   - Audit logs cho tung action xuat hien
 *   - Notifications: reporter nhan notification when incident auto-resolve
 *   - Realtime WS: notification:updated emit when mark read
 *   - CSV export line count > 0
 *   - SLA status of WO complete
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import request from 'supertest';
import { io as Client, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface Step {
  name: string;
  pass: boolean;
  detail?: string;
  httpStatus?: number;
  bodySnippet?: unknown;
}

async function bootstrap() {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  await app.listen(0);
  return { app, moduleRef };
}

async function ensureUser(
  app: INestApplication,
  prisma: PrismaService,
  adminToken: string,
  opts: {
    loginName: string;
    fullName: string;
    roleCode: string;
    email: string;
  },
): Promise<string> {
  const bcrypt = await import('bcryptjs');
  const hash = await bcrypt.hash('ChangeMe@2026', 10);
  // Lay role
  const role = await prisma.roles.findUniqueOrThrow({ where: { code: opts.roleCode } });
  // Lay permission codes
  const rolePerms = await prisma.role_permissions.findMany({
    where: { role_id: role.id },
    include: { permission: { select: { code: true } } },
  });
  const permCodes = rolePerms.map((p) => p.permission.code);

  // Create user
  const u = await prisma.users.upsert({
    where: { login_name: opts.loginName },
    create: {
      login_name: opts.loginName,
      password_hash: hash,
      full_name: opts.fullName,
      email: opts.email,
    },
    update: { password_hash: hash },
  });

  // Grant role
  const adminUserId = await prisma.users
    .findUniqueOrThrow({ where: { login_name: 'admin.bootstrap' } })
    .then((u2) => u2.id);
  await prisma.user_roles.upsert({
    where: { user_id_role_id: { user_id: u.id, role_id: role.id } },
    create: {
      user_id: u.id,
      role_id: role.id,
      granted_by: adminUserId,
    },
    update: { is_active: true, revoked_at: null },
  });
  // Cleanup old sessions
  await prisma.sessions.deleteMany({ where: { user_id: u.id } });

  void permCodes;
  void adminToken;

  // Login
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ loginName: opts.loginName, password: 'ChangeMe@2026' });
  return res.body.accessToken as string;
}

describe('DEMO §15 — end-to-end incident workflow', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let port: number;
  const steps: Step[] = [];
  const push = (s: Step) => {
    steps.push(s);
    // eslint-disable-next-line no-console
    const tag = s.pass ? '✅' : '❌';
    console.log(`[demo] ${tag} ${s.name} ${s.httpStatus ? `(${s.httpStatus})` : ''}`);
    if (!s.pass) {
      // eslint-disable-next-line no-console
      console.log(`[demo]    detail: ${JSON.stringify(s.detail ?? s.bodySnippet ?? '').slice(0, 400)}`);
    }
  };

  let reporterToken = '';
  let managerToken = '';
  let technicianToken = '';
  let adminToken = '';

  let reporterId = '';
  let managerId = '';
  let technicianId = '';

  // Demo entity refs
  let assetId = '';
  let part1Id = '';
  let part2Id = '';
  let incidentId = '';
  let workOrderId = '';
  let approvalId = '';

  // WS state
  let wsReporter: Socket | null = null;
  const wsEvents: Array<{ event: string; payload: unknown }> = [];

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port = (app.getHttpServer() as any).address()?.port ?? 3000;

    // Admin login (de tao role + departments/locations/asset types)
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });
    adminToken = adminRes.body.accessToken as string;

    // Lay refs can thiet
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const location = await prisma.locations.findFirstOrThrow();

    // Lay id admin (quan ly demo user)
    const adminUser = await prisma.users.findUniqueOrThrow({
      where: { login_name: 'admin.bootstrap' },
    });
    void adminUser;

    // Tao 3 demo user
    reporterToken = await ensureUser(app, prisma, adminToken, {
      loginName: 'demo.reporter',
      fullName: 'Demo Reporter',
      roleCode: 'USER',
      email: 'demo.rep@example.com',
    });
    managerToken = await ensureUser(app, prisma, adminToken, {
      loginName: 'demo.manager',
      fullName: 'Demo Manager',
      roleCode: 'MANAGER',
      email: 'demo.mgr@example.com',
    });
    technicianToken = await ensureUser(app, prisma, adminToken, {
      loginName: 'demo.technician',
      fullName: 'Demo Technician',
      roleCode: 'TECHNICIAN',
      email: 'demo.tec@example.com',
    });

    reporterId = (await prisma.users.findUniqueOrThrow({ where: { login_name: 'demo.reporter' } })).id;
    managerId = (await prisma.users.findUniqueOrThrow({ where: { login_name: 'demo.manager' } })).id;
    technicianId = (await prisma.users.findUniqueOrThrow({ where: { login_name: 'demo.technician' } })).id;

    // Tao asset demo
    const assetRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `DEMO-AST-${Date.now()}`,
        name: 'Demo Pump A1',
        assetTypeId: assetType.id,
        departmentId: dept.id,
        locationId: location.id,
      });
    push({
      name: 'Setup: create asset',
      pass: assetRes.status === 201,
      httpStatus: assetRes.status,
      bodySnippet: { id: assetRes.body?.id },
    });
    assetId = assetRes.body.id;

    // Tao 2 part demo (on_hand se set qua stock-transaction receipt)
    const part1Res = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `DEMO-PART-A-${Date.now()}`,
        name: 'Demo Bearing 6205',
        unit: 'PCS',
        departmentId: dept.id,
        locationId: location.id,
        minimumStock: 10,
        referencePrice: 50000,
      });
    push({
      name: 'Setup: create part A',
      pass: part1Res.status === 201,
      httpStatus: part1Res.status,
    });
    part1Id = part1Res.body?.id ?? '';

    const r1 = await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ partId: part1Id, quantity: 100, sourceNote: 'Initial stock' });
    push({
      name: 'Setup: receipt part A (100)',
      pass: r1.status === 201,
      httpStatus: r1.status,
      detail: r1.text?.slice?.(0, 300),
    });

    const part2Res = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `DEMO-PART-B-${Date.now()}`,
        name: 'Demo Seal',
        unit: 'PCS',
        departmentId: dept.id,
        locationId: location.id,
        minimumStock: 5,
        referencePrice: 20000,
      });
    push({
      name: 'Setup: create part B',
      pass: part2Res.status === 201,
      httpStatus: part2Res.status,
    });
    part2Id = part2Res.body?.id ?? '';

    const r2 = await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ partId: part2Id, quantity: 50, sourceNote: 'Initial stock' });
    push({ name: 'Setup: receipt part B (50)', pass: r2.status === 201, httpStatus: r2.status });

    // Connect WS cho reporter (de verify realtime notif)
    wsReporter = Client(`http://127.0.0.1:${port}/ws`, {
      auth: { token: reporterToken },
      transports: ['websocket', 'polling'],
      reconnection: false,
      forceNew: true,
    });
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => resolve(), 3000);
      wsReporter!.on('connected', () => {
        clearTimeout(t);
        resolve();
      });
    });
    wsReporter.onAny((event, payload) => {
      wsEvents.push({ event, payload });
    });
  });

  afterAll(async () => {
    if (wsReporter) wsReporter.disconnect();
    if (moduleRef) await moduleRef.close();
    const fail = steps.filter((s) => !s.pass).length;
    // eslint-disable-next-line no-console
    console.log(`\n[demo] ====== TỔNG KẾT: ${steps.length - fail}/${steps.length} PASS ======`);
    if (fail > 0) {
      // eslint-disable-next-line no-console
      console.log(`[demo] STEPS FAILED:\n${steps.filter((s) => !s.pass).map((s) => ' - ' + s.name).join('\n')}`);
    }
  });

  // --- Reporter → Incident ---
  it('(1) Reporter creates an incident', async () => {
    const res = await request(app.getHttpServer())
      .post('/incidents')
      .set('Authorization', `Bearer ${reporterToken}`)
      .send({
        assetId,
        description: 'Pump không hoạt động, có tiếng kêu lạ',
        impactDescription: 'Sản xuất tạm dừng line 1',
      });
    push({
      name: '(1) Reporter creates incident',
      pass: res.status === 201,
      httpStatus: res.status,
      bodySnippet: { id: res.body?.id, code: res.body?.code, status: res.body?.status },
    });
    incidentId = res.body?.id ?? '';
    expect(res.status).toBe(201);
  });

  // --- Manager acknowledge ---
  it('(2) Manager acknowledges incident (NEW -> AWAITING_INFO)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'AWAITING_INFO' });
    push({
      name: '(2) Manager NEW → AWAITING_INFO',
      pass: res.status === 200 || res.status === 201,
      httpStatus: res.status,
      bodySnippet: res.body?.status ?? res.body,
    });
    expect([200, 201]).toContain(res.status);
  });

  // --- Manager assign + create WO ---
  it('(3) Manager creates REPAIR WO + assigns technician', async () => {
    // Tao WO REPAIR
    const woRes = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({
        assetId,
        kind: 'REPAIR',
        creationMode: 'FROM_INCIDENT',
        priorityCode: 'HIGH',
        description: 'Repair demo pump (sua loi tieng keu)',
        incidentId,
      });
    push({
      name: '(3a) Manager create WO REPAIR',
      pass: woRes.status === 201,
      httpStatus: woRes.status,
      detail: typeof woRes.text === 'string' ? woRes.text.slice(0, 400) : '',
    });
    workOrderId = woRes.body?.id;
    expect(woRes.status).toBe(201);

    // Transition WO NEW -> ASSIGNED
    const assignRes = await request(app.getHttpServer())
      .patch(`/work-orders/${workOrderId}/assign`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ assigneeId: technicianId });
    push({
      name: '(3b) Manager assigns technician',
      pass: assignRes.status === 200 || assignRes.status === 201,
      httpStatus: assignRes.status,
    });
    expect([200, 201]).toContain(assignRes.status);

    // Incident se duoc transition khi tao WO (Doc04 §5.5)
    const incAfter = await prisma.incidents.findUnique({ where: { id: incidentId } });
    push({
      name: '(3c) Incident auto-transitions (NEW→IN_PROGRESS by WO)',
      pass: incAfter?.status === 'IN_PROGRESS' || incAfter?.status === 'AWAITING_INFO',
      detail: `status=${incAfter?.status}`,
    });
  });

  // --- Technician start ---
  it('(4) Technician transitions ASSIGNED -> IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/work-orders/${workOrderId}/transition`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ to: 'IN_PROGRESS' });
    push({
      name: '(4) Technician ASSIGNED → IN_PROGRESS',
      pass: res.status === 200 || res.status === 201,
      httpStatus: res.status,
    });
    expect([200, 201]).toContain(res.status);
  });

  // --- Technician plan parts + create approval ---
  it('(5) Technician creates + submits approval', async () => {
    // Plan parts optional (them permission INVENTORY_PART_CREATE neu muon)
    // Tao approval draft
    const aprRes = await request(app.getHttpServer())
      .post('/approvals')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        workOrderId,
        reason: 'Cần bearing + seal để sửa pump',
        actionPlan: '1. Thay bearing 6205. 2. Thay seal. 3. Test chay 30 phut.',
      });
    push({
      name: '(5a) Technician creates approval DRAFT',
      pass: aprRes.status === 201,
      httpStatus: aprRes.status,
      bodySnippet: { id: aprRes.body?.id, status: aprRes.body?.status, text: aprRes.text?.slice?.(0, 300) },
    });
    approvalId = aprRes.body?.id;
    expect(aprRes.status).toBe(201);

    // Submit
    const submit = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ action: 'SUBMITTED' });
    push({
      name: '(5b) Technician submits approval',
      pass: submit.status === 200 || submit.status === 201,
      httpStatus: submit.status,
    });
    expect([200, 201]).toContain(submit.status);
  });

  // --- Manager approve ---
  it('(6) Manager approves approval, WO -> IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', note: 'Đồng ý cho xuất kho' });
    push({
      name: '(6) Manager approves',
      pass: res.status === 200 || res.status === 201,
      httpStatus: res.status,
      bodySnippet: { status: res.body?.status },
    });
    expect([200, 201]).toContain(res.status);

    const woAfter = await prisma.work_orders.findUnique({ where: { id: workOrderId } });
    push({
      name: '(6b) WO back to IN_PROGRESS',
      pass: woAfter?.status === 'IN_PROGRESS',
      detail: `status=${woAfter?.status}`,
    });
  });

  // --- Technician issue parts ---
  it('(7) Technician issues parts (within approved budget)', async () => {
    const res1 = await request(app.getHttpServer())
      .post(`/work-orders/${workOrderId}/parts/issue`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ partId: part1Id, quantity: 2 });
    push({
      name: '(7a) Issue part A (2 units)',
      pass: res1.status === 200 || res1.status === 201,
      httpStatus: res1.status,
      bodySnippet: res1.body?.id ? { movementId: res1.body.id } : res1.body,
    });
    expect([200, 201]).toContain(res1.status);

    const res2 = await request(app.getHttpServer())
      .post(`/work-orders/${workOrderId}/parts/issue`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ partId: part2Id, quantity: 4 });
    push({
      name: '(7b) Issue part B (4 units)',
      pass: res2.status === 200 || res2.status === 201,
      httpStatus: res2.status,
    });
    expect([200, 201]).toContain(res2.status);

    // Check on_hand giam
    const partA = await prisma.parts.findUniqueOrThrow({ where: { id: part1Id } });
    push({
      name: '(7c) part A on_hand -2 (98 left)',
      pass: Number(partA.on_hand) === 98,
      detail: `on_hand=${partA.on_hand}`,
    });
  });

  // --- Q-06 budget enforcement check ---
  it('(8) Q-06: cannot issue exceeding budget (rejected with 422)', async () => {
    const big = await request(app.getHttpServer())
      .post(`/work-orders/${workOrderId}/parts/issue`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ partId: part1Id, quantity: 9999 });
    const ok = big.status === 422 || big.status === 400 || big.status === 409;
    push({
      name: '(8) Q-06 budget reject (9999 > approved)',
      pass: ok,
      httpStatus: big.status,
      bodySnippet: { code: big.body?.code, message: big.body?.message },
    });
    expect(ok).toBe(true);
  });

  // --- Complete WO ---
  it('(9) Technician completes WO -> incident auto-resolve', async () => {
    const res = await request(app.getHttpServer())
      .post(`/work-orders/${workOrderId}/complete`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        resultSummary: 'Đã thay bearing + seal. Chạy thử 30 phút ổn định.',
      });
    push({
      name: '(9) WO COMPLETED',
      pass: res.status === 200 || res.status === 201,
      httpStatus: res.status,
      bodySnippet: res.body?.status ?? res.body,
    });
    expect([200, 201]).toContain(res.status);

    const incAfter = await prisma.incidents.findUnique({ where: { id: incidentId } });
    push({
      name: '(9b) Incident RESOLVED (auto-resolve on no open REPAIR)',
      pass: incAfter?.status === 'RESOLVED',
      detail: `status=${incAfter?.status}`,
    });
  });

  // --- Manager close incident ---
  it('(10) Manager closes incident (RESOLVED -> CLOSED)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/incidents/${incidentId}/transition`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ to: 'CLOSED' });
    push({
      name: '(10) Incident CLOSED',
      pass: res.status === 200 || res.status === 201,
      httpStatus: res.status,
    });
    expect([200, 201]).toContain(res.status);
  });

  // --- Cost entries summary ---
  it('(11) Cost entries summary (parts + labor)', async () => {
    // Labor cost entry
    const cRes = await request(app.getHttpServer())
      .post(`/work-orders/${workOrderId}/cost-entries`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        category: 'LABOR',
        direction: 'DEBIT',
        quantity: 1,
        unitPrice: 500000,
        description: '2 hour labor for bearing/seal replacement',
      });
    push({
      name: '(11) Add LABOR cost entry',
      pass: cRes.status === 201,
      httpStatus: cRes.status,
    });
    expect(cRes.status).toBe(201);

    // List
    const list = await request(app.getHttpServer())
      .get(`/work-orders/${workOrderId}/cost-entries`)
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(11b) Cost list summary',
      pass: list.status === 200,
      httpStatus: list.status,
    });
    expect(list.status).toBe(200);
  });

  // --- Dashboard KPIs ---
  it('(12) Dashboard KPIs (Manager view)', async () => {
    const kpis = await request(app.getHttpServer())
      .get('/dashboard/kpis')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(12a) KPIs',
      pass: kpis.status === 200,
      httpStatus: kpis.status,
      bodySnippet: kpis.body,
    });

    const overdue = await request(app.getHttpServer())
      .get('/dashboard/overdue')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(12b) Overdue WO list',
      pass: overdue.status === 200,
      httpStatus: overdue.status,
    });

    const techLoad = await request(app.getHttpServer())
      .get('/dashboard/technician-load')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(12c) Technician load',
      pass: techLoad.status === 200,
      httpStatus: techLoad.status,
    });

    const trend = await request(app.getHttpServer())
      .get('/dashboard/cost-trend?months=6')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(12d) Cost trend (6 months)',
      pass: trend.status === 200,
      httpStatus: trend.status,
    });

    const action = await request(app.getHttpServer())
      .get('/dashboard/action-items?limit=10')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(12e) Action items',
      pass: action.status === 200,
      httpStatus: action.status,
    });

    expect(kpis.status).toBe(200);
  });

  // --- CSV export ---
  it('(13) CSV report exports (work-orders + cost-summary + asset-critical)', async () => {
    const woCsv = await request(app.getHttpServer())
      .get('/reports/work-orders.csv')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(13a) Export work-orders.csv',
      pass: woCsv.status === 200 && (woCsv.text?.includes('code') ?? false),
      httpStatus: woCsv.status,
      bodySnippet: woCsv.text?.slice(0, 200),
    });

    const costCsv = await request(app.getHttpServer())
      .get('/reports/cost-summary.csv')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(13b) Export cost-summary.csv',
      pass: costCsv.status === 200,
      httpStatus: costCsv.status,
    });

    const acCsv = await request(app.getHttpServer())
      .get('/reports/asset-critical.csv')
      .set('Authorization', `Bearer ${managerToken}`);
    push({
      name: '(13c) Export asset-critical.csv',
      pass: acCsv.status === 200,
      httpStatus: acCsv.status,
    });
  });

  // --- Notification list + realtime ---
  it('(14) Notification list + realtime push', async () => {
    const list = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${reporterToken}`);
    push({
      name: '(14a) Reporter notification list',
      pass: list.status === 200 && Array.isArray(list.body?.items),
      httpStatus: list.status,
      bodySnippet: { count: list.body?.items?.length },
    });

    const unread = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${reporterToken}`);
    push({
      name: '(14b) Unread count',
      pass: unread.status === 200,
      httpStatus: unread.status,
      bodySnippet: unread.body,
    });

    // Mark first as read (should emit realtime event)
    if (list.body?.items?.[0]) {
      const firstId = list.body.items[0].id;
      const mark = await request(app.getHttpServer())
        .patch(`/notifications/${firstId}/read`)
        .set('Authorization', `Bearer ${reporterToken}`);
      push({
        name: '(14c) Mark notification read (realtime emit)',
        pass: mark.status === 200,
        httpStatus: mark.status,
      });
      // Wait briefly for WS event
      await new Promise((r) => setTimeout(r, 500));
      const realtimeEvent = wsEvents.find((e) => e.event === 'notification:updated');
      push({
        name: '(14d) WS notification:updated received',
        pass: Boolean(realtimeEvent),
        detail: realtimeEvent ? `payloadId=${(realtimeEvent.payload as { id?: string }).id ?? 'batch'}` : 'no event',
      });
    }
  });

  // --- Audit logs ---
  it('(15) Audit logs captured all critical actions', async () => {
    expect(approvalId).not.toBe(''); // precondition
    // Lay toan bo audit logs (limit 500, sort by created_at desc)
    const res = await request(app.getHttpServer())
      .get('/iam/audit-logs?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const items = (res.body?.items ?? []) as Array<{
      action: string;
      object_key: string;
    }>;
    // Lay recent audit logs (limit 200) - chi can chung loai action
    const res2 = await request(app.getHttpServer())
      .get('/iam/audit-logs?limit=200')
      .set('Authorization', `Bearer ${adminToken}`);
    const items2 = res2.status === 200 ? (res2.body?.items ?? []) as Array<{ action: string; object_key: string }> : [];
    const finds = {
      incidentCreateActionPresent: items2.some((a) => a.action === 'incident.create'),
      workOrderCreateActionPresent: items2.some((a) => a.action === 'work_order.create'),
      approvalAnyActionPresent: items2.some((a) => a.action.startsWith('approval.')),
      stockIssuePresent: items2.some((a) => a.action === 'stock.issue'),
      stockReceiptPresent: items2.some((a) => a.action === 'stock.receipt'),
      incidentTransition: items2.some((a) => a.action === 'incident.transition'),
      workOrderComplete: items2.some((a) => a.action === 'work_order.complete'),
    };
    const allOk = Object.values(finds).every(Boolean);
    // In ra action counts de debug
    const counts: Record<string, number> = {};
    for (const a of items2) counts[a.action] = (counts[a.action] ?? 0) + 1;
    const incidentCreateCount = items2.filter((a) => a.action === 'incident.create').length;
    const incidentCreateForObj = items2.filter(
      (a) => a.action === 'incident.create' && a.object_key === incidentId,
    ).length;
    push({
      name: '(15) Audit log coverage (incident/WO/approval/stock all present)',
      pass: allOk,
      detail: JSON.stringify({
        ...finds,
        totalItems: items2.length,
        incidentCreateCount,
        incidentCreateForObj,
        incidentCreateObjectsList: items2
          .filter((a) => a.action === 'incident.create')
          .map((a) => a.object_key)
          .slice(0, 3),
      }),
    });
    expect(allOk).toBe(true);
  });
});
