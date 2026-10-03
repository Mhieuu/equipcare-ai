import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  IsIn,
  IsDateString,
  IsArray,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  WorkOrderType,
  WorkOrderStatus,
  WorkOrderCreationMode,
  WorkOrderNoteType,
  PauseReason,
  IncidentPriority,
} from '@equipcare/shared';

/**
 * List query (Doc02 section 7 — pagination/filter/sort).
 *
 * Hỗ trợ cả `page`/`pageSize` và `limit`/`offset` để frontend cũ vẫn dùng được.
 */
export class ListWorkOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number;

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

  get take(): number {
    return this.limit ?? this.pageSize ?? 50;
  }

  get skip(): number {
    return this.offset ?? ((this.page ?? 1) - 1) * this.take;
  }

  @IsOptional()
  @IsString()
  @IsIn(Object.values(WorkOrderStatus))
  status?: WorkOrderStatus;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(WorkOrderType))
  kind?: WorkOrderType;

  @IsOptional()
  @IsString()
  @IsIn(Object.values(IncidentPriority))
  priority?: IncidentPriority;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  assetId?: string;
}

/**
 * Create Work Order (Doc02 section FR-WO-01).
 *
 * Service xu ly:
 *  - partial unique incident_id (Doc04 DB-03)
 *  - department_id_snapshot (Doc04 section 5.4 / Q-05)
 *  - due_at default = now + sla_seconds priority
 */
export class CreateWorkOrderDto {
  @IsUUID()
  assetId!: string;

  @IsString()
  @IsIn(Object.values(WorkOrderType))
  kind!: WorkOrderType;

  @IsOptional()
  @IsUUID()
  incidentId?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsString()
  @IsIn(Object.values(WorkOrderCreationMode))
  creationMode!: WorkOrderCreationMode;

  @IsString()
  @MaxLength(2000)
  description!: string;

  @IsString()
  @IsIn(Object.values(IncidentPriority))
  priorityCode!: IncidentPriority;

  @IsOptional()
  @IsDateString()
  dueAt?: string;

  /** Checklist mau (M5 chua dung UI; luu snapshot JSONB). */
  @IsOptional()
  @IsArray()
  checklist?: unknown[];

  /** Downtime start (neu da bi dung may). */
  @IsOptional()
  @IsDateString()
  downtimeStart?: string;
}

/**
 * Transition (Doc02 section FR-WO-02).
 */
export class TransitionWorkOrderDto {
  @IsString()
  @IsIn(Object.values(WorkOrderStatus))
  to!: WorkOrderStatus;

  /** rowVersion: optimistic lock (R-04). */
  @IsOptional()
  @IsString()
  rowVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignWorkOrderDto {
  @IsUUID()
  assigneeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CompleteWorkOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  resultSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  actionTaken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  confirmedCause?: string;

  @IsOptional()
  @IsArray()
  checklistResults?: unknown[];

  @IsOptional()
  @IsDateString()
  downtimeEnd?: string;
}

export class CancelWorkOrderDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class AddNoteDto {
  @IsString()
  @IsIn(Object.values(WorkOrderNoteType))
  noteType!: WorkOrderNoteType;

  @IsString()
  @MaxLength(2000)
  note!: string;

  /** Bat buoc neu noteType = PAUSE_START. */
  @IsOptional()
  @IsString()
  @IsIn(Object.values(PauseReason))
  pauseReason?: PauseReason;
}

/** Filter cho timeline (pause/waiting). */
export class SlaTimelineQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** Upsert 1 work_order_parts row. */
export class PlanPartDto {
  @IsUUID()
  partId!: string;

  @IsNumber()
  @Min(0)
  plannedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
