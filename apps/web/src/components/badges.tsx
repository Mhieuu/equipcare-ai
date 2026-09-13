'use client';

import { ActivityStatus, ActivityStatusLabel } from '@equipcare/shared';
import { IncidentPriority, IncidentPriorityLabel } from '@equipcare/shared';
import { IncidentStatus, IncidentStatusLabel } from '@equipcare/shared';
import { WorkOrderStatus, WorkOrderStatusLabel } from '@equipcare/shared';
import { ApprovalStatus, ApprovalStatusLabel } from '@equipcare/shared';
import { WorkOrderType, WorkOrderTypeLabel } from '@equipcare/shared';

const STATUS_CLASSES = {
  [WorkOrderStatus.NEW]: 'badge-gray',
  [WorkOrderStatus.ASSIGNED]: 'badge-blue',
  [WorkOrderStatus.IN_PROGRESS]: 'badge-yellow',
  [WorkOrderStatus.WAITING_APPROVAL]: 'badge-purple',
  [WorkOrderStatus.COMPLETED]: 'badge-green',
  [WorkOrderStatus.CANCELLED]: 'badge-red',
} as const;

export function WorkOrderStatusBadge({ status }: { status: WorkOrderStatus }) {
  return <span className={STATUS_CLASSES[status] ?? 'badge-gray'}>{WorkOrderStatusLabel[status]}</span>;
}

export function WorkOrderTypeBadge({ type }: { type: WorkOrderType }) {
  const cls = type === WorkOrderType.REPAIR ? 'badge-red' : type === WorkOrderType.MAINTENANCE ? 'badge-blue' : 'badge-gray';
  return <span className={cls}>{WorkOrderTypeLabel[type]}</span>;
}

const INC_STATUS_CLASSES: Record<IncidentStatus, string> = {
  [IncidentStatus.NEW]: 'badge-blue',
  [IncidentStatus.AWAITING_INFO]: 'badge-yellow',
  [IncidentStatus.IN_PROGRESS]: 'badge-purple',
  [IncidentStatus.RESOLVED]: 'badge-green',
  [IncidentStatus.CLOSED]: 'badge-gray',
  [IncidentStatus.CANCELLED]: 'badge-red',
};

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  return (
    <span className={INC_STATUS_CLASSES[status] ?? 'badge-gray'}>{IncidentStatusLabel[status]}</span>
  );
}

const PRIORITY_CLASSES: Record<IncidentPriority, string> = {
  [IncidentPriority.LOW]: 'badge-gray',
  [IncidentPriority.MEDIUM]: 'badge-blue',
  [IncidentPriority.HIGH]: 'badge-yellow',
  [IncidentPriority.CRITICAL]: 'badge-red',
};

export function PriorityBadge({ priority }: { priority: IncidentPriority }) {
  return <span className={PRIORITY_CLASSES[priority] ?? 'badge-gray'}>{IncidentPriorityLabel[priority]}</span>;
}

const APR_STATUS_CLASSES: Record<ApprovalStatus, string> = {
  [ApprovalStatus.DRAFT]: 'badge-gray',
  [ApprovalStatus.SUBMITTED]: 'badge-yellow',
  [ApprovalStatus.INFO_REQUESTED]: 'badge-purple',
  [ApprovalStatus.APPROVED]: 'badge-green',
  [ApprovalStatus.REJECTED]: 'badge-red',
  [ApprovalStatus.CANCELLED]: 'badge-gray',
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return <span className={APR_STATUS_CLASSES[status] ?? 'badge-gray'}>{ApprovalStatusLabel[status]}</span>;
}

const ACT_STATUS_CLASSES: Record<ActivityStatus, string> = {
  [ActivityStatus.OPERATIONAL]: 'badge-green',
  [ActivityStatus.MAINTENANCE]: 'badge-blue',
  [ActivityStatus.REPAIR]: 'badge-red',
  [ActivityStatus.SUSPENDED]: 'badge-yellow',
  [ActivityStatus.RETIRED]: 'badge-gray',
};

export function AssetStatusBadge({ status }: { status: ActivityStatus }) {
  return <span className={ACT_STATUS_CLASSES[status] ?? 'badge-gray'}>{ActivityStatusLabel[status]}</span>;
}
