import { Controller, Get, HttpCode } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Realtime status endpoint (M9 plan).
 *
 * Documented WS endpoint la `/ws?token=<jwt>` (Socket.IO).
 * P1 (M9 backend layer): tra ve metadata de FE biet:
 *   - protocol: 'socket.io'
 *   - path: '/ws'
 *   - query.token: <jwt>
 *   - rooms: <user-id> (1 socket / user, FE filter theo recipient_id)
 *
 * Full Socket.IO integration (npm i socket.io @nestjs/platform-socket.io)
 * se duoc M10 wiring khi FE san sang.
 */
@Controller('ws')
export class RealtimeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @HttpCode(200)
  status() {
    return {
      protocol: 'socket.io',
      path: '/ws',
      auth: { query: { token: '<jwt-access-token>' } },
      rooms: ['<user-id>'],
      events: ['notification.created', 'work_order.assigned', 'approval.submitted'],
      status: 'ready',
      implementation: 'M10',
    };
  }
}
