/**
 * Trạng thái file trong storage (Doc04 §5.6, plan §12.2 M3).
 *
 * STAGED   → blob đã upload + validated, chưa gắn vào entity.
 *            Sau N phút không link sẽ bị worker dọn (plan §12.2 M3).
 * READY    → đã gắn vào entity qua `attachment_links` (đúng 1 parent).
 *            State này KHÔNG tự đảo ngược (kể cả khi parent bị xóa —
 *            cần review audit trail trước).
 * REJECTED → magic bytes / MIME / size check fail; blob bị xóa ngay.
 *            Không tạo `attachment_links` cho REJECTED.
 */
export const FileStorageState = {
  STAGED: 'STAGED',
  READY: 'READY',
  REJECTED: 'REJECTED',
} as const;
export type FileStorageState = (typeof FileStorageState)[keyof typeof FileStorageState];

/**
 * Loại tài liệu kỹ thuật (Doc04 §5.6).
 *
 * MANUAL     → hướng dẫn sử dụng / vận hành.
 * SCHEMATIC  → sơ đồ / bản vẽ kỹ thuật.
 * PROCEDURE  → quy trình thao tác / SOP.
 * OTHER      → khác (mặc định; đã có check constraint).
 */
export const DocumentType = {
  MANUAL: 'MANUAL',
  SCHEMATIC: 'SCHEMATIC',
  PROCEDURE: 'PROCEDURE',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/**
 * Ngân hàng MIME cho phép upload (Doc04 — chống upload file binary executable).
 *
 * Mở rộng thêm trong các milestone sau nếu cần (vd video/audio cho P2).
 * Hiện tại: PDF + ảnh + text + JSON + CSV.
 */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Kích thước file tối đa (Doc04 §NFR-SEC-04).
 *
 * Mặc định 25 MB cho technical documents / ảnh / bảng tính.
 * Worker có thể override nếu file policy cấu hình.
 */
export const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

/**
 * Thời gian sống của STAGED file trước khi worker dọn (Doc04 §5.6).
 * Sau khoảng thời gian này file STAGED không link = orphan → dọn.
 */
export const STAGED_TTL_MINUTES = 60; // 1 giờ
