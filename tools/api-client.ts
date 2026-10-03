/**
 * EquipCare AI TypeScript API client (auto-generated from OpenAPI spec).
 * Regenerate: node tools/gen-ts-client.js
 */

// ============== Type definitions ==============
export interface CreateApprovalDto {
  workOrderId?: string;
  reason?: string;
  actionPlan?: string;
  otherEstimatedCost?: number;
}

export interface UpdateDraftApprovalDto {
  reason?: string;
  actionPlan?: string;
  otherEstimatedCost?: number;
}

export interface ApprovalActionDto {
  action?: string;
  note?: string;
  partIds?: any[];
  rowVersion?: string;
}

export interface CreateAssetDto {
  code?: string;
  name?: string;
  assetTypeId?: string;
  departmentId?: string;
  locationId?: string;
  serialNumber?: string;
  supplierName?: string;
  purchasedOn?: string;
  commissionedOn?: string;
  warrantyUntil?: string;
  description: string;
  specifications?: Record<string, any>;
}

export interface UpdateAssetDto {
  name?: string;
  assetTypeId?: string;
  departmentId?: string;
  locationId?: string;
  serialNumber?: string;
  supplierName?: string;
  purchasedOn?: string;
  commissionedOn?: string;
  warrantyUntil?: string;
  specifications?: Record<string, any>;
}

export interface TransitionAssetStateDto {
  to?: string;
  reason?: string;
}

export interface ListAssetsQueryDto {
  search?: string;
  assetTypeId?: string;
  departmentId?: string;
  locationId?: string;
  manualState?: string;
  limit?: number;
  offset?: number;
}

export interface UploadResponseDto {
  storageState?: string;
  ttlSeconds?: number;
}

export interface FileInfoDto {
  storageState?: string;
}

export interface AuthTokenDto {
  accessToken?: string;
  expiresIn?: number;
  mustChangePassword?: boolean;
}

export interface ChangePasswordDto {
  currentPassword?: string;
  newPassword?: string;
}

export interface LoginDto {
  loginName?: string;
  password?: string;
}

export interface UpdateSystemSettingDto {
  value?: Record<string, any>;
  description?: string;
}

export interface CreateSystemSettingDto {
  key?: string;
  value?: Record<string, any>;
  description?: string;
}

export interface CreateCostEntryDto {
  category?: 'Object.values(CostCategory';
  direction?: 'Object.values(CostDirection';
  quantity?: number;
  unitPrice?: number;
  approvalRevisionId?: string;
  description?: string;
  occurredAt?: string;
}

export interface ListAuditLogsQueryDto {
  actorId?: string;
  action?: string;
  objectType?: string;
  objectKey?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogDto {
  id?: string;
  actorId?: string;
  actorType?: string;
  action?: string;
  objectType?: string;
  objectKey?: string;
  oldValue?: Record<string, any>;
  newValue?: Record<string, any>;
  note?: string;
  correlationKey?: string;
  createdAt?: string;
}

export interface AuditLogListResponseDto {
  items?: any[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface CreateUserDto {
  message: string;
  fullName?: string;
  email?: string;
  departmentId?: string;
}

export interface GrantRoleDto {
  roleId?: string;
}

export interface PermissionsListDto {
  codes?: any[];
}

export interface RoleInfoDto {
  id?: string;
  code?: string;
  name?: string;
}

export interface MeUserDto {
  id?: string;
  loginName?: string;
  fullName?: string;
  email?: string;
}

export interface MePermissionsDto {
  user?: string;
  roles?: any[];
  type: string;
  description: Record<string, any>;
}

export interface ListUsersQueryDto {
  limit?: number;
  offset?: number;
  isActive?: boolean;
  departmentId?: string;
  search?: string;
}

export interface ResetPasswordDto {
  message: string;
}

export interface UpdateUserDto {
  fullName?: string;
  email?: string;
  departmentId?: string;
}

export interface UserRoleInfoDto {
  userRoleId?: string;
  roleCode?: string;
  roleName?: string;
  isActive?: boolean;
  grantedBy?: string;
  grantedAt?: string;
}

export interface UserSummaryDto {
  id?: string;
  loginName?: string;
  fullName?: string;
  email?: string;
  departmentId?: string;
  isLocked?: boolean;
  isActive?: boolean;
  mustChangePassword?: boolean;
  authVersion?: number;
  roles?: any[];
  createdAt?: string;
  updatedAt?: string;
}

export interface UserListResponseDto {
  items?: any[];
  total?: number;
  limit?: number;
  offset?: number;
}

export interface ResetPasswordResponseDto {
  temporaryPassword?: string;
  userId?: string;
}

export interface CreateIncidentDto {
  assetId?: string;
  description?: string;
  impactDescription?: string;
  occurredAt?: string;
}

export interface TransitionIncidentDto {
  to?: 'Object.values(IncidentStatus';
  reason?: string;
}

export interface CreateIncidentMessageDto {
  body?: string;
}

export interface CreateMaintenancePlanDto {
  assetId?: string;
  name?: string;
  intervalUnit?: 'Object.values(MaintenanceIntervalUnit';
  intervalValue?: number;
  startOn?: string;
  scheduleBasis?: 'Object.values(MaintenanceScheduleBasis';
  checklist?: any[];
  description?: string;
}

export interface UpdateMaintenancePlanDto {
  name?: string;
  intervalUnit?: 'Object.values(MaintenanceIntervalUnit';
  intervalValue?: number;
  checklist?: any[];
  isActive?: boolean;
  rowVersion?: string;
}

export interface ListNotificationsQueryDto {
  unread?: '[true' | 'false]';
  eventType?: string;
  limit?: string;
}

export interface CreateDepartmentDto {
  code?: string;
  name?: string;
}

export interface UpdateDepartmentDto {
  name?: string;
  isActive?: boolean;
}

export interface CreateLocationDto {
  code?: string;
  name?: string;
  parentId?: string;
}

export interface UpdateLocationDto {
  name?: string;
  parentId?: string;
  isActive?: boolean;
}

export interface CreateAssetTypeDto {
  code?: string;
  name?: string;
  description?: string;
}

export interface UpdateAssetTypeDto {
  name?: string;
  description?: string;
  isActive?: boolean;
}

export interface ListOrgQueryDto {
  limit?: number;
  offset?: number;
  isActive?: boolean;
}

export interface CreatePartDto {
  code?: string;
  name?: string;
  unit?: string;
  departmentId?: string;
  locationId?: string;
  referencePrice?: number;
  minimumStock?: number;
  supplierName?: string;
  requiresApproval?: boolean;
}

export interface UpdatePartDto {
  name?: string;
  unit?: string;
  referencePrice?: number;
  minimumStock?: number;
  supplierName?: string;
  requiresApproval?: boolean;
  isActive?: boolean;
  rowVersion?: string;
}

export interface AdjustPartDto {
  quantity?: number;
  reason?: string;
  rowVersion?: string;
}

export interface RecordStockMovementDto {
  partId?: string;
  quantity?: number;
  reason?: string;
  sourceNote?: string;
  occurredAt?: string;
}

export interface IssuePartDto {
  partId?: string;
  quantity?: number;
  sourceNote?: string;
}

export interface ReturnPartDto {
  originalStockTxId?: string;
  quantity?: number;
  reason?: string;
}

export interface ListStockTransactionsQueryDto {
  partId?: string;
  workOrderId?: string;
}

export interface UpdateTechnicalDocumentDto {
  title?: string;
  documentType?: string;
  description?: string;
  assetId?: string;
  assetTypeId?: string;
  isActive?: boolean;
}

export interface AddVersionDto {
  fileId?: string;
  changeNote?: string;
}

export interface GrantRoleAccessDto {
  roleId?: string;
}

export interface CreateWorkOrderDto {
  assetId?: string;
  kind?: 'Object.values(WorkOrderType';
  incidentId?: string;
  assigneeId?: string;
  creationMode?: 'Object.values(WorkOrderCreationMode';
  description?: string;
  priorityCode?: 'Object.values(IncidentPriority';
  dueAt?: string;
  checklist?: any[];
  downtimeStart?: string;
}

export interface TransitionWorkOrderDto {
  to?: 'Object.values(WorkOrderStatus';
  rowVersion?: string;
  reason?: string;
}

export interface AssignWorkOrderDto {
  assigneeId?: string;
  reason?: string;
}

export interface CompleteWorkOrderDto {
  resultSummary?: string;
  actionTaken?: string;
  confirmedCause?: string;
  checklistResults?: any[];
  downtimeEnd?: string;
}

export interface CancelWorkOrderDto {
  reason?: string;
}

export interface AddNoteDto {
  noteType?: 'Object.values(WorkOrderNoteType';
  note?: string;
  pauseReason?: 'Object.values(PauseReason';
}

export interface SlaTimelineQueryDto {
  from?: string;
  to?: string;
}

export interface PlanPartDto {
  partId?: string;
  plannedQuantity?: number;
  note?: string;
}

export interface parentFieldToCol {
}

export interface WorkOrderType {
}

export interface WorkOrderStatus {
}

export interface WorkOrderCreationMode {
}

export interface WorkOrderNoteType {
}

export interface PauseReason {
}

export interface IncidentPriority {
}

export interface IncidentStatus {
}

export interface IncidentMessageType {
}

export interface AssetManualState {
}

export interface ApprovalStatus {
}

export interface ApprovalEventType {
}

export interface CostCategory {
}

export interface CostDirection {
}

export interface MaintenanceIntervalUnit {
}

export interface MaintenanceScheduleBasis {
}

export interface MaintenanceOccurrenceStatus {
}

export interface NotificationType {
}

export interface AiRequestStatus {
}

export interface AiCategory {
}

// ============== API Client ==============
export interface ClientConfig {
  baseUrl: string;
  token?: string;
}

export class ApiClient {
  constructor(private config: ClientConfig) {}

  private async request<T>(method: string, path: string, body?: any, query?: Record<string, any>): Promise<T> {
    let url = this.config.baseUrl + path;
    if (query) {
      const qs = Object.entries(query).filter(([_, v]) => v !== undefined).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
      if (qs) url += '?' + qs;
    }
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.config.token) headers['Authorization'] = `Bearer ${this.config.token}`;
    const resp = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`${method} ${path} -> ${resp.status}: ${err}`);
    }
    const ct = resp.headers.get('content-type') || '';
    return ct.includes('json') ? resp.json() : (resp.text() as any);
  }

  async post_ai_incidents_id_analyze(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/ai/incidents/:id/analyze`, undefined, undefined);
  }

  async get_ai_requests_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/ai/requests/:id`, undefined, undefined);
  }

  async get_approvals(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/approvals`, undefined, query);
  }

  async post_approvals(body: CreateApprovalDto): Promise<any> {
    return this.request('POST', `/approvals`, body, undefined);
  }

  async get_approvals_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/approvals/:id`, undefined, undefined);
  }

  async patch_approvals_id(pathParams: { id: string }, body: ApprovalActionDto): Promise<any> {
    return this.request('PATCH', `/approvals/:id`, body, undefined);
  }

  async patch_approvals_id_draft(pathParams: { id: string }, body: UpdateDraftApprovalDto): Promise<any> {
    return this.request('PATCH', `/approvals/:id/draft`, body, undefined);
  }

  async post_approvals_id_revisions(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/approvals/:id/revisions`, undefined, undefined);
  }

  async get_assets(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/assets`, undefined, query);
  }

  async post_assets(body: CreateAssetDto): Promise<any> {
    return this.request('POST', `/assets`, body, undefined);
  }

  async get_assets_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/assets/:id`, undefined, undefined);
  }

  async patch_assets_id(pathParams: { id: string }, body: UpdateAssetDto): Promise<any> {
    return this.request('PATCH', `/assets/:id`, body, undefined);
  }

  async post_assets_id_lifecycle(pathParams: { id: string }, body: TransitionAssetStateDto): Promise<any> {
    return this.request('POST', `/assets/:id/lifecycle`, body, undefined);
  }

  async get_assets_id_qr(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/assets/:id/qr`, undefined, undefined);
  }

  async post_files(): Promise<any> {
    return this.request('POST', `/files`, undefined, undefined);
  }

  async get_files_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/files/:id`, undefined, undefined);
  }

  async delete_files_id(pathParams: { id: string }): Promise<any> {
    return this.request('DELETE', `/files/:id`, undefined, undefined);
  }

  async post_files_id_link(pathParams: { id: string }, body: LinkAttachmentDto): Promise<any> {
    return this.request('POST', `/files/:id/link`, body, undefined);
  }

  async get_files_id_download(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/files/:id/download`, undefined, undefined);
  }

  async post_auth_login(body: LoginDto): Promise<any> {
    return this.request('POST', `/auth/login`, body, undefined);
  }

  async post_auth_refresh(): Promise<any> {
    return this.request('POST', `/auth/refresh`, undefined, undefined);
  }

  async post_auth_logout(): Promise<any> {
    return this.request('POST', `/auth/logout`, undefined, undefined);
  }

  async post_auth_change_password(body: ChangePasswordDto): Promise<any> {
    return this.request('POST', `/auth/change-password`, body, undefined);
  }

  async get_system_settings(): Promise<any> {
    return this.request('GET', `/system-settings`, undefined, undefined);
  }

  async post_system_settings(body: CreateSystemSettingDto): Promise<any> {
    return this.request('POST', `/system-settings`, body, undefined);
  }

  async get_system_settings_key(pathParams: { key: string }): Promise<any> {
    return this.request('GET', `/system-settings/:key`, undefined, undefined);
  }

  async put_system_settings_key(pathParams: { key: string }, body: UpdateSystemSettingDto): Promise<any> {
    return this.request('PUT', `/system-settings/:key`, body, undefined);
  }

  async get_work_orders_workorderid_cost_entries(pathParams: { workOrderId: string }): Promise<any> {
    return this.request('GET', `/work-orders/:workOrderId/cost-entries`, undefined, undefined);
  }

  async post_work_orders_workorderid_cost_entries(pathParams: { workOrderId: string }, body: CreateCostEntryDto): Promise<any> {
    return this.request('POST', `/work-orders/:workOrderId/cost-entries`, body, undefined);
  }

  async get_dashboard_kpis(): Promise<any> {
    return this.request('GET', `/dashboard/kpis`, undefined, undefined);
  }

  async get_dashboard_overdue(): Promise<any> {
    return this.request('GET', `/dashboard/overdue`, undefined, undefined);
  }

  async get_dashboard_technician_load(): Promise<any> {
    return this.request('GET', `/dashboard/technician-load`, undefined, undefined);
  }

  async get_dashboard_asset_critical(): Promise<any> {
    return this.request('GET', `/dashboard/asset-critical`, undefined, undefined);
  }

  async get_dashboard_cost_trend(): Promise<any> {
    return this.request('GET', `/dashboard/cost-trend`, undefined, undefined);
  }

  async get_dashboard_action_items(): Promise<any> {
    return this.request('GET', `/dashboard/action-items`, undefined, undefined);
  }

  async get_healthz_live(): Promise<any> {
    return this.request('GET', `/healthz/live`, undefined, undefined);
  }

  async get_healthz_ready(): Promise<any> {
    return this.request('GET', `/healthz/ready`, undefined, undefined);
  }

  async get_healthz(): Promise<any> {
    return this.request('GET', `/healthz`, undefined, undefined);
  }

  async get_iam_me_permissions(): Promise<any> {
    return this.request('GET', `/iam/me/permissions`, undefined, undefined);
  }

  async get_iam_users(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/iam/users`, undefined, query);
  }

  async post_iam_users(body: CreateUserDto): Promise<any> {
    return this.request('POST', `/iam/users`, body, undefined);
  }

  async get_iam_users_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/iam/users/:id`, undefined, undefined);
  }

  async patch_iam_users_id(pathParams: { id: string }, body: UpdateUserDto): Promise<any> {
    return this.request('PATCH', `/iam/users/:id`, body, undefined);
  }

  async post_iam_users_id_reset_password(pathParams: { id: string }, body: ResetPasswordDto): Promise<any> {
    return this.request('POST', `/iam/users/:id/reset-password`, body, undefined);
  }

  async post_iam_users_id_lock(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/iam/users/:id/lock`, undefined, undefined);
  }

  async post_iam_users_id_unlock(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/iam/users/:id/unlock`, undefined, undefined);
  }

  async get_iam_roles(): Promise<any> {
    return this.request('GET', `/iam/roles`, undefined, undefined);
  }

  async get_iam_permissions(): Promise<any> {
    return this.request('GET', `/iam/permissions`, undefined, undefined);
  }

  async post_iam_users_id_roles(pathParams: { id: string }, body: GrantRoleDto): Promise<any> {
    return this.request('POST', `/iam/users/:id/roles`, body, undefined);
  }

  async delete_iam_users_id_roles_userroleid(pathParams: { id: string; userRoleId: string }): Promise<any> {
    return this.request('DELETE', `/iam/users/:id/roles/:userRoleId`, undefined, undefined);
  }

  async get_iam_audit_logs(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/iam/audit-logs`, undefined, query);
  }

  async get_incidents(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/incidents`, undefined, query);
  }

  async post_incidents(body: CreateIncidentDto): Promise<any> {
    return this.request('POST', `/incidents`, body, undefined);
  }

  async get_incidents_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/incidents/:id`, undefined, undefined);
  }

  async post_incidents_id_transition(pathParams: { id: string }, body: TransitionIncidentDto): Promise<any> {
    return this.request('POST', `/incidents/:id/transition`, body, undefined);
  }

  async post_incidents_id_messages(pathParams: { id: string }, body: CreateIncidentMessageDto): Promise<any> {
    return this.request('POST', `/incidents/:id/messages`, body, undefined);
  }

  async get_maintenance_occurrences_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/maintenance-occurrences/:id`, undefined, undefined);
  }

  async post_maintenance_occurrences_id_skip(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/maintenance-occurrences/:id/skip`, undefined, undefined);
  }

  async post_maintenance_occurrences_id_generate_now(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/maintenance-occurrences/:id/generate-now`, undefined, undefined);
  }

  async get_maintenance_plans(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/maintenance-plans`, undefined, query);
  }

  async post_maintenance_plans(body: CreateMaintenancePlanDto): Promise<any> {
    return this.request('POST', `/maintenance-plans`, body, undefined);
  }

  async get_maintenance_plans_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/maintenance-plans/:id`, undefined, undefined);
  }

  async patch_maintenance_plans_id(pathParams: { id: string }, body: UpdateMaintenancePlanDto): Promise<any> {
    return this.request('PATCH', `/maintenance-plans/:id`, body, undefined);
  }

  async get_maintenance_plans_id_occurrences(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/maintenance-plans/:id/occurrences`, undefined, undefined);
  }

  async post_maintenance_plans_id_pause(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/maintenance-plans/:id/pause`, undefined, undefined);
  }

  async post_maintenance_plans_id_resume(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/maintenance-plans/:id/resume`, undefined, undefined);
  }

  async post_maintenance_plans_tick(): Promise<any> {
    return this.request('POST', `/maintenance-plans/tick`, undefined, undefined);
  }

  async get_notifications(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/notifications`, undefined, query);
  }

  async get_notifications_unread_count(): Promise<any> {
    return this.request('GET', `/notifications/unread-count`, undefined, undefined);
  }

  async patch_notifications_read_all(): Promise<any> {
    return this.request('PATCH', `/notifications/read-all`, undefined, undefined);
  }

  async patch_notifications_id_read(pathParams: { id: string }): Promise<any> {
    return this.request('PATCH', `/notifications/:id/read`, undefined, undefined);
  }

  async get_parts(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/parts`, undefined, query);
  }

  async post_parts(body: CreatePartDto): Promise<any> {
    return this.request('POST', `/parts`, body, undefined);
  }

  async get_parts_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/parts/:id`, undefined, undefined);
  }

  async patch_parts_id(pathParams: { id: string }, body: UpdatePartDto): Promise<any> {
    return this.request('PATCH', `/parts/:id`, body, undefined);
  }

  async post_parts_id_adjust(pathParams: { id: string }): Promise<any> {
    return this.request('POST', `/parts/:id/adjust`, undefined, undefined);
  }

  async get_ws(): Promise<any> {
    return this.request('GET', `/ws`, undefined, undefined);
  }

  async get_reports_type(pathParams: { type: string }): Promise<any> {
    return this.request('GET', `/reports/:type`, undefined, undefined);
  }

  async post_technical_documents(body: CreateTechnicalDocumentDto): Promise<any> {
    return this.request('POST', `/technical-documents`, body, undefined);
  }

  async get_technical_documents(): Promise<any> {
    return this.request('GET', `/technical-documents`, undefined, undefined);
  }

  async get_technical_documents_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/technical-documents/:id`, undefined, undefined);
  }

  async patch_technical_documents_id(pathParams: { id: string }, body: UpdateTechnicalDocumentDto): Promise<any> {
    return this.request('PATCH', `/technical-documents/:id`, body, undefined);
  }

  async post_technical_documents_id_versions(pathParams: { id: string }, body: AddVersionDto): Promise<any> {
    return this.request('POST', `/technical-documents/:id/versions`, body, undefined);
  }

  async post_technical_documents_id_roles(pathParams: { id: string }, body: GrantRoleAccessDto): Promise<any> {
    return this.request('POST', `/technical-documents/:id/roles`, body, undefined);
  }

  async delete_technical_documents_id_roles_roleid(pathParams: { id: string; roleId: string }): Promise<any> {
    return this.request('DELETE', `/technical-documents/:id/roles/:roleId`, undefined, undefined);
  }

  async get_work_orders(query?: Record<string, any>): Promise<any> {
    return this.request('GET', `/work-orders`, undefined, query);
  }

  async post_work_orders(body: CreateWorkOrderDto): Promise<any> {
    return this.request('POST', `/work-orders`, body, undefined);
  }

  async get_work_orders_id(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/work-orders/:id`, undefined, undefined);
  }

  async get_work_orders_id_sla_status(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/work-orders/:id/sla-status`, undefined, undefined);
  }

  async patch_work_orders_id_assign(pathParams: { id: string }, body: AssignWorkOrderDto): Promise<any> {
    return this.request('PATCH', `/work-orders/:id/assign`, body, undefined);
  }

  async patch_work_orders_id_transition(pathParams: { id: string }, body: TransitionWorkOrderDto): Promise<any> {
    return this.request('PATCH', `/work-orders/:id/transition`, body, undefined);
  }

  async post_work_orders_id_complete(pathParams: { id: string }, body: CompleteWorkOrderDto): Promise<any> {
    return this.request('POST', `/work-orders/:id/complete`, body, undefined);
  }

  async post_work_orders_id_cancel(pathParams: { id: string }, body: CancelWorkOrderDto): Promise<any> {
    return this.request('POST', `/work-orders/:id/cancel`, body, undefined);
  }

  async post_work_orders_id_notes(pathParams: { id: string }, body: AddNoteDto): Promise<any> {
    return this.request('POST', `/work-orders/:id/notes`, body, undefined);
  }

  async get_work_orders_id_parts_planned(pathParams: { id: string }): Promise<any> {
    return this.request('GET', `/work-orders/:id/parts/planned`, undefined, undefined);
  }

  async post_work_orders_id_parts_planned(pathParams: { id: string }, body: PlanPartDto): Promise<any> {
    return this.request('POST', `/work-orders/:id/parts/planned`, body, undefined);
  }

}
