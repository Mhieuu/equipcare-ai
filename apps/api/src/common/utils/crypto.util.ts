import { createHash, randomBytes } from 'node:crypto';

/**
 * Crypto helpers dùng trong auth module.
 *
 * - generateRefreshToken: tạo random opaque token (base64url), KHÔNG phải JWT.
 *   Lưu vào DB chỉ SHA-256 hash → server không bao giờ giữ plaintext.
 * - hashRefreshToken: hash token plaintext (hex string) → SHA-256 (hex).
 *
 * Lý do dùng SHA-256 (không bcrypt) cho refresh: refresh token là ngẫu nhiên
 * 256-bit, bcrypt overhead không cần thiết, và DB lookup nhanh hơn.
 */
export function generateRefreshToken(): string {
  // 32 bytes → 256-bit entropy → 43 ký tự base64url (no padding)
  return randomBytes(32).toString('base64url');
}

export function hashRefreshToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}
