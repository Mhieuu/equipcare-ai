# Doc04 — Thiết kế cơ sở dữ liệu và ERD

**Baseline Status : LOCKED v1.2** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document04_CSDL_ERD_v1_2_Clean.docx` (phiên bản gốc 1.2, 08/09/2026, hiệu chỉnh diễn đạt và thuật ngữ).
> File gốc lưu tại `~/Downloads/DATN/Document04_CSDL_ERD_v1_2_Clean.docx` (ngoài repo).

## Căn cứ thiết kế

| Tài liệu | Phạm vi sử dụng |
|---|---|
| Doc01 v1.4 | Đối tượng nghiệp vụ, BR-01..BR-24, NV-01..NV-20 |
| Doc02 (SRS) v1.4 | Yêu cầu P1, DR-01..DR-11, FR, AC-01..AC-14 |
| Doc03 (UC/RBAC) v1.4 | Mục tiêu sử dụng, ranh giới vai trò, phạm vi dữ liệu |

## Quyết định thiết kế chốt (M0)

- **Single-tenant MVP**: `org_unit` chỉ 1 bản ghi, UUID cố định seed (`00000000-0000-4000-8000-000000000001`).
- **PK**: UUID v4 trong toàn bộ bảng nghiệp vụ.
- **Tên bảng/cột**: snake_case (DB) ↔ PascalCase (Prisma model).
- **Enum**: lưu kiểu PostgreSQL enum hoặc text + CHECK constraint; migration rõ ràng.
- **Mã hiển thị** (asset_code, work_order_no, approval_no, …) UNIQUE theo org_unit.
- **Soft delete**: `deleted_at` cho entity nghiệp vụ; entity vòng đời dùng `status`/`archived_at`.

## Bảng trạng thái (đã chốt M0)

| Entity | Enum (giá trị) |
|---|---|
| Asset.lifecycle_status (cột) | `ACTIVE \| PAUSED \| RETIRED` |
| Asset.activity_status (dẫn xuất) | `NORMAL \| UNDER_REPAIR \| UNDER_MAINTENANCE` |
| Incident | `NEW \| ASSIGNED \| AWAITING_INFO \| IN_PROGRESS \| RESOLVED \| CLOSED \| CANCELLED` (**không REOPENED**) |
| Work Order | `NEW \| ASSIGNED \| IN_PROGRESS \| WAITING_APPROVAL \| COMPLETED \| CANCELLED` (**không PAUSED/WAITING_PARTS**) |
| Approval | `DRAFT \| PENDING \| AWAITING_INFO \| APPROVED \| REJECTED \| CANCELLED` |
| Plan | `ACTIVE \| PAUSED \| ARCHIVED` |
| Occurrence | `SCHEDULED \| DUE \| OVERDUE \| SKIPPED \| COMPLETED \| CANCELLED` |

## ERD theo nhóm (33 bảng)

1. **Identity & Org**: `org_unit`, `users`, `sessions`, `login_attempts`, `password_reset_tokens`.
2. **Master**: `departments`, `locations`, `asset_types`, `incident_categories`, `vendors`, `sla_policies`.
3. **Asset**: `assets`, `asset_status_history`, `asset_qr_tokens`, `technical_documents`, `document_versions`, `document_roles`.
4. **Maintenance**: `maintenance_plans`, `plan_occurrences`, `plan_generation_log`.
5. **Incident**: `incidents`, `incident_messages`, `incident_history`.
6. **Work Order**: `work_orders`, `work_order_tasks`, `work_order_status_history`, `work_order_collaborators`, `work_order_checklist_items`, `work_logs`.
7. **Inventory**: `spare_parts`, `part_balances` (`UNIQUE(spare_part_id)`), `stock_transactions` (`operation_key UNIQUE`), `low_stock_alerts`, `part_movements`.
8. **Approval & Cost**: `approval_requests`, `approval_items`, `approval_history`, `approval_revisions`, `cost_entries`.
9. **Notification**: `notifications`, `notification_jobs`, `outbox_events`.
10. **File**: `files` (STAGED/READY/EXPIRED), `attachment_links`.
11. **AI**: `ai_requests`, `ai_suggestions`, `ai_jobs`.
12. **Catalog**: `role_permissions`, `user_role_scopes`, `audit_logs`, `thresholds`, `reports`, `dashboards`.

> Cột `event_type` trong `work_order_status_history`: `ASSIGNED \| STARTED \| PAUSED \| RESUMED \| WAITING_APPROVAL_ENTER \| WAITING_APPROVAL_EXIT \| COMPLETED \| CANCELLED`. Pause/reason lưu ở row `PAUSED`/`RESUMED`.

## Ràng buộc quan trọng

- FK entity nghiệp vụ → cùng `org_unit_id` (enforce ở service + composite FK khi hợp lệ).
- `thresholds.key` UNIQUE; `MAINTENANCE_DUE_GRACE_HOURS` (mặc định 24 giờ) lưu trong `thresholds`.
- `plans UNIQUE(plan_id, due_on)`; per-occurrence WO partial unique.
- Không assignee bị disabled; Không issue part cho WO CLOSED/CANCELLED.
- Không approve chính request của mình.

## Q-items chốt (xem IMPLEMENTATION_PLAN §5)

Q-01..Q-07 đã chốt trong M0. Mọi thay đổi phải qua form change request.

> Toàn bộ ERD chi tiết, từ điển dữ liệu 33 bảng, ràng buộc & chỉ mục xem file gốc `.docx`.
