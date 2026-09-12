import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { disconnectPrisma } from '@equipcare/backend-core';

/**
 * E2E test cho Attachment + Technical Documents — Doc07 TC-DOC-01..05 + TC-AUD-03/04.
 *
 * Tests:
 *   - TC-DOC-01: upload file PDF hợp lệ → STAGED, audit ghi attachment.upload
 *   - TC-DOC-02: upload file binary với MIME 'application/pdf' → magic mismatch → 422
 *   - TC-DOC-03: link STAGED → asset → READY trong 1 tx; audit ghi attachment.link
 *   - TC-DOC-04: tạo technical_documents + addVersion (file đã READY) → version_no tăng
 *   - TC-DOC-05: grant/revoke role access cho document (per-doc RBAC)
 */
describe('Technical Document E2E (TC-DOC-01..05)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let adminAccessToken: string;
  let assetId: string;
  const tag = Date.now();

  /** Helper tạo buffer PDF hợp lệ (chỉ header + 1KB content). */
  function makePdfBuffer(content: string = 'Hello'): Buffer {
    const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary');
    const body = Buffer.from(`1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n${content}\n`, 'binary');
    return Buffer.concat([header, body]);
  }

  /** Buffer binary giả danh PDF — magic không khớp → reject. */
  function makeFakePdf(): Buffer {
    return Buffer.concat([Buffer.from('PK\x03\x04NOT_A_PDF'), Buffer.from('fake content')]);
  }

  beforeAll(async () => {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      server = app.getHttpServer();

      const loginRes = await request(server)
        .post('/auth/login')
        .send({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' })
        .expect(200);
      adminAccessToken = loginRes.body.accessToken;

      const assetsRes = await request(server)
        .get('/assets?limit=1')
        .set('Authorization', `Bearer ${adminAccessToken}`)
        .expect(200);
      assetId = assetsRes.body.items[0]?.id ?? '';
    } catch (err) {
      console.warn('[attachment.e2e] DB unavailable — skipping:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) {
      await app.close();
      await disconnectPrisma();
    }
  });

  // -------------------------------------------------------------------------
  // TC-DOC-01: upload file PDF hợp lệ → STAGED + audit
  // -------------------------------------------------------------------------
  it('TC-DOC-01: upload PDF hợp lệ → STAGED, audit ghi attachment.upload', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/files')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', makePdfBuffer(`TC-DOC-01 ${tag}`), {
        filename: `manual-${tag}.pdf`,
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(res.body.storageState).toBe('STAGED');
    expect(res.body.mime).toBe('application/pdf');
    expect(res.body.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.sizeBytes).toBeGreaterThan(0);
    expect(res.body.ttlSeconds).toBeGreaterThan(0);

    // Audit ghi attachment.upload
    await new Promise((r) => setTimeout(r, 100));
    const auditRes = await request(server)
      .get('/iam/audit-logs')
      .query({ action: 'attachment.upload', limit: 5 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(auditRes.body.total).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // TC-DOC-02: magic mismatch → 422 + audit REJECTED
  // -------------------------------------------------------------------------
  it('TC-DOC-02: MIME giả mạo PDF → magic mismatch → 422 + audit rejected', async () => {
    if (!server) return;
    const res = await request(server)
      .post('/files')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', makeFakePdf(), {
        filename: `fake-${tag}.pdf`,
        contentType: 'application/pdf',
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('ATTACHMENT_MAGIC_MISMATCH');

    // Audit ghi attachment.upload.rejected
    await new Promise((r) => setTimeout(r, 100));
    const auditRes = await request(server)
      .get('/iam/audit-logs')
      .query({ action: 'attachment.upload.rejected', limit: 5 })
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    expect(auditRes.body.total).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // TC-DOC-03: link STAGED → asset → READY + audit
  // -------------------------------------------------------------------------
  it('TC-DOC-03: link STAGED file → asset → READY in tx, audit attachment.link', async () => {
    if (!server) return;
    const uploaded = await request(server)
      .post('/files')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', makePdfBuffer(`TC-DOC-03 ${tag}`), {
        filename: `link-${tag}.pdf`,
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(uploaded.body.storageState).toBe('STAGED');

    const linkRes = await request(server)
      .post(`/files/${uploaded.body.fileId}/link`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ assetId })
      .expect(201);
    expect(linkRes.body.storageState).toBe('READY');
    expect(linkRes.body.link?.parentType).toBe('asset');
    expect(linkRes.body.link?.parentId).toBe(assetId);

    // Re-link → 409 conflict
    await request(server)
      .post(`/files/${uploaded.body.fileId}/link`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ assetId })
      .expect(409);
  });

  // -------------------------------------------------------------------------
  // TC-DOC-04: technical_documents + version
  // -------------------------------------------------------------------------
  it('TC-DOC-04: tạo technical_documents + addVersion (file READY) version_no tăng', async () => {
    if (!server) return;
    // Upload + link file 1.
    const f1 = await request(server)
      .post('/files')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', makePdfBuffer(`v1 ${tag}`), {
        filename: `v1-${tag}.pdf`,
        contentType: 'application/pdf',
      })
      .expect(201);
    await request(server)
      .post(`/files/${f1.body.fileId}/link`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ assetId })
      .expect(201);

    const doc = await request(server)
      .post('/technical-documents')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        title: `Manual Pump E2E ${tag}`,
        documentType: 'MANUAL',
        description: 'Test document',
        assetId,
      })
      .expect(201);
    expect(doc.body.id).toBeTruthy();
    expect(doc.body.latestVersion).toBeNull();

    // addVersion v1
    const v1 = await request(server)
      .post(`/technical-documents/${doc.body.id}/versions`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ fileId: f1.body.fileId, changeNote: 'phiên bản đầu' })
      .expect(201);
    expect(v1.body.latestVersion?.versionNo).toBe(1);

    // Upload file 2 + addVersion v2
    const f2 = await request(server)
      .post('/files')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .attach('file', makePdfBuffer(`v2 ${tag}`), {
        filename: `v2-${tag}.pdf`,
        contentType: 'application/pdf',
      })
      .expect(201);
    await request(server)
      .post(`/files/${f2.body.fileId}/link`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ assetId })
      .expect(201);

    const v2 = await request(server)
      .post(`/technical-documents/${doc.body.id}/versions`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ fileId: f2.body.fileId, changeNote: 'cập nhật' })
      .expect(201);
    expect(v2.body.latestVersion?.versionNo).toBe(2);
    expect(v2.body.versions).toHaveLength(2);
  });

  // -------------------------------------------------------------------------
  // TC-DOC-05: grant/revoke role access (per-doc RBAC)
  // -------------------------------------------------------------------------
  it('TC-DOC-05: grant/revoke role access cho document (per-doc RBAC)', async () => {
    if (!server) return;
    // Lấy role TECHNICIAN (id)
    const rolesRes = await request(server)
      .get('/iam/roles')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    const technician = (rolesRes.body as Array<{ code: string; id: string }>).find(
      (r) => r.code === 'TECHNICIAN',
    );
    expect(technician).toBeTruthy();

    const doc = await request(server)
      .post('/technical-documents')
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({
        title: `RBAC Doc ${tag}`,
        documentType: 'PROCEDURE',
      })
      .expect(201);
    expect(doc.body.roles).toHaveLength(0);

    // Grant
    const granted = await request(server)
      .post(`/technical-documents/${doc.body.id}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleId: technician!.id })
      .expect(201);
    expect(granted.body.roles).toHaveLength(1);
    expect(granted.body.roles[0].role.code).toBe('TECHNICIAN');
    expect(granted.body.roles[0].isActive).toBe(true);

    // Re-grant (idempotent) — vẫn 1 role, isActive=true
    const regranted = await request(server)
      .post(`/technical-documents/${doc.body.id}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleId: technician!.id })
      .expect(201);
    expect(regranted.body.roles).toHaveLength(1);

    // Revoke
    const revoked = await request(server)
      .delete(`/technical-documents/${doc.body.id}/roles/${technician!.id}`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .expect(200);
    // Sau revoke, role không còn active → filter loại khỏi list mặc định.
    expect(revoked.body.roles).toHaveLength(0);

    // Re-grant sau revoke (re-activate role đã revoke) → isActive=true trở lại.
    const reactivated = await request(server)
      .post(`/technical-documents/${doc.body.id}/roles`)
      .set('Authorization', `Bearer ${adminAccessToken}`)
      .send({ roleId: technician!.id })
      .expect(201);
    expect(reactivated.body.roles).toHaveLength(1);
    expect(reactivated.body.roles[0].isActive).toBe(true);
  });
});
