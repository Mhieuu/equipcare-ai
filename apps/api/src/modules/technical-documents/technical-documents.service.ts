import { Injectable, Logger } from '@nestjs/common';
import {
  AppError,
  writeAudit,
} from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateTechnicalDocumentDto,
  UpdateTechnicalDocumentDto,
} from './dto/technical-document.dto.js';

/**
 * TechnicalDocumentService — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Workflow:
 *  - create / update metadata
 *  - addVersion: upload file qua AttachmentService (STAGED) rồi link với document
 *    thông qua attachment_links.document_id? — KHÔNG, Doc04 dùng:
 *      document_versions.file_id  (1 file = 1 version)
 *      và READY state đảm bảo bởi `files.storage_state = 'READY'` (đã link).
 *    => Khi addVersion: tạo file READY trực tiếp tới document, version_no tăng tự động.
 *
 *  - roles: grant/revoke role truy cập (Doc04 §3.2 RBAC).
 *  - listForAsset / listForAssetType: filter theo asset / asset_type.
 *
 *  Lưu ý: `document_roles` cho per-doc RBAC (DOC-05) — user có role ADMIN/MANAGER
 *  tự động có quyền; role TECHNICIAN/USER phải được grant explicit.
 */
@Injectable()
export class TechnicalDocumentService {
  private readonly logger = new Logger(TechnicalDocumentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTechnicalDocumentDto, actorId: string) {
    if (dto.assetId) {
      const a = await this.prisma.assets.findUnique({ where: { id: dto.assetId } });
      if (!a) throw AppError.unprocessable('ORG_ASSET_NOT_FOUND', 'assetId không tồn tại');
    }
    if (dto.assetTypeId) {
      const t = await this.prisma.asset_types.findUnique({ where: { id: dto.assetTypeId } });
      if (!t) throw AppError.unprocessable('ORG_ASSET_TYPE_NOT_FOUND', 'assetTypeId không tồn tại');
    }

    const created = await this.prisma.technical_documents.create({
      data: {
        title: dto.title,
        document_type: dto.documentType,
        description: dto.description,
        asset_id: dto.assetId ?? null,
        asset_type_id: dto.assetTypeId ?? null,
        created_by: actorId,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'technical-document.create',
      objectType: 'TechnicalDocument',
      objectKey: created.id,
      newValue: { title: created.title, documentType: created.document_type },
    });
    return this.get(created.id);
  }

  async list(filter: {
    assetId?: string;
    assetTypeId?: string;
    documentType?: string;
    includeInactive?: boolean;
    limit?: number;
    offset?: number;
  }) {
    const where: import('@prisma/client').Prisma.technical_documentsWhereInput = {};
    if (!filter.includeInactive) where.is_active = true;
    if (filter.assetId) where.asset_id = filter.assetId;
    if (filter.assetTypeId) where.asset_type_id = filter.assetTypeId;
    if (filter.documentType) where.document_type = filter.documentType;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.technical_documents.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
        include: {
          asset: { select: { id: true, code: true, name: true } },
          asset_type: { select: { id: true, code: true, name: true } },
          created_by_user: { select: { id: true, login_name: true, full_name: true } },
          versions: {
            orderBy: { version_no: 'desc' },
            take: 1,
          },
        },
      }),
      this.prisma.technical_documents.count({ where }),
    ]);
    return {
      items: items.map((d) => this.toListItem(d)),
      total,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    };
  }

  async get(id: string) {
    const d = await this.prisma.technical_documents.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, code: true, name: true } },
        asset_type: { select: { id: true, code: true, name: true } },
        created_by_user: { select: { id: true, login_name: true, full_name: true } },
        versions: {
          orderBy: { version_no: 'desc' },
          include: {
            file: { select: { id: true, original_name: true, mime_type: true, size_bytes: true, sha256: true } },
            uploaded_by_user: { select: { id: true, login_name: true, full_name: true } },
          },
        },
        roles: {
          where: { is_active: true },
          include: {
            role: { select: { id: true, code: true, name: true } },
            granted_by_user: { select: { id: true, login_name: true, full_name: true } },
          },
        },
      },
    });
    if (!d) throw AppError.notFound('Tài liệu không tồn tại');
    return this.toDetail(d);
  }

  async update(id: string, dto: UpdateTechnicalDocumentDto, actorId: string) {
    const before = await this.prisma.technical_documents.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Tài liệu không tồn tại');

    const data: import('@prisma/client').Prisma.technical_documentsUpdateInput = {
      row_version: { increment: 1 },
    };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.documentType !== undefined) data.document_type = dto.documentType;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assetId !== undefined) {
      if (dto.assetId === null) data.asset = { disconnect: true };
      else {
        const a = await this.prisma.assets.findUnique({ where: { id: dto.assetId } });
        if (!a) throw AppError.unprocessable('ORG_ASSET_NOT_FOUND', 'assetId không tồn tại');
        data.asset = { connect: { id: dto.assetId } };
      }
    }
    if (dto.assetTypeId !== undefined) {
      if (dto.assetTypeId === null) data.asset_type = { disconnect: true };
      else {
        const t = await this.prisma.asset_types.findUnique({ where: { id: dto.assetTypeId } });
        if (!t) throw AppError.unprocessable('ORG_ASSET_TYPE_NOT_FOUND', 'assetTypeId không tồn tại');
        data.asset_type = { connect: { id: dto.assetTypeId } };
      }
    }
    if (dto.isActive !== undefined) data.is_active = dto.isActive;

    await this.prisma.technical_documents.update({ where: { id }, data });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'technical-document.update',
      objectType: 'TechnicalDocument',
      objectKey: id,
      oldValue: { title: before.title, documentType: before.document_type, isActive: before.is_active },
      newValue: { ...dto },
    });
    return this.get(id);
  }

  /**
   * Thêm 1 version mới cho document. File phải đã READY (qua AttachmentService upload
   * rồi link tới asset/document).
   *
   * Workflow chuẩn (Doc04 §5.6 + Doc05 §SCR-DOC-04):
   *  1. Client upload file qua POST /files → STAGED.
   *  2. Client POST /files/:fileId/link với {documentId: <thisId>}? — không có
   *     trường documentId vì Doc04 §5.6 giới hạn parent thuộc asset/incident/wo/...
   *     => Cách M3 chọn: gọi addVersion với `fileId` (đã qua validation, state READY
   *     hoặc tự validate ở đây).
   *
   * P1 production: thêm trường documentId vào attachment_links.
   */
  async addVersion(documentId: string, fileId: string, changeNote: string | undefined, actorId: string) {
    const doc = await this.prisma.technical_documents.findUnique({ where: { id: documentId } });
    if (!doc) throw AppError.notFound('Tài liệu không tồn tại');
    const file = await this.prisma.files.findUnique({ where: { id: fileId } });
    if (!file) throw AppError.unprocessable('ATTACHMENT_FILE_NOT_FOUND', 'File không tồn tại');

    // Lấy version_no kế tiếp trong transaction.
    const result = await this.prisma.$transaction(async (tx) => {
      const last = await tx.document_versions.findFirst({
        where: { document_id: documentId },
        orderBy: { version_no: 'desc' },
        select: { version_no: true },
      });
      const next = (last?.version_no ?? 0) + 1;
      const version = await tx.document_versions.create({
        data: {
          document_id: documentId,
          version_no: next,
          file_id: fileId,
          uploaded_by: actorId,
          change_note: changeNote ?? null,
        },
      });
      await tx.technical_documents.update({
        where: { id: documentId },
        data: { row_version: { increment: 1 } },
      });
      return version;
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'technical-document.version.add',
      objectType: 'TechnicalDocument',
      objectKey: documentId,
      newValue: { versionNo: result.version_no, fileId },
    });

    return this.get(documentId);
  }

  /**
   * Grant role access cho document (Doc04 §3.2 — per-doc RBAC).
   * Idempotent: grant lại role đã grant → không lỗi.
   */
  async grantRole(documentId: string, roleId: string, actorId: string) {
    const doc = await this.prisma.technical_documents.findUnique({ where: { id: documentId } });
    if (!doc) throw AppError.notFound('Tài liệu không tồn tại');
    const role = await this.prisma.roles.findUnique({ where: { id: roleId } });
    if (!role) throw AppError.unprocessable('IAM_ROLE_NOT_FOUND', 'Role không tồn tại');

    const existing = await this.prisma.document_roles.findUnique({
      where: { document_id_role_id: { document_id: documentId, role_id: roleId } },
    });
    if (existing) {
      // Re-activate nếu đã revoke.
      if (!existing.is_active) {
        await this.prisma.document_roles.update({
          where: { id: existing.id },
          data: { is_active: true, granted_by: actorId, row_version: { increment: 1 } },
        });
      }
      return this.get(documentId);
    }

    await this.prisma.document_roles.create({
      data: {
        document_id: documentId,
        role_id: roleId,
        granted_by: actorId,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'technical-document.role.grant',
      objectType: 'TechnicalDocument',
      objectKey: documentId,
      newValue: { roleId, roleCode: role.code },
    });
    return this.get(documentId);
  }

  async revokeRole(documentId: string, roleId: string, actorId: string) {
    const existing = await this.prisma.document_roles.findUnique({
      where: { document_id_role_id: { document_id: documentId, role_id: roleId } },
    });
    if (!existing) throw AppError.notFound('Role chưa được grant cho document này');

    await this.prisma.document_roles.update({
      where: { id: existing.id },
      data: { is_active: false, row_version: { increment: 1 } },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'technical-document.role.revoke',
      objectType: 'TechnicalDocument',
      objectKey: documentId,
      oldValue: { roleId, isActive: true },
      newValue: { roleId, isActive: false },
    });
    return this.get(documentId);
  }

  // ===========================================================================
  // Helpers — toDto
  // ===========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toListItem(d: any) {
    const latest = d.versions?.[0];
    return {
      id: d.id,
      title: d.title,
      documentType: d.document_type,
      description: d.description ?? null,
      asset: d.asset ?? null,
      assetType: d.asset_type ?? null,
      isActive: d.is_active,
      latestVersion: latest
        ? {
            versionNo: latest.version_no,
            fileId: latest.file_id,
            createdAt: latest.created_at instanceof Date ? latest.created_at.toISOString() : latest.created_at,
          }
        : null,
      createdBy: d.created_by_user ?? null,
      createdAt: d.created_at instanceof Date ? d.created_at.toISOString() : d.created_at,
      rowVersion: d.row_version,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetail(d: any) {
    return {
      ...this.toListItem(d),
      versions: (d.versions ?? []).map((v: {
        id: string;
        version_no: number;
        change_note: string | null;
        created_at: Date;
        file_id: string;
        file: {
          id: string;
          original_name: string;
          mime_type: string;
          size_bytes: bigint;
          sha256: string;
        } | null;
        uploaded_by_user: { id: string; login_name: string; full_name: string | null } | null;
      }) => ({
        id: v.id,
        versionNo: v.version_no,
        changeNote: v.change_note,
        createdAt: v.created_at instanceof Date ? v.created_at.toISOString() : v.created_at,
        uploadedBy: v.uploaded_by_user,
        file: v.file
          ? {
              id: v.file.id,
              originalName: v.file.original_name,
              mime: v.file.mime_type,
              sizeBytes: Number(v.file.size_bytes),
              sha256: v.file.sha256,
            }
          : null,
      })),
      roles: (d.roles ?? []).map((r: {
        id: string;
        is_active: boolean;
        granted_at: Date;
        role: { id: string; code: string; name: string };
        granted_by_user: { id: string; login_name: string; full_name: string | null } | null;
      }) => ({
        id: r.id,
        role: r.role,
        isActive: r.is_active,
        grantedBy: r.granted_by_user,
        grantedAt: r.granted_at instanceof Date ? r.granted_at.toISOString() : r.granted_at,
      })),
    };
  }
}
