import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, writeAudit } from '@equipcare/backend-core';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreateAssetTypeDto,
  CreateDepartmentDto,
  CreateLocationDto,
  UpdateAssetTypeDto,
  UpdateDepartmentDto,
  UpdateLocationDto,
} from './dto/org.dto.js';

/**
 * OrganizationService — departments / locations / asset_types (M1.C).
 *
 * Mỗi entity đều có: list, get, create, update. Locations có thêm getTree.
 * Permission check do controller áp @Permissions().
 *
 * Audit (Doc02 §NFR-AUDIT-01): create/update ghi audit.
 */
interface LocationTreeNode {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  children: LocationTreeNode[];
}

@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // Departments
  // ===========================================================================

  listDepartments(filter: { isActive?: boolean }) {
    const where: Prisma.departmentsWhereInput = {};
    if (filter.isActive === true) where.is_active = true;
    else if (filter.isActive === false) where.is_active = false;
    return this.prisma.departments.findMany({ where, orderBy: { code: 'asc' } });
  }

  getDepartment(id: string) {
    return this.prisma.departments.findUnique({
      where: { id },
      include: { users: { where: { is_locked: false }, take: 5, orderBy: { full_name: 'asc' } } },
    });
  }

  async createDepartment(dto: CreateDepartmentDto, actorId: string) {
    const exists = await this.prisma.departments.findUnique({ where: { code: dto.code } });
    if (exists) throw AppError.conflict('code đã tồn tại', { field: 'code' });

    const created = await this.prisma.departments.create({
      data: { code: dto.code, name: dto.name },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.department.create',
      objectType: 'Department',
      objectKey: created.id,
      newValue: { code: created.code, name: created.name },
    });
    return created;
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, actorId: string) {
    const before = await this.prisma.departments.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Không tìm thấy phòng ban');

    const updated = await this.prisma.departments.update({
      where: { id },
      data: { name: dto.name, is_active: dto.isActive ?? before.is_active },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.department.update',
      objectType: 'Department',
      objectKey: id,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: updated.name, is_active: updated.is_active },
    });
    return updated;
  }

  // ===========================================================================
  // Locations (có parent → tree)
  // ===========================================================================

  listLocations(filter: { isActive?: boolean }) {
    const where: Prisma.locationsWhereInput = {};
    if (filter.isActive === true) where.is_active = true;
    else if (filter.isActive === false) where.is_active = false;
    return this.prisma.locations.findMany({ where, orderBy: { code: 'asc' } });
  }

  /**
   * Build location tree (1 query, build tại memory).
   * Doc02 §FR-ORG-02: SCR-ORG-02b "Cơ cấu tổ chức & vị trí".
   *
   * Output: cây các root location, mỗi node có `children` đệ quy.
   */
  async getLocationTree(): Promise<LocationTreeNode[]> {
    const all = await this.prisma.locations.findMany({ orderBy: { code: 'asc' } });
    const byParent = new Map<string | null, typeof all>();
    for (const r of all) {
      const arr = byParent.get(r.parent_id) ?? [];
      arr.push(r);
      byParent.set(r.parent_id, arr);
    }
    const build = (parentId: string | null): LocationTreeNode[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        isActive: c.is_active,
        children: build(c.id),
      }));
    };
    return build(null);
  }

  getLocation(id: string) {
    return this.prisma.locations.findUnique({ where: { id } });
  }

  async createLocation(dto: CreateLocationDto, actorId: string) {
    const exists = await this.prisma.locations.findUnique({ where: { code: dto.code } });
    if (exists) throw AppError.conflict('code đã tồn tại', { field: 'code' });

    // Verify parent tồn tại (FK Restrict).
    if (dto.parentId) {
      const parent = await this.prisma.locations.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw AppError.unprocessable(
        'ORG_LOCATION_PARENT_NOT_FOUND',
        'parentId không tồn tại',
        { field: 'parentId' },
      );
    }

    const created = await this.prisma.locations.create({
      data: { code: dto.code, name: dto.name, parent_id: dto.parentId },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.location.create',
      objectType: 'Location',
      objectKey: created.id,
      newValue: { code: created.code, name: created.name, parentId: dto.parentId },
    });
    return created;
  }

  async updateLocation(id: string, dto: UpdateLocationDto, actorId: string) {
    const before = await this.prisma.locations.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Không tìm thấy vị trí');

    // Verify parent tồn tại + không phải chính nó (cycle).
    if (dto.parentId !== undefined && dto.parentId !== null) {
      if (dto.parentId === id) {
        throw AppError.unprocessable(
          'ORG_LOCATION_CYCLE',
          'parentId không được là chính location này',
          { field: 'parentId' },
        );
      }
      const parent = await this.prisma.locations.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw AppError.unprocessable(
        'ORG_LOCATION_PARENT_NOT_FOUND',
        'parentId không tồn tại',
        { field: 'parentId' },
      );
    }

    const data: Prisma.locationsUpdateInput = {
      name: dto.name,
      is_active: dto.isActive ?? before.is_active,
    };
    if (dto.parentId !== undefined) {
      data.parent = dto.parentId === null
        ? { disconnect: true }
        : { connect: { id: dto.parentId } };
    }

    const updated = await this.prisma.locations.update({ where: { id }, data });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.location.update',
      objectType: 'Location',
      objectKey: id,
      oldValue: { name: before.name, parent_id: before.parent_id, is_active: before.is_active },
      newValue: { name: updated.name, parent_id: updated.parent_id, is_active: updated.is_active },
    });
    return updated;
  }

  // ===========================================================================
  // Asset types
  // ===========================================================================

  listAssetTypes(filter: { isActive?: boolean }) {
    const where: Prisma.asset_typesWhereInput = {};
    if (filter.isActive === true) where.is_active = true;
    else if (filter.isActive === false) where.is_active = false;
    return this.prisma.asset_types.findMany({ where, orderBy: { code: 'asc' } });
  }

  getAssetType(id: string) {
    return this.prisma.asset_types.findUnique({ where: { id } });
  }

  async createAssetType(dto: CreateAssetTypeDto, actorId: string) {
    const exists = await this.prisma.asset_types.findUnique({ where: { code: dto.code } });
    if (exists) throw AppError.conflict('code đã tồn tại', { field: 'code' });

    const created = await this.prisma.asset_types.create({
      data: { code: dto.code, name: dto.name, description: dto.description },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.asset-type.create',
      objectType: 'AssetType',
      objectKey: created.id,
      newValue: { code: created.code, name: created.name },
    });
    return created;
  }

  async updateAssetType(id: string, dto: UpdateAssetTypeDto, actorId: string) {
    const before = await this.prisma.asset_types.findUnique({ where: { id } });
    if (!before) throw AppError.notFound('Không tìm thấy loại thiết bị');

    const updated = await this.prisma.asset_types.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description ?? before.description,
        is_active: dto.isActive ?? before.is_active,
      },
    });
    await writeAudit({
      actorId,
      actorType: 'USER',
      action: 'org.asset-type.update',
      objectType: 'AssetType',
      objectKey: id,
      oldValue: { name: before.name, is_active: before.is_active },
      newValue: { name: updated.name, is_active: updated.is_active },
    });
    return updated;
  }
}
