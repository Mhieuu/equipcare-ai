import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * DTO cho PATCH /iam/users/:id — cập nhật full_name, email, department_id.
 *
 * Quy tắc:
 * - KHÔNG cho update login_name / password_hash trực tiếp (Doc02 §FR-IAM-02).
 *   password đổi qua POST /auth/change-password hoặc /iam/users/:id/reset-password.
 * - Mọi field optional — chỉ gửi field cần đổi.
 */
export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  departmentId?: string | null;
}
