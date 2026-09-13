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

async function ensureDepartmentLocation(prisma: PrismaService) {
  const dept = await prisma.departments.findFirstOrThrow();
  const loc = await prisma.locations.findFirstOrThrow();
  return { dept, loc };
}

describe('Parts + Stock Transactions E2E (M7 - TC-PART-01..07)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let token: string;
  let deptId: string;
  let locId: string;

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      console.warn('[M7 parts] DB unavailable, skipping suite', e);
      return;
    }
    token = await loginAdmin(app);
    const { dept, loc } = await ensureDepartmentLocation(prisma);
    deptId = dept.id;
    locId = loc.id;
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  // TC-PART-01: CRUD part
  it('TC-PART-01: CRUD part (create, get, list, update)', async () => {
    if (!token) return;
    const unique = `PART-${Date.now()}`;
    const createRes = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: unique,
        name: 'Linh kien test M7',
        unit: 'cai',
        departmentId: deptId,
        locationId: locId,
        referencePrice: 100000,
        minimumStock: 5,
        supplierName: 'NCC test',
      });
    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBeDefined();
    expect(createRes.body.code).toBe(unique);
    expect(createRes.body.onHand).toBe('0');

    const id = createRes.body.id;

    // GET /parts/:id
    const getRes = await request(app.getHttpServer())
      .get(`/parts/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe(id);

    // LIST
    const listRes = await request(app.getHttpServer())
      .get(`/parts?isActive=true&departmentId=${deptId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body.items)).toBe(true);
    expect(listRes.body.items.some((p: { id: string }) => p.id === id)).toBe(true);

    // UPDATE
    const updateRes = await request(app.getHttpServer())
      .patch(`/parts/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Linh kien M7 (updated)', minimumStock: 10 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.minimumStock).toBe('10');
    expect(updateRes.body.rowVersion).toBeGreaterThan(createRes.body.rowVersion ?? 1);

    // Duplicate code -> 409
    const dupRes = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: unique,
        name: 'Dup',
        unit: 'cai',
        departmentId: deptId,
        locationId: locId,
      });
    expect(dupRes.status).toBe(409);
  });

  // TC-PART-02: RECEIPT + ADJUST
  it('TC-PART-02: RECEIPT tang on_hand, ADJUST +/-', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `RECEIPT-${Date.now()}`,
        name: 'RECEIPT',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 0,
        minimum_stock: 0,
      },
    });

    const receiptRes = await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 100 });
    expect(receiptRes.status).toBe(201);
    expect(receiptRes.body.onHand).toBe('100');

    // Adjust +50
    const adjUpRes = await request(app.getHttpServer())
      .post('/stock-transactions/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 50, reason: 'kiem ke tang' });
    expect(adjUpRes.status).toBe(201);
    expect(adjUpRes.body.onHand).toBe('150');

    // Adjust -30
    const adjDownRes = await request(app.getHttpServer())
      .post('/stock-transactions/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: -30, reason: 'kiem ke giam' });
    expect(adjDownRes.status).toBe(201);
    expect(adjDownRes.body.onHand).toBe('120');

    // ADJUSTMENT without reason -> 422
    const noReasonRes = await request(app.getHttpServer())
      .post('/stock-transactions/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 1 });
    expect(noReasonRes.status).toBe(422);
  });

  // TC-PART-03: ISSUE / RETURN + concurrency on_hand >= 0 + RETURN exceeds
  it('TC-PART-03: ISSUE / RETURN + concurrency on_hand >= 0 + RETURN exceeds', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `CONC-${Date.now()}`,
        name: 'CONC',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 1000,
        minimum_stock: 0,
      },
    });

    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 10 });

    // WORK_ORDER can tao de issue/return
    const wo = await ensureWorkOrder(prisma, app, token, 'CONC-WO');

    // Plan part vao WO
    const planRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/planned`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, plannedQuantity: 5 });
    expect(planRes.status).toBe(201);

    // Issue 3
    const issueRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 3 });
    expect(issueRes.status).toBe(201);
    expect(issueRes.body.onHand).toBe('7');
    const issueTxId = issueRes.body.transaction.id;

    // List planned parts
    const listPlannedRes = await request(app.getHttpServer())
      .get(`/work-orders/${wo.id}/parts/planned`)
      .set('Authorization', `Bearer ${token}`);
    expect(listPlannedRes.status).toBe(200);
    expect(listPlannedRes.body.length).toBeGreaterThan(0);

    // ISSUE vuot on_hand -> 422
    const issueTooMuchRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 9999 });
    expect(issueTooMuchRes.status).toBe(422);
    expect(issueTooMuchRes.body.code).toMatch(/STOCK_INSUFFICIENT|parts_on_hand_non_negative/);

    // RETURN 1 -> 8
    const returnRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalStockTxId: issueTxId, quantity: 1 });
    expect(returnRes.status).toBe(201);
    expect(returnRes.body.onHand).toBe('8');

    // RETURN exceeds issue goc -> 422
    const returnExceedRes = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalStockTxId: issueTxId, quantity: 9999 });
    expect(returnExceedRes.status).toBe(422);
    expect(returnExceedRes.body.code).toBe('STOCK_RETURN_EXCEEDS_ISSUE');

    // Concurrency: 50 issue 1 cung luc voi on_hand=7 -> chan 1 so (toi da 1 thanh cong)
    // Dung RECEIPT them nhieu de test isolation tot hon.
    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 100 }); // on_hand = 108

    const newWo = await ensureWorkOrder(prisma, app, token, 'CONC-WO-2');
    await request(app.getHttpServer())
      .post(`/work-orders/${newWo.id}/parts/planned`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, plannedQuantity: 200 });

    const concurrencyReqs: Promise<request.Response>[] = [];
    for (let i = 0; i < 50; i++) {
      concurrencyReqs.push(
        request(app.getHttpServer())
          .post(`/work-orders/${newWo.id}/parts/issue`)
          .set('Authorization', `Bearer ${token}`)
          .send({ partId: part.id, quantity: 2 }),
      );
    }
    const results = await Promise.all(concurrencyReqs);
    const successCount = results.filter((r) => r.status === 201).length;
    const failed = results.filter((r) => r.status !== 201);
    expect(successCount).toBeGreaterThan(0);
    expect(successCount).toBeLessThanOrEqual(54);
    expect(failed.length).toBeGreaterThan(0);

    // List stock transactions filter by partId
    const listTx = await request(app.getHttpServer())
      .get(`/stock-transactions?partId=${part.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(listTx.status).toBe(200);
    expect(listTx.body.items.length).toBeGreaterThan(0);
  });

  // TC-PART-04: RETURN sai original (movement khong phai ISSUE) -> 422
  it('TC-PART-04: RETURN sai original stock_tx_id', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `RETINV-${Date.now()}`,
        name: 'RETINV',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 0,
        minimum_stock: 0,
      },
    });
    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 5 });

    const wo = await ensureWorkOrder(prisma, app, token, 'RETINV-WO');
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/planned`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, plannedQuantity: 5 });
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 1 });

    // Lay 1 stock_tx khong phai ISSUE
    const receipts = await prisma.stock_transactions.findMany({
      where: { part_id: part.id, movement_type: 'RECEIPT' },
    });
    expect(receipts.length).toBeGreaterThan(0);
    const recId = receipts[0].id;

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalStockTxId: recId, quantity: 1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('STOCK_RETURN_INVALID_ORIGINAL');
  });

  // TC-PART-05: ISSUE on WO terminal -> 422
  it('TC-PART-05: ISSUE on WO terminal CANCELLED -> 422', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `TERM-${Date.now()}`,
        name: 'TERM',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 0,
        minimum_stock: 0,
      },
    });
    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 5 });

    const wo = await ensureWorkOrder(prisma, app, token, 'TERM-WO');
    // Cancel WO
    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'TEST_CANCEL' });

    await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/planned`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, plannedQuantity: 1 });

    const res = await request(app.getHttpServer())
      .post(`/work-orders/${wo.id}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('WO_TERMINAL_NO_ISSUE');
  });

  // TC-PART-06: low-stock alert: UPDATE on_hand xuong duoi minimum_stock -> notifications
  it('TC-PART-06: low-stock trigger creates notifications on cross threshold', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `LOW-${Date.now()}`,
        name: 'LOW',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 0,
        minimum_stock: 10,
        on_hand: 20,
      },
    });
    // Receipt khong can, da on_hand=20 > min=10
    // Adjust xuong 5 (duoi min)
    const adj = await request(app.getHttpServer())
      .post('/stock-transactions/adjust')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: -15, reason: 'kiem ke test low-stock' });
    expect(adj.status).toBe(201);
    expect(adj.body.onHand).toBe('5');

    // Kiem tra notifications da co low_stock:partId
    const notif = await prisma.notifications.findFirst({
      where: { event_key: `low_stock:${part.id}` },
    });
    expect(notif).not.toBeNull();
    expect(notif?.event_type).toBe('INVENTORY_LOW_STOCK');
    expect(notif?.object_type).toBe('part');
  });

  // TC-PART-07: Ledger view GET /stock-transactions?partId=...
  it('TC-PART-07: Ledger view (GET /stock-transactions)', async () => {
    if (!token) return;
    const part = await prisma.parts.create({
      data: {
        code: `LED-${Date.now()}`,
        name: 'LED',
        unit: 'cai',
        department_id: deptId,
        location_id: locId,
        reference_price: 0,
        minimum_stock: 0,
      },
    });
    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId: part.id, quantity: 7 });

    const res = await request(app.getHttpServer())
      .get(`/stock-transactions?partId=${part.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0]).toHaveProperty('movementType');
    expect(res.body.items[0]).toHaveProperty('quantity');
  });
});

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

async function ensureWorkOrder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app: any,
  token: string,
  codeHint: string,
) {
  // Tao asset de WO co department
  const assetType = await prisma.asset_types.findFirstOrThrow();
  const dept = await prisma.departments.findFirstOrThrow();
  const loc = await prisma.locations.findFirstOrThrow();
  const admin = await prisma.users.findFirstOrThrow({
    where: { login_name: 'admin.bootstrap' },
  });
  const asset = await prisma.assets.create({
    data: {
      code: `M7-${codeHint}-${Date.now()}`,
      name: `Asset ${codeHint}`,
      asset_type_id: assetType.id,
      department_id: dept.id,
      location_id: loc.id,
      manual_state: 'NORMAL',
      created_by: admin.id,
      qr_key: randomUUID(),
    },
  });

  // Tao WO
  const woRes = await request(app.getHttpServer())
    .post('/work-orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      assetId: asset.id,
      kind: 'MAINTENANCE',
      priorityCode: 'MEDIUM',
      creationMode: 'MANUAL',
      description: 'WO for M7 inventory test',
    });
  expect(woRes.status).toBe(201);
  return woRes.body as { id: string };
}
