import {
  IsOptional,
  IsString,
  IsNumber,
  IsIn,
  IsArray,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { ApprovalEventType, type ApprovalStatus } from '@equipcare/shared';

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
export class ListApprovalsQueryDto {
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
}
