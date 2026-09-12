import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * DTO cho POST /auth/change-password.
 *
 * Doc02 §NFR-SEC-01: password ≥ 12 ký tự, có chữ hoa, chữ thường, số, ký tự đặc biệt.
 * Pattern giữ đơn giản để dễ test; production có thể dùng zxcvbn.
 */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,128}$/;

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @ApiProperty({ minLength: 12, maxLength: 128 })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message:
      'Mật khẩu phải ≥ 12 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}
