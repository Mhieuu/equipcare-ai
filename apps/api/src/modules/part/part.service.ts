import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  CreatePartDto,
  UpdatePartDto,
  ListPartsQueryDto,
} from './dto/part.dto';

/**
 * PartService - M7 (Doc04 section 5.6).
 *
 * CRUD + list (filter isActive/lowStock) + low-stock alert.
 * - low-stock alert: trigger DB se ghi notifications khi on_hand < minimum_stock
 *   (auto-generated, khong can service call).
 * - Update part khong thay doi on_hand (chi admin adjustment moi doi).
 */
@Injectable()
export class PartService {
  private readonly logger = new Logger(PartService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(actorId: string, dto: CreatePartDto) {
    const existing = await this.prisma.parts.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw AppError.conflict('Ma linh kien da ton tai', { code: dto.code });
    }
    const dept = await this.prisma.departments.findUnique({
      where: { id: dto.departmentId },
    });
    if (!dept) {
      throw AppError.notFound('Khong tim thay don vi', { departmentId: dto.departmentId });
    }
    const loc = await this.prisma.locations.findUnique({
      where: { id: dto.locationId },
    });
    if (!loc) {
      throw AppError.notFound('Khong tim thay vi tri', { locationId: dto.locationId });
    }

    const created = await this.prisma.parts.create({
      data: {
        code: dto.code,
        name: dto.name,
        unit: dto.unit,
        department_id: dto.departmentId,
        location_id: dto.locationId,
        reference_price: new Prisma.Decimal(dto.referencePrice ?? 0),
        minimum_stock: new Prisma.Decimal(dto.minimumStock ?? 0),
        supplier_name: dto.supplierName ?? null,
        requires_approval: dto.requiresApproval ?? false,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'part.create',
      objectType: 'Part',
      objectKey: created.id,
      newValue: { code: dto.code, name: dto.name },
    });
    return this.toDto(created);
  }

  async list(query: ListPartsQueryDto) {
    const where: Prisma.partsWhereInput = {};
    if (query.isActive === 'true') where.is_active = true;
    if (query.isActive === 'false') where.is_active = false;
    if (query.departmentId) where.department_id = query.departmentId;
    if (query.lowStock === 'true') {
      where.on_hand = { lt: new Prisma.Decimal(0) }; // placeholder; filter bo sung o JS
    }

    const items = await this.prisma.parts.findMany({
      where,
      orderBy: [{ code: 'asc' }],
      take: 200,
    });

    const mapped = items.map((p) => this.toDto(p));
    const filtered = query.lowStock === 'true'
      ? mapped.filter((p) => Number(p.onHand) < Number(p.minimumStock))
      : mapped;

    return { items: filtered, total: filtered.length };
  }

  async get(id: string) {
    const p = await this.prisma.parts.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay linh kien', { id });
    return this.toDto(p);
  }

  async update(actorId: string, id: string, dto: UpdatePartDto) {
    const p = await this.prisma.parts.findUnique({ where: { id } });
    if (!p) throw AppError.notFound('Khong tim thay linh kien', { id });

    if (dto.rowVersion !== undefined && Number(dto.rowVersion) !== p.row_version) {
      throw AppError.conflict(
        'Part da duoc cap nhat boi nguoi khac',
        { currentVersion: p.row_version, providedVersion: Number(dto.rowVersion) },
      );
    }

    const patch: Prisma.partsUpdateInput = { row_version: { increment: 1 } };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.unit !== undefined) patch.unit = dto.unit;
    if (dto.referencePrice !== undefined) {
      patch.reference_price = new Prisma.Decimal(dto.referencePrice);
    }
    if (dto.minimumStock !== undefined) {
      patch.minimum_stock = new Prisma.Decimal(dto.minimumStock);
    }
    if (dto.supplierName !== undefined) patch.supplier_name = dto.supplierName;
    if (dto.requiresApproval !== undefined) {
      patch.requires_approval = dto.requiresApproval;
    }
    if (dto.isActive !== undefined) patch.is_active = dto.isActive;

    const updated = await this.prisma.parts.update({
      where: { id, row_version: p.row_version },
      data: patch,
    });

    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'part.update',
      objectType: 'Part',
      objectKey: id,
      newValue: {
        name: dto.name,
        minimumStock: dto.minimumStock,
        referencePrice: dto.referencePrice,
        isActive: dto.isActive,
      },
    });
    return this.toDto(updated);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private toDto(p: any) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      unit: p.unit,
      departmentId: p.department_id,
      locationId: p.location_id,
      onHand: p.on_hand?.toString() ?? '0',
      minimumStock: p.minimum_stock?.toString() ?? '0',
      referencePrice: p.reference_price?.toString() ?? '0',
      supplierName: p.supplier_name ?? null,
      requiresApproval: p.requires_approval,
      isActive: p.is_active,
      rowVersion: p.row_version,
      updatedAt: p.updated_at instanceof Date ? p.updated_at.toISOString() : p.updated_at,
    };
  }
}
