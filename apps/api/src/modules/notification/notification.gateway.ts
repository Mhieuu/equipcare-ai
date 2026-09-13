import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PermissionCode } from '@equipcare/shared';

/**
 * NotificationGateway - M10 (FR-NOT-06 realtime).
 *
 * WebSocket endpoint: /ws (Socket.IO).
 * Auth: JWT bearer token qua handshake auth.token hoac query.token.
 * Sau khi connect: moi user co room `user:<userId>` de nhan notification moi.
 *
 * Su dung:
 *   const socket = io('http://api', {
 *     auth: { token: accessJwt }, // tu /auth/login
 *   });
 *   socket.on('notification:new', (n) => { ... });
 *   socket.on('notification:updated', (n) => { ... });
 *
 * Service phat event:
 *   this.gateway.emitToUser(userId, 'notification:new', dto);
 *   this.gateway.emitToUser(userId, 'notification:updated', dto);
 *
 * Plan: M10 hardening. Connection log thong tin userId + role count.
 * Scope: chi doc notification cua user hien tai (room isolation).
 */
@WebSocketGateway({
  cors: {
    origin: process.env.APP_URL?.split(',').map((s) => s.trim()) ?? ['http://localhost:3000'],
    credentials: true,
  },
  namespace: '/ws',
  transports: ['websocket', 'polling'],
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(socket: Socket) {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ??
        (socket.handshake.query?.token as string | undefined);
      if (!token) {
        socket.emit('error', { code: 'WS_UNAUTHENTICATED', message: 'Missing token' });
        socket.disconnect(true);
        return;
      }
      const payload = this.jwt.verify<{
        sub: string;
        permissions?: PermissionCode[];
        scopes?: unknown;
        ver?: number;
      }>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET') ?? this.config.get<string>('JWT_SECRET'),
      });
      // Attach to socket data for later
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (socket.data as any).userId = payload.sub;
      (socket.data as { permissions?: PermissionCode[] }).permissions =
        payload.permissions ?? [];
      // Join personal room
      await socket.join(`user:${payload.sub}`);
      this.logger.log(`WS connected: user=${payload.sub} rooms=${JSON.stringify(socket.rooms)}`);
      socket.emit('connected', { userId: payload.sub });
    } catch (err) {
      this.logger.warn(`WS auth failed: ${(err as Error).message}`);
      socket.emit('error', { code: 'WS_AUTH_FAILED', message: (err as Error).message });
      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (socket.data as any).userId;
    if (userId) {
      this.logger.log(`WS disconnected: user=${userId}`);
    }
  }

  /**
   * Health check ping/pong tu FE.
   */
  @SubscribeMessage('ping')
  ping(@ConnectedSocket() socket: Socket, @MessageBody() data: { ts?: number }) {
    socket.emit('pong', { ts: data?.ts ?? Date.now(), serverTs: Date.now() });
    return { pong: true };
  }

  // -------------------- emit helpers (used by services) --------------------

  emitToUser(userId: string, event: string, payload: unknown) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  emitNotificationNew(userId: string, dto: unknown) {
    this.emitToUser(userId, 'notification:new', dto);
  }

  emitNotificationUpdated(userId: string, dto: unknown) {
    this.emitToUser(userId, 'notification:updated', dto);
  }
}
