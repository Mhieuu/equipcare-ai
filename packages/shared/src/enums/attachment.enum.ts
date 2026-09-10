/**
 * Trạng thái Attachment (Doc04 — STAGED/READY).
 * STAGED: blob đã upload, chưa gắn vào entity
 * READY: đã gắn vào entity
 */
export const AttachmentStatus = {
  STAGED: 'STAGED',
  READY: 'READY',
} as const;
export type AttachmentStatus = (typeof AttachmentStatus)[keyof typeof AttachmentStatus];
