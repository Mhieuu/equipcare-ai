import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO cho POST /iam/users/:id/reset-password — admin đặt lại mật khẩu.
 * Plaintext password trả về 1 lần duy nhất trong response.
 */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,128}$/;

export class ResetPasswordDto {
  @ApiProperty({ description: 'Mật khẩu mới tạm thời' })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: 'Mật khẩu phải ≥ 12 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  newPassword!: string;
}
