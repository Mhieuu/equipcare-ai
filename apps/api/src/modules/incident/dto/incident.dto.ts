import { IsOptional, IsString, MaxLength, IsIn } from 'class-validator';
import {
  IncidentPriority,
  IncidentStatus,
} from '@equipcare/shared';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

/**
 * List query cho incidents (Doc02 §7 — pagination/filter/sort).
 */
export class ListIncidentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(Object.values(IncidentStatus))
  status?: IncidentStatus;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(IncidentPriority))
  priority?: IncidentPriority;

  @IsOptional()
  @IsString()
  assetId?: string;
}

/**
 * Create incident (Doc02 §FR-INC-01).
 *
 * Reporter = user hiện tại (lấy từ JWT). Manager có thể báo hộ (route riêng — chưa làm ở M4).
 */
export class CreateIncidentDto {
  @IsString()
  assetId!: string;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @MaxLength(2000)
  impactDescription!: string;

  @IsOptional()
  occurredAt?: string; // ISO 8601
}

/**
 * Transition incident (Doc02 §FR-INC-02..09).
 *
 * `to` thuộc IncidentStatus enum; state machine validate transition.
 * `reason` bắt buộc nếu to=CANCELLED.
 */
export class TransitionIncidentDto {
  @IsString()
  @IsIn(Object.values(IncidentStatus))
  to!: IncidentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CreateIncidentMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}
