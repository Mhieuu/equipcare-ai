import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { Permission } from '@equipcare/shared';
import { ReportService, type ReportType } from './report.service';
import { AppError } from '@equipcare/backend-core';

/**
 * Report endpoints (M9 plan).
 * Permission: REPORT_EXPORT (admin/manager theo seed).
 *
 * GET /reports/:type.csv -> text/csv
 * Supported: incidents, work-orders, cost-summary, asset-critical.
 */
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportController {
  constructor(private readonly service: ReportService) {}

  @Get(':type')
  @Permissions(Permission.REPORT_EXPORT)
  async download(@Param('type') type: string, @Res() res: Response) {
    const cleaned = type.endsWith('.csv') ? type.slice(0, -4) : type;
    if (!ReportService.isSupported(cleaned)) {
      throw AppError.badRequest(
        `Loai bao cao khong duoc ho tro: ${type}. Ho tro: ${[
          'incidents',
          'work-orders',
          'cost-summary',
          'asset-critical',
        ].join(', ')}`,
        { type },
      );
    }
    const r = await this.service.generate(cleaned as ReportType);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${r.filename}"`);
    res.send(r.content);
  }
}
