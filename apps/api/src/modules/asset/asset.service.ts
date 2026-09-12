import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  AppError,
  writeAudit,
  assertManualStateTransition,
  deriveActivityStatus,
} from '@equipcare/backend-core';
import {
  AssetManualState,
  AssetManualStateLabel,
  ActivityStatusLabel,
  type ActivityStatus,
} from '@equipcare/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateAssetDto,
  ListAssetsQueryDto,
  TransitionAssetStateDto,
  UpdateAssetDto,
} from './dto/asset.dto.js';

/**
 * AssetService — M2 (Doc02 §FR-ASSET-01..09).
 *
 * Tính năng:
 *   - CRUD asset (Doc04 §5.3)
 *   - Lifecycle: manual_state transitions (state machine backend-core/asset.machine.ts)
 *   - QR: `qr_key` UUID; `/assets/{id}/qr` trả PNG base64
 *   - activity_status: derive từ manual_state + (M5+) work_orders đang mở
 *
 * Permission check do controller áp @Permissions().
 *
 * Audit (Doc02 §NFR-AUDIT-01): create/update/state change đều ghi.
 */
@Injectable()
export class AssetService {
  private readonly logger = new Logger(AssetService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // CRUD
  // ===========================================================================

  async list(filter: ListAssetsQueryDto) {
    const where: Prisma.assetsWhereInput = {};
    if (filter.assetTypeId) where.asset_type_id = filter.assetTypeId;
    if (filter.departmentId) where.department_id = filter.departmentId;
    if (filter.locationId) where.location_id = filter.locationId;
    if (filter.manualState) where.manual_state = filter.manualState;
    if (filter.search) {
      where.OR = [
        { code: { contains: filter.search, mode: 'insensitive' } },
        { name: { contains: filter.search, mode: 'insensitive' } },
        { serial_number: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.assets.findMany({
        where,
        orderBy: { code: 'asc' },
        take: filter.limit ?? 50,
        skip: filter.offset ?? 0,
        include: {
          asset_type: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          location: { select: { id: true, code: true, name: true } },
        },
      }),
      this.prisma.assets.count({ where }),
    ]);
    return {
      items: items.map((a) => this.toListDto(a)),
      total,
      limit: filter.limit ?? 50,
      offset: filter.offset ?? 0,
    };
  }

  async get(id: string) {
    const asset = await this.prisma.assets.findUnique({
      where: { id },
      include: {
        asset_type: { select: { id: true, code: true, name: true } },
        department: { select: { id: true, code: true, name: true } },
        location: { select: { id: true, code: true, name: true } },
        created_by_user: { select: { id: true, login_name: true, full_name: true } },
      },
    });
    if (!asset) throw AppError.notFound('Không tìm thấy thiết bị');
    return this.toDetailDto(asset);
  }

  async create(dto: CreateAssetDto, actorId: string) {
    // FK tồn tại (DB Restrict cũng chặn, nhưng check sớm cho error rõ).
    const [type, dept, loc] = await Promise.all([
      this.prisma.asset_types.findUnique({ where: { id: dto.assetTypeId } }),
      this.prisma.departments.findUnique({ where: { id: dto.departmentId } }),
      this.prisma.locations.findUnique({ where: { id: dto.locationId } }),
    ]);
    if (!type) throw AppError.unprocessable('ORG_ASSET_TYPE_NOT_FOUND', 'assetTypeId không tồn tại', { field: 'assetTypeId' });
    if (!dept) throw AppError.unprocessable('ORG_DEPT_NOT_FOUND', 'departmentId không tồn tại', { field: 'departmentId' });
    if (!loc) throw AppError.unprocessable('ORG_LOCATION_NOT_FOUND', 'locationId không tồn tại', { field: 'locationId' });

    const exists = await this.prisma.assets.findUnique({ where: { code: dto.code } });
    if (exists) throw AppError.conflict('code đã tồn tại', { field: 'code' });

    const created = await this.prisma.assets.create({
      data: {
        code: dto.code,
        name: dto.name,
        asset_type_id: dto.assetTypeId,
        department_id: dto.departmentId,
        location_id: dto.locationId,
        serial_number: dto.serialNumber,
        supplier_name: dto.supplierName,
        purchased_on: dto.purchasedOn ? new Date(dto.purchasedOn) : undefined,
        commissioned_on: dto.commissionedOn ? new Date(dto.commissionedOn) : undefined,
        warranty_until: dto.warrantyUntil ? new Date(dto.warrantyUntil) : undefined,
        specifications: dto.specifications
          ? (dto.specifications as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        created_by: actorId,
        // qr_key: truyền tường minh thay vì rely on @default(uuid()) (TS không bắt default).
        qr_key: randomUUID(),
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'asset.create',
      objectType: 'Asset',
      objectKey: created.id,
      newValue: { code: created.code, name: created.name, assetTypeId: dto.assetTypeId },
    });
    return this.get(created.id);
  }

  async update(id: string, dto: UpdateAssetDto, actorId: string) {
    const before = await this.prisma.assets.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Không tìm thấy thiết bị');

    // FK check cho mỗi trường thay đổi.
    if (dto.assetTypeId) {
      const t = await this.prisma.asset_types.findUnique({ where: { id: dto.assetTypeId } });
      if (!t) throw AppError.unprocessable('ORG_ASSET_TYPE_NOT_FOUND', 'assetTypeId không tồn tại', { field: 'assetTypeId' });
    }
    if (dto.departmentId) {
      const d = await this.prisma.departments.findUnique({ where: { id: dto.departmentId } });
      if (!d) throw AppError.unprocessable('ORG_DEPT_NOT_FOUND', 'departmentId không tồn tại', { field: 'departmentId' });
    }
    if (dto.locationId) {
      const l = await this.prisma.locations.findUnique({ where: { id: dto.locationId } });
      if (!l) throw AppError.unprocessable('ORG_LOCATION_NOT_FOUND', 'locationId không tồn tại', { field: 'locationId' });
    }

    const data: Prisma.assetsUpdateInput = { row_version: { increment: 1 } };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.assetTypeId !== undefined) data.asset_type = { connect: { id: dto.assetTypeId } };
    if (dto.departmentId !== undefined) data.department = { connect: { id: dto.departmentId } };
    if (dto.locationId !== undefined) data.location = { connect: { id: dto.locationId } };
    if (dto.serialNumber !== undefined) data.serial_number = dto.serialNumber;
    if (dto.supplierName !== undefined) data.supplier_name = dto.supplierName;
    if (dto.purchasedOn !== undefined) data.purchased_on = dto.purchasedOn ? new Date(dto.purchasedOn) : null;
    if (dto.commissionedOn !== undefined) data.commissioned_on = dto.commissionedOn ? new Date(dto.commissionedOn) : null;
    if (dto.warrantyUntil !== undefined) data.warranty_until = dto.warrantyUntil ? new Date(dto.warrantyUntil) : null;
    if (dto.specifications !== undefined) {
      data.specifications = dto.specifications
        ? (dto.specifications as Prisma.InputJsonValue)
        : Prisma.JsonNull;
    }

    await this.prisma.assets.update({ where: { id }, data });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'asset.update',
      objectType: 'Asset',
      objectKey: id,
      oldValue: { name: before.name },
      newValue: { ...dto },
    });
    return this.get(id);
  }

  // ===========================================================================
  // Lifecycle (FR-ASSET-05 + FR-ASSET-07)
  // ===========================================================================

  /**
   * Chuyển manual_state qua state machine. RETIRED yêu cầu `reason`.
   * Audit + lưu `state_reason`.
   */
  async transitionState(id: string, dto: TransitionAssetStateDto, actorId: string) {
    const before = await this.prisma.assets.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Không tìm thấy thiết bị');

    const from = before.manual_state as AssetManualState;
    const to = dto.to as AssetManualState;
    assertManualStateTransition(from, to);

    if (to === AssetManualState.RETIRED && !dto.reason) {
      throw AppError.unprocessable(
        'ASSET_RETIRED_REQUIRES_REASON',
        'Cần nhập lý do khi chuyển sang RETIRED (FR-ASSET-07)',
        { field: 'reason' },
      );
    }

    await this.prisma.assets.update({
      where: { id },
      data: {
        manual_state: to,
        state_reason: dto.reason ?? null,
        row_version: { increment: 1 },
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'asset.state.change',
      objectType: 'Asset',
      objectKey: id,
      oldValue: { manualState: from },
      newValue: { manualState: to, reason: dto.reason ?? null },
    });
    return this.get(id);
  }

  // ===========================================================================
  // QR (FR-ASSET-06)
  // ===========================================================================

  /**
   * Trả PNG QR code dạng data URL (base64 inline).
   * URL trỏ về FE route `/assets/{qr_key}` (mobile scan → mở detail).
   *
   * Lưu ý: `qr_key` đã là UUID unique (Doc04 §5.3); sinh tại insert.
   * Khi in nhãn, frontend tự render URL này thành QR.
   */
  async getQrPng(id: string): Promise<{ qrKey: string; dataUrl: string; format: 'png' }> {
    const asset = await this.prisma.assets.findUnique({
      where: { id },
      select: { id: true, code: true, qr_key: true },
    });
    if (!asset) throw AppError.notFound('Không tìm thấy thiết bị');
    // Lazy require để giảm startup time và tránh crash khi lib chưa cài.
    const QRCode = (await import('qrcode')).default;
    const url = `equipcare://assets/${asset.qr_key}`;
    const dataUrl = await QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6,
    });
    return { qrKey: asset.qr_key, dataUrl, format: 'png' };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  // Type-safe với includes — dùng any cho phần include vì Prisma return type phức tạp.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toListDto(a: any) {
    const manualState = a.manual_state as AssetManualState;
    const activityStatus: ActivityStatus = deriveActivityStatus(manualState);
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      assetType: a.asset_type ?? null,
      department: a.department ?? null,
      location: a.location ?? null,
      serialNumber: a.serial_number ?? null,
      supplierName: a.supplier_name ?? null,
      qrKey: a.qr_key,
      manualState,
      manualStateLabel: AssetManualStateLabel[manualState],
      activityStatus,
      activityStatusLabel: ActivityStatusLabel[activityStatus],
      rowVersion: a.row_version,
      createdAt: a.created_at instanceof Date ? a.created_at.toISOString() : a.created_at,
      updatedAt: a.updated_at instanceof Date ? a.updated_at.toISOString() : a.updated_at,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDetailDto(a: any) {
    return {
      ...this.toListDto(a),
      purchasedOn: a.purchased_on
        ? (a.purchased_on instanceof Date ? a.purchased_on.toISOString().slice(0, 10) : a.purchased_on)
        : null,
      commissionedOn: a.commissioned_on
        ? (a.commissioned_on instanceof Date ? a.commissioned_on.toISOString().slice(0, 10) : a.commissioned_on)
        : null,
      warrantyUntil: a.warranty_until
        ? (a.warranty_until instanceof Date ? a.warranty_until.toISOString().slice(0, 10) : a.warranty_until)
        : null,
      specifications: a.specifications ?? {},
      stateReason: a.state_reason ?? null,
      createdBy: a.created_by_user ?? null,
    };
  }
}
