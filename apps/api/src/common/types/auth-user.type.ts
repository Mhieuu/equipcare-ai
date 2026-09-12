/**
 * AuthenticatedUser — payload giải mã từ JWT access token.
 * Mọi controller / service chỉ nhận được shape này qua @CurrentUser().
 */
export interface AuthenticatedUser {
  /** user.id (UUID) */
  sub: string;
  /** users.auth_version — tăng mỗi lần đổi mật khẩu, vô hiệu hóa JWT cũ */
  ver: number;
  /** 'access' | 'refresh' — phân biệt loại token (mặc định access) */
  typ?: 'access' | 'refresh';
  /** Thời điểm phát hành (Unix seconds) */
  iat?: number;
  /** Thời điểm hết hạn (Unix seconds) */
  exp?: number;
}
