import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Public } from '../../common/decorators/public.decorator.js';

/**
 * Health endpoints — M1 Foundation.
 *
 * - `GET /healthz/live` — liveness, chỉ check process còn chạy (no DB).
 * - `GET /healthz/ready` — readiness, ping DB. K8s/Compose dùng cái này
 *   để gate traffic khi migrate hoặc DB chưa sẵn sàng.
 * - `GET /healthz` — alias của ready, giữ backward-compat với M0 scaffold.
 */
@ApiTags('health')
@Controller('healthz')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness — process còn chạy' })
  live(): { status: 'ok'; ts: string } {
    return { status: 'ok', ts: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Readiness — DB có kết nối' })
  @ApiResponse({ status: 200, description: 'DB ready' })
  @ApiResponse({ status: 503, description: 'DB chưa sẵn sàng' })
  async ready(): Promise<{
    status: 'ok' | 'degraded';
    db: boolean;
    ts: string;
  }> {
    let dbOk = false;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk,
      ts: new Date().toISOString(),
    };
  }

  @Get()
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backward-compat — alias /healthz/ready' })
  check(): Promise<{ status: 'ok' | 'degraded'; db: boolean; ts: string }> {
    return this.ready();
  }
}
