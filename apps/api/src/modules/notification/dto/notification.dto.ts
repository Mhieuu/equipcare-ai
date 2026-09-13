import { IsOptional, IsString, IsIn } from 'class-validator';

export class ListNotificationsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['true', 'false'])
  unread?: string;

  @IsOptional()
  @IsString()
  @IsIn([
    'INVENTORY_LOW_STOCK',
    'APPROVAL_SUBMITTED',
    'APPROVAL_DECIDED',
    'APPROVAL_REQUEST_INFO',
    'WORK_ORDER_OVERDUE',
    'WORK_ORDER_ASSIGNED',
    'MAINTENANCE_OCCURRENCE_DUE',
    'SYSTEM',
  ])
  eventType?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
