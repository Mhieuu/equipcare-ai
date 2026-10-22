/**
 * Q-06 net_issued_quantity budget enforcement (Doc04 §5.6 + Q-06).
 *
 * Flow:
 *   1) Tao WO REPAIR cho 1 asset.
 *   2) RECEIPT 5 cai part (part.requires_approval=true).
 *   3) Tao Approval DRAFT (budget qty = 2) -> SUBMITTED -> APPROVED.
 *   4) ISSUE qty=1 -> 201 (trong budget).
 *   5) ISSUE them qty=1 -> 201 (dat budget).
 *   6) ISSUE them qty=1 -> 422 APR_EXCEEDS_REVISION_BUDGET_QTY.
 *   7) RETURN qty=2 (het issue) -> 201.
 *   8) ISSUE qty=1 lai -> 201 (net_issued_quantity giam sau RETURN).
 *   9) ISSUE qty=1 them -> 422 (dat budget lai).
 *
 * LUU Y (fix 2026-10-22):
 *   - Payload phai dung DTO that: `POST /parts` KHONG chap `onHand` /
 *     `defaultUnitPrice` va BAT BUOC `departmentId` + `locationId`.
 *   - `POST /work-orders/:woId/parts/issue` chi chap
 *     { partId, quantity, sourceNote? } — truyen `approvalRevisionId` /
 *     `unitPrice` / `note` se bi ValidationPipe (forbidNonWhitelisted) reject
 *     voi 400. Revision duoc service tu resolve tu approval APPROVED cua WO.
 *   - KHONG duoc propose + approve cung 1 user (FR-APR-09 self-approval
 *     forbidden) → dung 2 user: admin.bootstrap (proposer) + probe.manager
 *     (approver).
 *   - Setup that bai (400/500) phai FAIL test, khong `return` im lang —
 *     truoc day test "pass" gia do vi bail out som.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Prisma } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { disconnectPrisma } from '@equipcare/backend-core';

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

describe('Q-06: net_issued_quantity budget enforcement (Doc04 §5.6)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let token = '';
  let managerToken = '';

  beforeAll(async () => {
    const booted = await bootstrap();
    app = booted.app;
    moduleRef = booted.moduleRef;
    prisma = app.get(PrismaService);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });
    expect(res.status).toBeGreaterThanOrEqual(200);
    expect(res.status).toBeLessThan(300);
    token = res.body.accessToken as string;

    // Approver rieng biet: admin.bootstrap la proposer nen khong tu duyet duoc.
    const bcrypt = await import('bcryptjs');
    const hash = await bcrypt.hash('ChangeMe@2026', 10);
    const role = await prisma.roles.findUniqueOrThrow({ where: { code: 'MANAGER' } });
    const adminUser = await prisma.users.findUniqueOrThrow({
      where: { login_name: 'admin.bootstrap' },
    });
    const u = await prisma.users.upsert({
      where: { login_name: 'q06.manager' },
      create: {
        login_name: 'q06.manager',
        password_hash: hash,
        full_name: 'Q-06 Manager',
        email: 'q06.mgr@example.com',
      },
      update: { password_hash: hash },
    });
    await prisma.user_roles.upsert({
      where: { user_id_role_id: { user_id: u.id, role_id: role.id } },
      create: { user_id: u.id, role_id: role.id, granted_by: adminUser.id },
      update: { is_active: true, revoked_at: null },
    });
    await prisma.sessions.deleteMany({ where: { user_id: u.id } });
    const mRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ loginName: 'q06.manager', password: 'ChangeMe@2026' });
    expect(mRes.status).toBeGreaterThanOrEqual(200);
    expect(mRes.status).toBeLessThan(300);
    managerToken = mRes.body.accessToken as string;
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (moduleRef) await moduleRef.close();
    await disconnectPrisma();
  });

  it('TC-Q06-01: ISSUE vượt net_issued_quantity budget → 422 APR_EXCEEDS_REVISION_BUDGET_QTY', async () => {
    // 1) Asset + WO REPAIR
    const assetType = await prisma.asset_types.findFirstOrThrow();
    const dept = await prisma.departments.findFirstOrThrow();
    const loc = await prisma.locations.findFirstOrThrow();

    const assetRes = await request(app.getHttpServer())
      .post('/assets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `Q06-AST-${Date.now()}`,
        name: 'Q06 asset',
        assetTypeId: assetType.id,
        departmentId: dept.id,
        locationId: loc.id,
      });
    expect(assetRes.status).toBe(201);

    const woRes = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId: assetRes.body.id,
        kind: 'REPAIR',
        creationMode: 'MANUAL',
        priorityCode: 'MEDIUM',
        description: 'Q-06 test WO',
      });
    expect(woRes.status).toBe(201);
    const woId = woRes.body.id as string;

    // 2) Part requires_approval=true + RECEIPT 5
    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `Q06-PART-${Date.now()}`,
        name: 'Q-06 part',
        unit: 'cai',
        departmentId: dept.id,
        locationId: loc.id,
        minimumStock: 0,
        referencePrice: 100,
        requiresApproval: true,
      });
    expect(partRes.status).toBe(201);
    const partId = partRes.body.id as string;

    const receiptRes = await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 5 });
    expect(receiptRes.status).toBe(201);

    // 3) Approval DRAFT -> SUBMITTED -> APPROVED (budget qty = 2)
    const aprRes = await request(app.getHttpServer())
      .post('/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({
        workOrderId: woId,
        reason: 'Q-06 can 2 cai de sua',
        actionPlan: '1. Thay 2 cai. 2. Test.',
      });
    expect(aprRes.status).toBe(201);
    const approvalId = aprRes.body.id as string;
    const revId = aprRes.body.revisions?.[0]?.id as string;
    expect(revId).toBeTruthy();

    // Patch revision parts — budget qty = 2 cho part nay.
    await prisma.approval_revision_parts.upsert({
      where: { revision_id_part_id: { revision_id: revId, part_id: partId } },
      create: {
        revision_id: revId,
        part_id: partId,
        quantity: new Prisma.Decimal(2),
        unit_price: new Prisma.Decimal(100),
        part_name_snapshot: 'Q-06 part',
        requires_approval_snapshot: true,
      },
      update: {
        quantity: new Prisma.Decimal(2),
        unit_price: new Prisma.Decimal(100),
      },
    });
    await prisma.approval_revisions.update({
      where: { id: revId },
      data: { other_estimated_cost: 200 },
    });

    const submitRes = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'SUBMITTED' });
    expect(submitRes.status).toBe(200);

    // Approver khac proposer (FR-APR-09).
    const approveRes = await request(app.getHttpServer())
      .patch(`/approvals/${approvalId}`)
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ action: 'APPROVED', note: 'approve Q-06 test' });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.status).toBe('APPROVED');

    // 4) ISSUE qty=1 -> 201 (trong budget)
    const issue1 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 1 });
    expect(issue1.status).toBe(201);

    // 5) ISSUE them qty=1 -> 201 (dat budget = 2)
    const issue2 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 1 });
    expect(issue2.status).toBe(201);

    // 6) ISSUE them qty=1 -> 422 APR_EXCEEDS_REVISION_BUDGET_QTY
    const issue3 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 1 });
    expect(issue3.status).toBe(422);
    expect(issue3.body.code).toBe('APR_EXCEEDS_REVISION_BUDGET_QTY');

    // on_hand phai giam dung 2 (khong phai 3) → transaction 3 bi rollback.
    const partAfter3 = await prisma.parts.findUniqueOrThrow({ where: { id: partId } });
    expect(Number(partAfter3.on_hand)).toBe(3);

    // 7) RETURN qty=1 (hoan tac issue goc — qty khong duoc vuot ISSUE goc)
    const issue1Tx = await prisma.stock_transactions.findFirstOrThrow({
      where: { work_order_id: woId, part_id: partId, movement_type: 'ISSUE' },
      orderBy: { created_at: 'asc' },
    });
    const ret1 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({ originalStockTxId: issue1Tx.id, quantity: 1, reason: 'tra lai 1 cai' });
    expect(ret1.status).toBe(201);

    // 8) ISSUE qty=1 lai -> 201 (net_issued_quantity giam sau RETURN)
    const issue4 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 1 });
    expect(issue4.status).toBe(201);

    // 9) ISSUE qty=1 them -> 422 (dat budget lai)
    const issue5 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 1 });
    expect(issue5.status).toBe(422);
    expect(issue5.body.code).toBe('APR_EXCEEDS_REVISION_BUDGET_QTY');
  });
});
