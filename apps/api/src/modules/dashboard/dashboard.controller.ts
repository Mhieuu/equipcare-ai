import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { DashboardService } from './dashboard.service';

/**
 * Dashboard endpoints (M9 plan section 12.2).
 *
 * Permission: DASHBOARD_VIEW (admin/manager/technician theo seed).
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('kpis')
  @Permissions(Permission.DASHBOARD_VIEW)
  kpis() {
    return this.service.getKpis();
  }

  @Get('overdue')
  @Permissions(Permission.DASHBOARD_VIEW)
  overdue() {
    return this.service.getOverdueWorkOrders();
  }

  @Get('technician-load')
  @Permissions(Permission.DASHBOARD_VIEW)
  technicianLoad() {
    return this.service.getTechnicianLoad();
  }

  @Get('asset-critical')
  @Permissions(Permission.DASHBOARD_VIEW)
  assetCritical(@Query('months') months?: string, @Query('limit') limit?: string) {
    return this.service.getAssetCritical({
      months: months ? Number(months) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /**
   * Doc05 §8.4: Cost trend theo thang (12 thang gan nhat).
   *   Response: { items: [{ month: 'YYYY-MM', partCost, laborCost, otherCost, totalCost }] }
   */
  @Get('cost-trend')
  @Permissions(Permission.DASHBOARD_VIEW)
  costTrend(@Query('months') months?: string) {
    return this.service.getCostTrend({ months: months ? Number(months) : undefined });
  }

  /**
   * Doc05 §8.4: Action items (todo widgets) cho dashboard manager.
   *   Tap hop: WO qua han (>24h chua complete) + approvals pending > 24h + low-stock parts.
   */
  @Get('action-items')
  @Permissions(Permission.DASHBOARD_VIEW)
  actionItems(@Query('limit') limit?: string) {
    return this.service.getActionItems({ limit: limit ? Number(limit) : undefined });
  }
}
