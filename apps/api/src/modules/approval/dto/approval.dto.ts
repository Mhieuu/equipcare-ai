import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  IsArray,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalEventType, type ApprovalStatus } from '@equipcare/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * 1 dong y nghia xuat linh kien cho revision (Q-06).
 *
 * `quantity` > 0 va don gia mac dinh lay tu `parts.reference_price`.
 */
export class ApprovalRevisionPartDto {
  @IsUUID()
  partId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

/**
 * POST /approvals: create draft approval (Doc04 section 5.7).
 */
export class CreateApprovalDto {
  @IsUUID()
  workOrderId!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsString()
  @MaxLength(2000)
  actionPlan!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherEstimatedCost?: number;

  /**
   * Linh kien xin cap trong revision (Q-06). Neu bo trong, service tu nap
   * tu `work_order_parts` cua WO (so luong keo hoach).
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalRevisionPartDto)
  parts?: ApprovalRevisionPartDto[];
}

/**
 * PATCH /approvals/:id/draft: chinh sua revision hien tai (DRAFT/INFO_REQUESTED/REJECTED).
 */
export class UpdateDraftApprovalDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;

  @IsString()
  @MaxLength(2000)
  actionPlan!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  otherEstimatedCost?: number;

  /** Cap nhat danh sach linh kien xin cap (Q-06). */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalRevisionPartDto)
  parts?: ApprovalRevisionPartDto[];
}

export class ApprovalActionDto {
  @IsString()
  @IsIn([
    ApprovalEventType.SUBMITTED,
    ApprovalEventType.APPROVED,
    ApprovalEventType.REJECTED,
    ApprovalEventType.INFO_REQUESTED,
    ApprovalEventType.CANCELLED,
  ])
  action!: 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED' | 'CANCELLED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  partIds?: string[];

  @IsOptional()
  @IsString()
  rowVersion?: string;
}

/**
 * Query inbox (FR-APR inbox).
 */
export class ListApprovalsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  offset?: number;

  @IsOptional()
  @IsString()
  @IsIn([
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'INFO_REQUESTED',
  ])
  status?: ApprovalStatus;

  getTake(): number {
    return this.limit ?? this.getLimit();
  }

  getSkip(): number {
    return this.offset ?? this.getOffset();
  }
}
