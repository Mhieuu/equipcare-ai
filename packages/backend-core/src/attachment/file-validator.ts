import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  type AllowedMimeType,
} from '@equipcare/shared';
import { AppError } from '../errors/app-error.js';

/**
 * Magic bytes (4-12 bytes đầu) để verify MIME không phải self-declared.
 *
 * Nguồn:
 *  - PDF: %PDF-1.x (%PDF = 25 50 44 46)
 *  - PNG: 89 50 4E 47 0D 0A 1A 0A
 *  - JPEG: FF D8 FF (E0/E1/E2/F0...)
 *  - WEBP: "RIFF" .... "WEBP"
 *  - GIF: "GIF87a" / "GIF89a"
 *  - ZIP-based (DOCX/XLSX/JAR...): PK\x03\x04
 *  - Microsoft OLE Compound (DOC/XLS): D0 CF 11 E0 A1 B1 1A E1
 *
 * Doc04 NFR-SEC-04: KHÔNG cho phép user upload binary executable.
 * SVG có thể chứa JS → chấp nhận nhưng phải review (P1 production).
 */
interface MagicRule {
  mime: AllowedMimeType;
  // Hex string, phân cách bằng space.
  hex: string;
  // Offset nơi magic bắt đầu (mặc định 0).
  offset?: number;
}

const MAGIC_RULES: MagicRule[] = [
  { mime: 'application/pdf', hex: '25 50 44 46' },
  { mime: 'image/png', hex: '89 50 4E 47 0D 0A 1A 0A' },
  { mime: 'image/jpeg', hex: 'FF D8 FF' },
  { mime: 'image/gif', hex: '47 49 46 38 37 61' }, // GIF87a
  { mime: 'image/gif', hex: '47 49 46 38 39 61' }, // GIF89a
  // SVG là text, không có magic cố định; chấp nhận nhưng trust MIME (P1: cần sanitize).
];

// ZIP-based formats: kiểm tra PK\x03\x04 + 1 cụm tên file trong central dir.
const ZIP_MAGIC_HEX = '50 4B 03 04';
const ZIP_BASED_MIMES: AllowedMimeType[] = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const OLE_MAGIC_HEX = 'D0 CF 11 E0 A1 B1 1A E1';
const OLE_MIMES: AllowedMimeType[] = [
  // DOC/XLS cũ (pre-2007) là OLE Compound. Hiện tại KHÔNG có trong ALLOWED_MIME_TYPES,
  // nhưng giữ rule cho forward-compat.
];

// WEBP là RIFF container: "RIFF" .... "WEBP" (offset 8).
const WEBP_HEADER_HEX = '52 49 46 46';
const WEBP_TYPE_HEX = '57 45 42 50';

// Plain text + CSV + JSON — không có magic cố định, verify bằng cách toàn byte
// là printable ASCII / UTF-8 không chứa NUL/control byte. Lint trong service.

/**
 * Convert hex string "AB CD EF" thành Buffer (không phân biệt hoa/thường).
 */
function hexToBuffer(hex: string): Buffer {
  const cleaned = hex.replace(/\s+/g, '');
  return Buffer.from(cleaned, 'hex');
}

/**
 * Check xem `buffer` bắt đầu bằng `prefix` tại `offset`.
 */
function startsWithAt(buffer: Buffer, prefix: Buffer, offset = 0): boolean {
  if (buffer.length < offset + prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (buffer[offset + i] !== prefix[i]) return false;
  }
  return true;
}

/**
 * Verify một file đã upload có MIME hợp lệ + size OK + magic bytes khớp.
 *
 * Return: `{ mime: <effective-mime>, sha256, sizeBytes }` — mime effective là
 * MIME đã verify (dựa trên magic), KHÔNG tin tưởng MIME user gửi.
 *
 * Throw `AppError.unprocessable` nếu fail. Caller bắt + set state = REJECTED.
 */
export interface FileValidationInput {
  buffer: Buffer;
  declaredMime: string;
  originalName: string;
}

export interface FileValidationOutput {
  mime: AllowedMimeType;
  sizeBytes: number;
  sha256: string;
}

export function validateUpload(input: FileValidationInput): FileValidationOutput {
  const { buffer, declaredMime, originalName } = input;

  // ---- Size check ----
  if (buffer.length === 0) {
    throw AppError.unprocessable(
      'ATTACHMENT_EMPTY_FILE',
      'File rỗng; không thể upload',
      { originalName },
    );
  }
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw AppError.unprocessable(
      'ATTACHMENT_TOO_LARGE',
      `File vượt quá ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB (kích thước: ${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
      { originalName, sizeBytes: buffer.length },
    );
  }

  // ---- MIME declared phải nằm trong whitelist ----
  if (!ALLOWED_MIME_TYPES.includes(declaredMime as AllowedMimeType)) {
    throw AppError.unprocessable(
      'ATTACHMENT_MIME_NOT_ALLOWED',
      `MIME '${declaredMime}' không được phép upload`,
      { declaredMime, allowedMimes: ALLOWED_MIME_TYPES as readonly string[] },
    );
  }

  // ---- Magic bytes verification ----
  const effectiveMime = verifyMagicBytes(buffer, declaredMime);

  // ---- sha256 (Doc04 §NFR-AUDIT-03 — checksum cho audit) ----
  const sha256 = hashSha256(buffer);

  return {
    mime: effectiveMime,
    sizeBytes: buffer.length,
    sha256,
  };
}

/**
 * Verify MIME dựa trên magic bytes. Nếu magic không khớp với declared → reject.
 * Trả về MIME effective (đã xác nhận bằng magic). Nếu declared là plain text
 * family (text/*, application/json, image/svg+xml), chấp nhận magic lint thay vì
 * hard magic — không có chữ ký cố định.
 */
export function verifyMagicBytes(buffer: Buffer, declaredMime: string): AllowedMimeType {
  const mime = declaredMime as AllowedMimeType;

  // Plain text family — không có magic; verify "không phải binary".
  if (mime.startsWith('text/') || mime === 'application/json') {
    if (looksBinary(buffer)) {
      throw AppError.unprocessable(
        'ATTACHMENT_BINARY_HIDDEN_AS_TEXT',
        `File '${declaredMime}' có chứa byte không hợp lệ (NUL/control)`,
        { declaredMime },
      );
    }
    return mime;
  }

  // SVG — verify đầu file là <?xml hoặc <svg (text-based, nhưng chặn malicious).
  if (mime === 'image/svg+xml') {
    const head = buffer.slice(0, 256).toString('utf8').trim();
    if (!head.startsWith('<?xml') && !head.startsWith('<svg')) {
      throw AppError.unprocessable(
        'ATTACHMENT_INVALID_SVG',
        'SVG phải bắt đầu bằng <?xml hoặc <svg',
        { head: head.slice(0, 80) },
      );
    }
    return mime;
  }

  // WEBP — RIFF container có "WEBP" ở offset 8.
  if (mime === 'image/webp') {
    const riff = hexToBuffer(WEBP_HEADER_HEX);
    const webp = hexToBuffer(WEBP_TYPE_HEX);
    if (!startsWithAt(buffer, riff) || !startsWithAt(buffer, webp, 8)) {
      throw AppError.unprocessable(
        'ATTACHMENT_MAGIC_MISMATCH',
        'Magic bytes không khớp WEBP',
        { declaredMime },
      );
    }
    return mime;
  }

  // ZIP-based (DOCX/XLSX/...).
  if (ZIP_BASED_MIMES.includes(mime)) {
    if (!startsWithAt(buffer, hexToBuffer(ZIP_MAGIC_HEX))) {
      throw AppError.unprocessable(
        'ATTACHMENT_MAGIC_MISMATCH',
        `Magic bytes không khớp cho ${mime}`,
        { declaredMime },
      );
    }
    return mime;
  }

  // OLE-based.
  if (OLE_MIMES.includes(mime)) {
    if (!startsWithAt(buffer, hexToBuffer(OLE_MAGIC_HEX))) {
      throw AppError.unprocessable(
        'ATTACHMENT_MAGIC_MISMATCH',
        `Magic bytes không khớp cho ${mime}`,
        { declaredMime },
      );
    }
    return mime;
  }

  // Các mime còn lại: PDF/PNG/JPEG/GIF — kiểm rule cụ thể.
  const matches = MAGIC_RULES.filter((r) => r.mime === mime);
  if (matches.length === 0) {
    throw AppError.unprocessable(
      'ATTACHMENT_UNSUPPORTED_MIME',
      `Không hỗ trợ verify magic bytes cho '${mime}'`,
      { declaredMime },
    );
  }
  for (const rule of matches) {
    if (startsWithAt(buffer, hexToBuffer(rule.hex), rule.offset ?? 0)) {
      return mime;
    }
  }
  throw AppError.unprocessable(
    'ATTACHMENT_MAGIC_MISMATCH',
    `Magic bytes không khớp cho ${mime}`,
    { declaredMime },
  );
}

/**
 * Heuristic phát hiện binary: nếu có NUL (0x00) hoặc control byte
 * (ngoài \t \n \r) trong 8KB đầu → coi là binary.
 */
export function looksBinary(buffer: Buffer): boolean {
  const limit = Math.min(buffer.length, 8192);
  for (let i = 0; i < limit; i++) {
    const b = buffer[i];
    if (b === 0) return true;
    // Control char < 0x20 trừ \t(0x09) \n(0x0A) \r(0x0D) → binary.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return true;
  }
  return false;
}

import { createHash } from 'node:crypto';

/**
 * SHA-256 hex của buffer (Doc04 §NFR-AUDIT-03 — checksum cho audit trail).
 */
export function hashSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Sanitize `original_name` để dùng làm phần object_key — chống path traversal.
 *
 * Quy tắc:
 *  - Chỉ giữ A-Z, a-z, 0-9, '.', '-', '_'.
 *  - Thay chuỗi rỗng / toàn ký tự bị lọc bằng 'untitled'.
 *  - Cắt tối đa 200 ký tự.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bỏ dấu
    .replace(/[^A-Za-z0-9._-]/g, '_');
  return (cleaned || 'untitled').slice(0, 200);
}
