import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * DTO cho POST /iam/users — tạo user mới.
 *
 * - login_name: 3-100 ký tự, không dấu cách, dùng cho SSO/audit.
 * - full_name: 1-150 ký tự.
 * - email: optional, RFC email.
 * - department_id: optional, FK departments.id.
 * - initialPassword: ≥12 ký tự + complexity (cùng pattern change-password).
 */
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,128}$/;
const LOGIN_NAME_PATTERN = /^[a-zA-Z0-9._-]{3,100}$/;

export class CreateUserDto {
  @ApiProperty({ example: 'nguyen.van.a' })
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  @Matches(LOGIN_NAME_PATTERN, {
    message: 'loginName chỉ chứa chữ, số, dấu chấm, gạch dưới, gạch ngang',
  })
  loginName!: string;

  @ApiProperty({ example: 'Nguyễn Văn A' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName!: string;

  @ApiProperty({ required: false, example: 'a@equipcare.local' })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @ApiProperty({ description: 'Mật khẩu khởi tạo (≥12 ký tự, phức tạp)' })
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(PASSWORD_PATTERN, {
    message: 'Mật khẩu phải ≥ 12 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt',
  })
  initialPassword!: string;
}
