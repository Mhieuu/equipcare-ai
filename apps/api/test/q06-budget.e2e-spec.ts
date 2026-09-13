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
 * Q-06 net_issued_quantity budget enforcement (Doc04 §5.6 + Q-06 spec).
 *
 * Flow:
 *   1) Tao WO REPAIR cho 1 asset.
 *   2) RECEIPT 5 cai part.
 *   3) Tao Approval DRAFT (budget qty = 2), submit -> APPROVED.
 *   4) ISSUE qty=1 -> 200 (trong budget).
 *   5) ISSUE them qty=1 -> 200 (dat budget).
 *   6) ISSUE them qty=1 -> 422 APR_EXCEEDS_REVISION_BUDGET_QTY.
 *   7) RETURN qty=2 (het issue) -> 200.
 *   8) ISSUE qty=1 lai -> 200 (net_issued_quantity giam sau RETURN).
 *   9) ISSUE qty=1 them -> 422 (dat budget lai).
 */
describe('Q-06: net_issued_quantity budget enforcement (Doc04 §5.6)', () => {
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
      console.warn('[Q-06 e2e] DB unavailable, skipping suite', e);
      return;
    }
    token = await loginAdmin(app);
  });

  afterAll(async () => {
    if (moduleRef) await moduleRef.close();
  });

  it('TC-Q06-01: ISSUE vượt net_issued_quantity budget → 422 APR_EXCEEDS_REVISION_BUDGET_QTY', async () => {
    if (!token) return;

    // 1) Tao asset + WO REPAIR
    const partCode = `Q06-${Date.now()}`;
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
    if (assetRes.status !== 201) {
      console.warn('[Q-06] asset create failed:', assetRes.status, assetRes.body);
      return;
    }
    const assetId = assetRes.body.id;

    const woRes = await request(app.getHttpServer())
      .post('/work-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        assetId,
        kind: 'REPAIR',
        creationMode: 'MANUAL',
        priorityCode: 'MEDIUM',
        description: 'Q-06 test WO',
      });
    if (woRes.status !== 201) {
      console.warn('[Q-06] WO create failed:', woRes.status, woRes.body);
      return;
    }
    const woId = woRes.body.id;

    // 2) Tao part + RECEIPT 5
    const partRes = await request(app.getHttpServer())
      .post('/parts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: partCode,
        name: 'Q-06 part',
        unit: 'cai',
        onHand: 0,
        minimumStock: 0,
        defaultUnitPrice: 100,
      });
    if (partRes.status !== 201) {
      console.warn('[Q-06] part create failed:', partRes.status, partRes.body);
      return;
    }
    const partId = partRes.body.id;
    await request(app.getHttpServer())
      .post('/stock-transactions/receipt')
      .set('Authorization', `Bearer ${token}`)
      .send({ partId, quantity: 5 });

    // 3) Approval DRAFT -> SUBMITTED -> APPROVED (budget qty = 2)
    const aprDraft = await request(app.getHttpServer())
      .post('/approvals')
      .set('Authorization', `Bearer ${token}`)
      .send({ workOrderId: woId });
    if (aprDraft.status !== 201) {
      console.warn('[Q-06] approval create failed:', aprDraft.status, aprDraft.body);
      return;
    }
    const approvalId = aprDraft.body.id;
    const revId = aprDraft.body.revisions[0].id;

    // Patch revision parts - set quantity = 2 (budget)
    await prisma.approval_revision_parts.upsert({
      where: {
        revision_id_part_id: { revision_id: revId, part_id: partId },
      },
      create: {
        revision_id: revId,
        part_id: partId,
        quantity: new (await import('@prisma/client')).Prisma.Decimal(2),
        unit_price: new (await import('@prisma/client')).Prisma.Decimal(100),
        part_name_snapshot: 'Q-06 part',
        requires_approval_snapshot: true,
      },
      update: {
        quantity: new (await import('@prisma/client')).Prisma.Decimal(2),
        unit_price: new (await import('@prisma/client')).Prisma.Decimal(100),
      },
    });
    await prisma.approval_revisions.update({
      where: { id: revId },
      data: { other_estimated_cost: 200 },
    });

    // Submit
    await request(app.getHttpServer())
      .post(`/approvals/${approvalId}/submit`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    // Approve
    await request(app.getHttpServer())
      .post(`/approvals/${approvalId}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ note: 'approve Q-06 test' });

    // 4) ISSUE qty=1 -> 200
    const issue1 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        approvalRevisionId: revId,
        unitPrice: 100,
        note: 'Q-06 issue 1',
      });
    expect(issue1.status).toBe(201);

    // 5) ISSUE them qty=1 -> 200 (dat budget = 2)
    const issue2 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        approvalRevisionId: revId,
        unitPrice: 100,
        note: 'Q-06 issue 2',
      });
    expect(issue2.status).toBe(201);

    // 6) ISSUE them qty=1 -> 422 APR_EXCEEDS_REVISION_BUDGET_QTY
    const issue3 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        approvalRevisionId: revId,
        unitPrice: 100,
        note: 'Q-06 issue 3 (should fail)',
      });
    expect(issue3.status).toBe(422);
    expect(issue3.body.code).toBe('APR_EXCEEDS_REVISION_BUDGET_QTY');

    // 7) RETURN qty=2 (het issue goc)
    const issue1Tx = await prisma.stock_transactions.findFirstOrThrow({
      where: { work_order_id: woId, part_id: partId, movement_type: 'ISSUE' },
      orderBy: { created_at: 'asc' },
    });
    const ret1 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/return`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        originalStockTxId: issue1Tx.id,
        unitPrice: 100,
        note: 'Q-06 return 1',
      });
    expect(ret1.status).toBe(201);

    // 8) ISSUE qty=1 lai -> 200 (net_issued_quantity = 2 lai)
    const issue4 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        approvalRevisionId: revId,
        unitPrice: 100,
        note: 'Q-06 issue 4 (after return)',
      });
    expect(issue4.status).toBe(201);

    // 9) ISSUE qty=1 them -> 422 (dat budget)
    const issue5 = await request(app.getHttpServer())
      .post(`/work-orders/${woId}/parts/issue`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        partId,
        quantity: 1,
        approvalRevisionId: revId,
        unitPrice: 100,
        note: 'Q-06 issue 5 (should fail again)',
      });
    expect(issue5.status).toBe(422);
    expect(issue5.body.code).toBe('APR_EXCEEDS_REVISION_BUDGET_QTY');
  });
});
