import { ApiProperty } from '@nestjs/swagger';

/**
 * Response shape cho POST /auth/login và POST /auth/refresh.
 * Refresh token KHÔNG trả body — chỉ set HttpOnly cookie.
 */
export class AuthTokenDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ description: 'TTL của access token (giây)' })
  expiresIn!: number;

  @ApiProperty({
    description:
      'User phải đổi mật khẩu trước khi dùng các tính năng khác (Doc02 §FR-AUTH-04)',
  })
  mustChangePassword!: boolean;
}
