import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AppError,
  LocalFsAdapter,
  StorageAdapter,
  genObjectKey,
  sanitizeFilename,
  validateUpload,
  writeAudit,
} from '@equipcare/backend-core';
import { STAGED_TTL_MINUTES } from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { LinkAttachmentDto } from './dto/attachment.dto.js';

/**
 * AttachmentService — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Quy trình:
 *  1. `upload()`:
 *     - Validate buffer (magic bytes + MIME + size) qua `validateUpload`.
 *     - Nếu fail → set state REJECTED + blob cleanup; trả AppError.
 *     - Nếu pass → put vào storage + insert `files` row với state STAGED.
 *
 *  2. `link()`:
 *     - Tx: insert `attachment_links` (đúng 1 parent) + update file state READY.
 *     - Audit ghi `attachment.link`.
 *     - 1 file chỉ link được 1 lần — Doc04 §5.6 (multi-parent cho incident
 *       message lẫn incident v.v. sẽ là duplicate).
 *
 *  3. `download()`:
 *     - Check file READY (hoặc user là uploader + STAGED — cho preview).
 *     - Trả buffer (hoặc stream cho endpoint trả 206 Range).
 *
 *  4. `unlink()`:
 *     - Soft delete: set `is_active=false` trên `attachment_links`.
 *     - KHÔNG xóa blob hay đổi state (audit trail nguyên vẹn).
 *
 *  5. `cleanupStaged()` — best-effort, gọi từ worker cron.
 */
@Injectable()
export class AttachmentService {
  private readonly logger = new Logger(AttachmentService.name);
  private readonly storage: StorageAdapter;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    // M3 dùng local FS; production có thể swap sang MinIO/S3 adapter.
    // Override qua LOCAL_STORAGE_DIR env.
    const dir = configService.get<string>('LOCAL_STORAGE_DIR');
    this.storage = new LocalFsAdapter(dir);
  }

  /**
   * Upload 1 file → STAGED (chưa link parent).
   * Fail validation → 422 + rollback (không tạo row, không lưu blob).
   */
  async upload(
    file: Express.Multer.File | { buffer: Buffer; originalname: string; mimetype: string; size: number },
    actorId: string,
  ): Promise<{
    fileId: string;
    objectKey: string;
    originalName: string;
    mime: string;
    sizeBytes: number;
    sha256: string;
    storageState: 'STAGED';
    ttlSeconds: number;
  }> {
    const buf = file.buffer;
    if (!buf || buf.length === 0) {
      throw AppError.unprocessable('ATTACHMENT_EMPTY_FILE', 'File rỗng');
    }

    // 1. Validate (magic bytes + MIME + size).
    let validated;
    try {
      validated = validateUpload({
        buffer: buf,
        declaredMime: file.mimetype,
        originalName: file.originalname,
      });
    } catch (err) {
      // Audit ghi REJECTED (Doc02 §NFR-AUDIT-02: từ chối upload phải có audit).
      try {
        await writeAudit({
          actorId,
          actorType: 'USER',
          action: 'attachment.upload.rejected',
          objectType: 'File',
          objectKey: '(none)',
          newValue: {
            declaredMime: file.mimetype,
            sizeBytes: buf.length,
            error: (err as Error).message,
          },
        });
      } catch (auditErr) {
        this.logger.warn(`Audit ghi fail cho attachment rejected: ${(auditErr as Error).message}`);
      }
      throw err;
    }

    // 2. Sanitize filename + gen objectKey.
    const safeName = sanitizeFilename(file.originalname);
    const ext = safeName.includes('.') ? safeName.split('.').pop()! : '';
    const objectKey = genObjectKey(ext);

    // 3. Persist: blob + DB row.
    await this.storage.put(objectKey, buf);

    const created = await this.prisma.files.create({
      data: {
        object_key: objectKey,
        original_name: safeName,
        mime_type: validated.mime,
        // Prisma BigInt: BigInt literal cần ép kiểu.
        size_bytes: BigInt(validated.sizeBytes),
        sha256: validated.sha256,
        uploaded_by: actorId,
        storage_state: 'STAGED',
      },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'attachment.upload',
      objectType: 'File',
      objectKey: created.id,
      newValue: {
        originalName: safeName,
        mime: validated.mime,
        sizeBytes: validated.sizeBytes,
        sha256: validated.sha256,
      },
    });

    return {
      fileId: created.id,
      objectKey: created.object_key,
      originalName: created.original_name,
      mime: validated.mime,
      sizeBytes: validated.sizeBytes,
      sha256: created.sha256,
      storageState: 'STAGED',
      ttlSeconds: STAGED_TTL_MINUTES * 60,
    };
  }

  /**
   * Link 1 file STAGED → 1 parent → state READY. Trong transaction.
   *
   * Lưu ý:
   *  - 1 file chỉ link được 1 lần (Doc04 §5.6 multi-parent = duplicate).
   *  - Nếu file đã READY → 409 conflict.
   *  - Parent phải tồn tại (FK Restrict; service kiểm tra trước cho error rõ).
   */
  async link(fileId: string, dto: LinkAttachmentDto, actorId: string) {
    // Validate đúng 1 parent.
    const parentFields = ['assetId', 'incidentId', 'incidentMessageId', 'workOrderId', 'approvalRevisionId'] as const;
    const provided = parentFields.filter((f) => dto[f] != null);
    if (provided.length !== 1) {
      throw AppError.unprocessable(
        'ATTACHMENT_PARENT_REQUIRED',
        `Cần chính xác 1 parent (${provided.length} cung cấp)`,
        { provided },
      );
    }

    const file = await this.prisma.files.findUnique({ where: { id: fileId } });
    if (!file) throw AppError.notFound('File không tồn tại');
    if (file.storage_state !== 'STAGED') {
      throw AppError.conflict(
        `File đã ở state ${file.storage_state}; không thể link lại`,
        { code: 'ATTACHMENT_ALREADY_LINKED' },
      );
    }

    // Map parent field → Prisma column.
    const parentFieldToCol = {
      assetId: 'asset_id',
      incidentId: 'incident_id',
      incidentMessageId: 'incident_message_id',
      workOrderId: 'work_order_id',
      approvalRevisionId: 'approval_revision_id',
    } as const;
    const parentCol = parentFieldToCol[provided[0]];
    const parentValue = dto[provided[0]]!;

    // Check parent tồn tại.
    const parentExists = await this.checkParentExists(parentCol, parentValue);
    if (!parentExists) {
      throw AppError.unprocessable(
        'ATTACHMENT_PARENT_NOT_FOUND',
        `${parentCol} = ${parentValue} không tồn tại`,
        { parentCol, parentValue },
      );
    }

    // Tx: insert link + update state.
    const result = await this.prisma.$transaction(async (tx) => {
      const link = await tx.attachment_links.create({
        data: {
          file_id: fileId,
          linked_by: actorId,
          asset_id: dto.assetId ?? null,
          incident_id: dto.incidentId ?? null,
          incident_message_id: dto.incidentMessageId ?? null,
          work_order_id: dto.workOrderId ?? null,
          approval_revision_id: dto.approvalRevisionId ?? null,
        },
      });
      await tx.files.update({
        where: { id: fileId },
        data: { storage_state: 'READY', row_version: { increment: 1 } },
      });
      return link;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'attachment.link',
      objectType: 'File',
      objectKey: fileId,
      newValue: {
        linkId: result.id,
        parentCol,
        parentValue,
      },
    });

    return this.getInfo(fileId);
  }

  /**
   * Đọc thông tin file + link (nếu có).
   */
  async getInfo(fileId: string) {
    const f = await this.prisma.files.findUnique({
      where: { id: fileId },
      include: {
        uploaded_by_user: { select: { id: true, login_name: true, full_name: true } },
        attachment_links: {
          where: { is_active: true },
          take: 1,
        },
      },
    });
    if (!f) throw AppError.notFound('File không tồn tại');

    let link: {
      id: string;
      parentType: 'asset' | 'incident' | 'incident_message' | 'work_order' | 'approval_revision';
      parentId: string;
      linkedBy: string;
      linkedAt: string;
    } | null = null;
    if (f.attachment_links.length > 0) {
      const l = f.attachment_links[0];
      const parentType = (
        l.asset_id ? 'asset' :
        l.incident_id ? 'incident' :
        l.incident_message_id ? 'incident_message' :
        l.work_order_id ? 'work_order' :
        'approval_revision'
      ) as 'asset' | 'incident' | 'incident_message' | 'work_order' | 'approval_revision';
      const parentId =
        l.asset_id ?? l.incident_id ?? l.incident_message_id ?? l.work_order_id ?? l.approval_revision_id ?? '';
      link = {
        id: l.id,
        parentType,
        parentId,
        linkedBy: l.linked_by,
        linkedAt: l.created_at.toISOString(),
      };
    }

    return {
      fileId: f.id,
      objectKey: f.object_key,
      originalName: f.original_name,
      mime: f.mime_type,
      sizeBytes: Number(f.size_bytes),
      sha256: f.sha256,
      storageState: f.storage_state,
      link,
      createdAt: f.created_at.toISOString(),
      uploadedBy: {
        id: f.uploaded_by_user.id,
        loginName: f.uploaded_by_user.login_name,
        fullName: f.uploaded_by_user.full_name ?? null,
      },
    };
  }

  /**
   * Download blob. Chỉ trả về nếu file READY (hoặc actor là uploader + STAGED,
   * để preview sau upload).
   */
  async download(fileId: string, actorId: string, isAdmin: boolean) {
    const f = await this.prisma.files.findUnique({ where: { id: fileId } });
    if (!f) throw AppError.notFound('File không tồn tại');

    if (f.storage_state === 'REJECTED') {
      throw AppError.unprocessable('ATTACHMENT_REJECTED', 'File đã bị từ chối (REJECTED)');
    }
    if (f.storage_state === 'STAGED' && f.uploaded_by !== actorId && !isAdmin) {
      throw AppError.forbidden(
        'File STAGED chỉ uploader hoặc admin mới xem được',
        { code: 'ATTACHMENT_NOT_READY' },
      );
    }

    const buf = await this.storage.get(f.object_key);
    return {
      buffer: buf,
      mime: f.mime_type,
      originalName: f.original_name,
    };
  }

  /**
   * Unlink: soft delete trên `attachment_links.is_active = false`.
   * KHÔNG xóa blob hay đổi state file (audit trail nguyên vẹn).
   */
  async unlink(fileId: string, actorId: string) {
    const link = await this.prisma.attachment_links.findFirst({
      where: { file_id: fileId, is_active: true },
    });
    if (!link) throw AppError.notFound('Không có link active cho file');

    await this.prisma.attachment_links.update({
      where: { id: link.id },
      data: { is_active: false, row_version: { increment: 1 } },
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'attachment.unlink',
      objectType: 'File',
      objectKey: fileId,
      oldValue: { linkId: link.id, isActive: true },
      newValue: { linkId: link.id, isActive: false },
    });
  }

  /**
   * Cleanup STAGED file cũ hơn STAGED_TTL_MINUTES (gọi từ worker cron).
   * Best-effort — lỗi từng file được log nhưng không chặn loop.
   */
  async cleanupStaged(): Promise<{ scanned: number; deleted: number; errors: number }> {
    const cutoff = new Date(Date.now() - STAGED_TTL_MINUTES * 60 * 1000);
    const candidates = await this.prisma.files.findMany({
      where: {
        storage_state: 'STAGED',
        created_at: { lt: cutoff },
      },
      take: 500, // batch size — chạy lại nếu > 500
    });
    let deleted = 0;
    let errors = 0;
    for (const f of candidates) {
      try {
        await this.storage.remove(f.object_key);
        await this.prisma.files.delete({ where: { id: f.id } });
        deleted += 1;
      } catch (err) {
        this.logger.warn(`Cleanup STAGED fail ${f.id}: ${(err as Error).message}`);
        errors += 1;
      }
    }
    return { scanned: candidates.length, deleted, errors };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private async checkParentExists(col: string, value: string): Promise<boolean> {
    let found: unknown = null;
    switch (col) {
      case 'asset_id':
        found = await this.prisma.assets.findUnique({ where: { id: value }, select: { id: true } });
        break;
      case 'incident_id':
        found = await this.prisma.incidents.findUnique({ where: { id: value }, select: { id: true } });
        break;
      case 'incident_message_id':
        found = await this.prisma.incident_messages.findUnique({ where: { id: value }, select: { id: true } });
        break;
      case 'work_order_id':
        found = await this.prisma.work_orders.findUnique({ where: { id: value }, select: { id: true } });
        break;
      case 'approval_revision_id':
        found = await this.prisma.approval_revisions.findUnique({ where: { id: value }, select: { id: true } });
        break;
    }
    return found != null;
  }
}
