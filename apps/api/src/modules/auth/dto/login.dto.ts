import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * DTO cho POST /auth/login.
 * - login_name Doc04 §5.3: 1-100 ký tự, unique.
 * - password không validate format ở DTO — backend check length & complexity
 *   khi change-password.
 */
export class LoginDto {
  @ApiProperty({ example: 'admin.bootstrap', description: 'Tên đăng nhập' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  loginName!: string;

  @ApiProperty({ example: 'ChangeMe@2026' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
