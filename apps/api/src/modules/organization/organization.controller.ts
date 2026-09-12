import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OrganizationService } from './organization.service.js';
import {
  CreateAssetTypeDto,
  CreateDepartmentDto,
  CreateLocationDto,
  ListOrgQueryDto,
  UpdateAssetTypeDto,
  UpdateDepartmentDto,
  UpdateLocationDto,
} from './dto/org.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * OrganizationController — departments / locations / asset-types (M1.C).
 *
 * Permission (Doc03 RBAC):
 *   - READ  → iam:user:read (admin/manager; mọi người cần list để chọn)
 *   - MANAGE → iam:user:manage (chỉ admin)
 *
 * Lưu ý: dùng iam:* vì các resource này là admin-owned. Nếu sau này mở
 * cho manager edit asset_types, có thể tách permission mới (org:asset-type:manage).
 */
@ApiTags('organization')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller()
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  // ===========================================================================
  // Departments — /departments
  // ===========================================================================

  @Get('departments')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Danh sách phòng ban' })
  listDepartments(@Query() q: ListOrgQueryDto) {
    return this.org.listDepartments(q);
  }

  @Get('departments/:id')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Chi tiết phòng ban' })
  getDepartment(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.org.getDepartment(id);
  }

  @Post('departments')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Tạo phòng ban (admin)' })
  createDepartment(
    @Body() dto: CreateDepartmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.createDepartment(dto, actor.sub);
  }

  @Patch('departments/:id')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Cập nhật phòng ban' })
  updateDepartment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateDepartmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.updateDepartment(id, dto, actor.sub);
  }

  // ===========================================================================
  // Locations — /locations + /locations/tree
  // ===========================================================================

  @Get('locations')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Danh sách vị trí (flat)' })
  listLocations(@Query() q: ListOrgQueryDto) {
    return this.org.listLocations(q);
  }

  @Get('locations/tree')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Cây vị trí (parent → children, SCR-ORG-02b)' })
  getLocationTree() {
    return this.org.getLocationTree();
  }

  @Get('locations/:id')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Chi tiết vị trí' })
  getLocation(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.org.getLocation(id);
  }

  @Post('locations')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Tạo vị trí (admin)' })
  createLocation(
    @Body() dto: CreateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.createLocation(dto, actor.sub);
  }

  @Patch('locations/:id')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Cập nhật vị trí (admin)' })
  updateLocation(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLocationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.updateLocation(id, dto, actor.sub);
  }

  // ===========================================================================
  // Asset types — /asset-types
  // ===========================================================================

  @Get('asset-types')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Danh sách loại thiết bị (SCR-ORG-01b)' })
  listAssetTypes(@Query() q: ListOrgQueryDto) {
    return this.org.listAssetTypes(q);
  }

  @Get('asset-types/:id')
  @Permissions('iam:user:read')
  @ApiOperation({ summary: 'Chi tiết loại thiết bị' })
  getAssetType(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.org.getAssetType(id);
  }

  @Post('asset-types')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Tạo loại thiết bị (admin)' })
  createAssetType(
    @Body() dto: CreateAssetTypeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.createAssetType(dto, actor.sub);
  }

  @Patch('asset-types/:id')
  @Permissions('iam:user:manage')
  @ApiOperation({ summary: 'Cập nhật loại thiết bị' })
  updateAssetType(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateAssetTypeDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.org.updateAssetType(id, dto, actor.sub);
  }
}
