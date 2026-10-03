import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Pagination query (Doc02 §7 — phân trang list endpoints).
 *
 *  - page      : 1-based
 *  - pageSize  : mặc định 20, tối đa 100
 *
 * Sort áp dụng mặc định: created_at DESC. Module-specific DTO có thể kế thừa
 * và thêm filter/sort riêng.
 */
export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /**
   * Số row tối đa trả về. Lưu ý: dùng method thay vì getter để class-transformer
   * (khi whitelist+forbidNonWhitelisted) không throw "Cannot set property of
   * #<...> which has only a getter" khi nhận query `?limit=20`.
   */
  getLimit(): number {
    return this.pageSize;
  }

  getOffset(): number {
    return (this.page - 1) * this.pageSize;
  }
}
