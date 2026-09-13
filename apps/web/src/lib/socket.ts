/**
 * Socket.IO client wrapper. Auto-reconnect, JWT in handshake.
 *
 * Listens for `notification:updated` and `notification:new` events emitted by
 * backend `notification.gateway.ts`.
 */
'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/toast';

function getSocketUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return base.replace(/\/$/, '');
}

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function useSocket() {
  const accessToken = useAuth((s) => s.accessToken);
  const toast = useToast();
  const isConnected = useRef(false);

  useEffect(() => {
    if (!accessToken) {
      if (socket) {
        socket.disconnect();
        socket = null;
      }
      return;
    }
    if (socket && socket.connected) return;

    const s = io(getSocketUrl() + '/ws', {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      forceNew: true,
    });
    socket = s;

    s.on('connect', () => {
      isConnected.current = true;
    });
    s.on('disconnect', () => {
      isConnected.current = false;
    });
    s.on('notification:new', (data: { title?: string; message?: string }) => {
      toast.info(data?.title ?? 'Thông báo mới', data?.message);
    });

    return () => {
      // Don't disconnect on every render; only when token changes (handled above)
    };
  }, [accessToken, toast]);

  return socket;
}
