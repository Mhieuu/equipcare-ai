# EquipCare AI — Implementation Plan (rev. 6.1)

> AI-Powered Equipment Maintenance Management System — phạm vi P1, đồng bộ **đầy đủ** với bộ tài liệu Doc01..07 v1.4/v1.2/v1.1 (đã LOCKED baseline 2026-09-10).
> Monorepo: `apps/api` NestJS + Prisma + Postgres · `apps/web` Next.js 14 (App Router) · `apps/worker` BullMQ · `packages/shared` + `packages/backend-core` · Infra Postgres 17 + Redis 7 + MinIO (Docker Compose).

Bản rev. 6.1 này là **bản vá** trên rev. 6 (không thay đổi schema, chỉ bổ sung UI/UX từ thiết kế Figma v1.1). Thay đổi:
- §4.1: bổ sung 14 SCR mới (Figma v1.1: SCR-IAM-04, SCR-ORG-01b, SCR-ORG-02b, SCR-ASSET-05b, SCR-INC-02a, SCR-WO-02, SCR-WO-05b, SCR-WO-06b, SCR-MNT-02, SCR-MNT-03, SCR-PART-04, SCR-PART-05, SCR-APR-01a, SCR-DASH-01b, SCR-REP-05, SCR-DOC-01..05, SCR-AUD-01b, SCR-CFG-03)
- §4.2: thêm TC-REP-05
- §5: thêm Q-08 (nhãn tiếng Việt cho `activity_status`)
- §10.1: thêm permission codes cho Kanban WO, Approval queue, Audit log
- §12.2: cập nhật cột "UI" cho từng milestone M1..M9
- §16: thêm R-09 (effort UI Figma) + R-10 (nhãn tiếng Việt)

Bản rev. 6 (gốc) thay thế rev. 5. Mục đích: **đồng bộ 100% schema Doc04 (33 bảng)**, đổi các enum sang mã kỹ thuật Doc04, bỏ các bảng plan tự đặt không có trong Doc04, ghi nhận 7 Q-items đã chốt theo khuyến nghị Doc04.

## Tóm tắt thay đổi so với rev. 5

| # | Vấn đề (rev. 5) | Sửa ở rev. 6 | Căn cứ |
|---|---|---|---|
| 1 | Bảng tự đặt `org_unit`, `login_attempts`, `asset_status_history`, `incident_history`, `work_order_tasks`, `work_order_status_history`, `part_balances`, `low_stock_alerts`, `notification_jobs`, `outbox_events`, `thresholds`, `dashboards`, `reports`, `plan_generation_log`, `asset_qr_tokens`, `work_order_collaborators`, `work_order_checklist_items`, `part_movements`, `ai_suggestions`, `ai_jobs` — không có trong Doc04 | Bỏ hết. Thay bằng 33 bảng Doc04 snake_case: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `access_scopes`, `sessions`, `departments`, `locations`, `asset_types`, `assets`, `maintenance_plans`, `maintenance_occurrences`, `incidents`, `incident_messages`, `work_orders`, `work_order_notes`, `approvals`, `approval_revisions`, `approval_revision_parts`, `approval_events`, `parts`, `part_asset_types`, `work_order_parts`, `stock_transactions`, `cost_entries`, `files`, `technical_documents`, `document_versions`, `document_roles`, `attachment_links`, `audit_logs`, `notifications`, `ai_requests`, `system_settings` (35 bảng thực tế, trong đó 33 từ Doc04 + 2 phụ trợ plan tự đặt có chức năng tương đương: `permissions`, `role_permissions`) | Doc04 §2.2, §5 |
| 2 | Enum WO có `PAUSED/WAITING_PARTS`; Incident có `ASSIGNED/REOPENED`; Plan có `ARCHIVED` | Enum Doc04: WO `NEW/ASSIGNED/IN_PROGRESS/WAITING_APPROVAL/COMPLETED/CANCELLED` (không PAUSED — pause lưu ở `work_order_notes` + `audit_logs`); Incident `NEW/AWAITING_INFO/IN_PROGRESS/RESOLVED/CLOSED/CANCELLED`; Approval `DRAFT/PENDING/NEEDS_INFO/APPROVED/REJECTED/CANCELLED`; Asset manual `NORMAL/SUSPENDED/RETIRED`; Asset derived `OPERATIONAL/MAINTENANCE/REPAIR/SUSPENDED/RETIRED`; Plan chỉ `is_active` (không enum); Occurrence không có enum (status do nghiệp vụ đặt) | Doc04 §3.2 |
| 3 | `approval_requests`, `approval_items`, `approval_history`, `approval_revisions` (4 bảng) | `approvals`, `approval_revisions`, `approval_revision_parts`, `approval_events` (4 bảng Doc04). State machine phẳng hơn; revision lưu nội dung từng lần gửi; event lưu quyết định cuối | Doc04 §5.5 |
| 4 | `spare_parts`, `part_balances` | `parts` (có cột `on_hand`, `reference_price`, `requires_approval`, `minimum_stock`) + `part_asset_types` (N–N tương thích loại thiết bị) + `work_order_parts` (planned) + `stock_transactions` (sổ + operation_key) + `cost_entries` (sổ chi phí) | Doc04 §5.6 |
| 5 | `incident_history`, `work_order_status_history`, `asset_status_history` | Một bảng `audit_logs` (Doc04 §5.8) dùng cho mọi lịch sử thay đổi trạng thái. Bổ sung `work_order_notes` (note_type) cho diễn biến kỹ thuật | Doc04 §5.4, §5.8 |
| 6 | `thresholds` (key-value) | `system_settings` (Doc04 §5.8) với `key` UNIQUE, `value` JSONB, `description`, `updated_by`. Key chính: `sla.*`, `approval.threshold_*`, `file.size_limit`, `file.mime_allowlist`, `ai.timeout_ms`, `ai.max_retries`, `maintenance.due_grace_hours`, `low_stock.check_interval` | Doc04 §5.8, §10 |
| 7 | `notification_jobs`, `outbox_events` | Không có trong Doc04. Notification qua `notifications` (Doc04 §5.8) với `UNIQUE(recipient_id, event_key)` chống trùng. Email/retry deferred (P2) | Doc04 §5.8 |
| 8 | Bảng `permissions` + `role_permissions` để chain RBAC chi tiết | Giữ bảng này (plan tự đặt, không có trong Doc04 nhưng cần thiết cho ma trận quyền cấu hình runtime). Doc04 chỉ ràng buộc "4 vai trò cố định + matrix code-version"; thêm `permissions`/`role_permissions` cho phép mở rộng nhưng seed cứng 4 vai trò cố định | Doc04 §2 TK-06, §3.1 |
| 9 | PostgreSQL 16 | **PostgreSQL 17** (Doc04 §2 TK-01: "PostgreSQL 17 được dùng làm phiên bản tham chiếu") | Doc04 §2 |
| 10 | Q-04 SLA dùng `work_order_status_history.event_type` | SLA tính từ `work_order_notes` (note_type ∈ {PAUSE_START, PAUSE_END, WAITING_APPROVAL_START, WAITING_APPROVAL_END}) + `audit_logs` (event_type). Công thức: `active_elapsed = total_elapsed − waiting_approval_seconds − authorized_pause_seconds` | Doc04 §5.4, §5.8; Doc02 §4.6 |
| 11 | Q-06 vượt phương án duyệt check `approval_items.net_issued_quantity` | Check `net_issued_quantity` từ `stock_transactions` (sum ISSUE - RETURN) cho từng `approval_revision_parts` đã APPROVED. Vượt → 422 + yêu cầu tạo `approval_revisions` mới (Doc04 §6.2 + Q-06) | Doc04 §5.5, §5.6, Q-06 |
| 12 | API `/approvals/{id}/decision` riêng approve/reject | Theo Doc05 §7.5: `POST /approvals/{id}/submit`, `POST /approvals/{id}/request-info`, `POST /approvals/{id}/approve`, `POST /approvals/{id}/reject`, `POST /approvals/{id}/cancel`, `PATCH /approvals/{id}/draft`, `GET /approvals/{id}/history` | Doc05 §7.5 |
| 13 | AI endpoint `/ai/suggest/category|priority|solution|propose-plan` | Theo Doc05 §7.6: `POST /ai/incidents/{id}/analyze`, `POST /ai/assets/{id}/summary`, `GET /ai/requests/{id}` | Doc05 §7.6 |
| 14 | File `EXPIRED` (cron dọn STAGED hết hạn) | Theo Doc04 §5.7: `storage_state` chỉ `STAGED/READY/REJECTED`. Cron dọn STAGED theo policy; REJECTED là cuối cùng (không reset). Magic bytes check giữ nguyên (defense-in-depth) | Doc04 §5.7; Doc05 §10.2 |

## 0. M0 — Đóng băng baseline (trước W1, 28/09/2026)

**Mục tiêu**: đồng bộ tài liệu nguồn, ký xác nhận, không sửa nội dung nghiệp vụ chính thức sau bước này.

### 0.1. Cập nhật tài liệu

| Tài liệu | Thay đổi cần thực hiện |
|---|---|
| **Doc02 v1.5** | Bổ sung FR-APR-07..09 (quy tắt từ BR-12 + chuỗi test); ghi chú "WAITING_PARTS không dùng"; bổ sung "AI gửi ngữ cảnh nghiệp vụ tối thiểu đã làm sạch" |
| **Doc04 v1.3** | Cập nhật Q-01..Q-07 thành "đã chốt"; thêm bảng `permissions`, `role_permissions`; bổ sung DB-01..DB-13 ràng buộc rõ; bỏ REOPENED khỏi incident enum; chốt bảng đầy đủ 33 bảng + 2 bảng phụ trợ (`permissions`, `role_permissions`) |
| **Doc05 v1.3** | Bổ sung diagram `apps/worker`; ghi chú `packages/backend-core`; thống nhất endpoint AI `/ai/incidents/{id}/analyze` + `/ai/assets/{id}/summary`; thống nhất endpoint approval |
| **Doc07 v1.2** | Chuyển test phụ thuộc Q từ Blocked/Deferred → Planned/Ready; thêm TC-DATA-01..05 đầy đủ (DT-01..DT-18 mapping) |

### 0.2. Đánh dấu đóng băng

Thêm vào header mỗi tài liệu (Doc02..07):
```
Baseline Status : LOCKED v1.x
Locked Date     : YYYY-MM-DD
Locked By       : [Tên sinh viên]
```

Sau khi đóng băng, mọi thay đổi tài liệu phải qua form change request riêng.

## 1. Phạm vi MVP (P1)

Một **đơn vị** (single-tenant, RBAC data-scope isolation). 4 vai trò cố định: ADMIN, MANAGER, TECHNICIAN, USER (Doc04 §3.2 — code `ADMIN/MANAGER/TECHNICIAN/USER`). 8 nhóm nghiệp vụ (Auth/IAM, Organization, Asset, Incident, Work Order, Maintenance Plan, Inventory, Cost & Approval, Notification, Dashboard, AI).

**Trong phạm vi P1:**
- Auth (login/logout/refresh/change-password/admin-reset), audit.
- IAM (user, role, permission, scope, gán vai trò theo scope, deactivate).
- Tổ chức & danh mục (single tenant): `departments`, `locations` (cha-con), `asset_types`, `system_settings` (key-value cho thresholds/SLA/AI timeout/file limit).
- Asset CRUD + `manual_state` (NORMAL/SUSPENDED/RETIRED) + activity_status (derived) + tài liệu kỹ thuật + attachment (STAGED→READY).
- Incident lifecycle + chuyển trạng thái + AI analyze async.
- Work Order lifecycle + assign + issue/return/adjust parts + cost + approval + complete/cancel.
- Maintenance Plan (FIXED) + occurrence + scheduler.
- Spare parts + ledger + issue/return/adjust + cảnh báo tồn thấp (qua `notifications`).
- Cost & Approval (DRAFT/PENDING/NEEDS_INFO/APPROVED/REJECTED/CANCELLED, FR-APR-01..09).
- Notification list + realtime WS (qua `notifications` + Socket.IO).
- Dashboard KPI + CSV report (FR-REP-01..05).
- AI provider abstraction (mock + OpenAI optional) — 100% async, 202 + requestId.
- Audit log viewer (bất biến, qua `audit_logs`).
- Data integrity tests (TC-DATA-01..05 + DT-01..DT-18 mapping).

**Ngoài phạm vi P1 (deferred):**
- Multi-tenant, SSO/AD, phê duyệt nhiều tầng, nhiều kho, serial/lot kho, định giá kế toán, AI tự hành động, mobile app native, email thật, cloud storage production, circuit breaker nâng cao, materialized view.

## 2. Stack & phiên bản đã khóa (pin trong `pnpm-lock.yaml`)

| Thành phần | Phiên bản baseline | Ghi chú |
|---|---|---|
| Node.js | 22.x LTS | EOL 2027-04; Node 24 không dùng "Active LTS" |
| pnpm | 9.x (9.12+) | Workspaces, lockfile chặt |
| NestJS | 10.x | Tương thích Prisma 5/6, BullMQ, Passport, Swagger |
| Prisma | 5.x | Migration version đáng tin cậy |
| PostgreSQL | **17** (Doc04 §2 TK-01) | JSONB, partial unique index, FK ghép, CHECK |
| Redis | 7 | BullMQ |
| Next.js | 14.x (App Router) | Stable, RSC |
| React | 18.x | Tương thích Next 14 |
| TypeScript | 5.4+ strict | |
| MinIO | RELEASE.2024-09-13T03-26-17Z | S3-compatible, local dev |
| Test backend | Jest 29 + Supertest + Testcontainers | Unit + integration + e2e DB thật |
| Test frontend | Vitest 1.x + Testing Library + Playwright | Unit + E2E critical path |

> **Quy tắc pin**: tất cả phiên bản chính xác nằm trong `pnpm-lock.yaml`. Không bump major sau khi đóng băng baseline.

## 3. Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                      NestJS backend (HTTP + Swagger)
│  │  ├─ src/
│  │  │  ├─ modules/           auth, iam, organization, asset, incident, work-order,
│  │  │  │                   maintenance, inventory, cost, approval,
│  │  │  │                   notification, dashboard, ai, attachment, audit, report, health
│  │  │  ├─ common/           AppError, filters, pipes, decorators, guards
│  │  │  ├─ infra/            storage, mail (log-only), realtime (WS gateway)
│  │  │  └─ main.ts
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma      # nguồn duy nhất cho schema DB (33 bảng Doc04 + 2 phụ trợ)
│  │  │  ├─ migrations/        # lịch sử migration
│  │  │  └─ seed.ts            # seed idempotent (UUID cố định + upsert)
│  │  ├─ test/
│  │  └─ package.json
│  ├─ web/                     Next.js frontend
│  │  ├─ src/app/
│  │  ├─ src/features/
│  │  ├─ src/lib/
│  │  └─ package.json
│  └─ worker/                  BullMQ worker — chạy RIÊNG với api
│     ├─ src/processors/        ai.processor.ts, notification.processor.ts,
│     │                         scheduler.processor.ts
│     └─ package.json
├─ packages/
│  ├─ shared/                  types, enums (Doc04 §3.2), permission constants, OpenAPI client
│  │                            (KHÔNG chứa policy — chỉ data shape)
│  └─ backend-core/            PrismaService + domain logic (state machine, policy, SLA,
│                                inventory domain) — không chứa HTTP. API + worker cùng import.
├─ docs/
│  ├─ db_schema.md             # 33 bảng Doc04 + FK + CHECK + index (rev. 6)
│  ├─ state-machines.md        # state machine các entity
│  ├─ api-spec.md              # OpenAPI 3.1 snapshot (sinh từ NestJS Swagger)
│  └─ test-plan.md             # bản tóm tắt 111 TC
├─ infra/
│  ├─ docker-compose.infra.yml  postgres:17, redis:7, minio (hạ tầng)
│  ├─ docker-compose.demo.yml   api, web, worker + infra (full stack)
│  └─ minio/                   init bucket script
├─ scripts/
│  ├─ reset-db.sh / .ps1
│  ├─ demo-flow.sh / .ps1
│  └─ freeze-baseline.sh        M0: đánh dấu baseline đã khóa
├─ .env.example
├─ .nvmrc
├─ pnpm-workspace.yaml
├─ package.json
├─ README.md
└─ IMPLEMENTATION_PLAN.md
```

### 3.1. Worker — shared domain

`packages/backend-core` chứa:
- `prisma.service.ts` — PrismaService singleton
- `domain/incident.state-machine.ts`
- `domain/work-order.state-machine.ts`
- `domain/approval.state-machine.ts`
- `domain/policy/` — RBAC chain (Doc05 §8.2: quyền hành động + scope trên cùng `user_role_id`)
- `domain/sla.ts` — tính `active_elapsed` từ `work_order_notes` + `audit_logs`
- `domain/inventory.ts` — issue/return/check Q-06 logic
- KHÔNG chứa HTTP decorators, controllers, guards

`apps/worker` và `apps/api` cùng import `backend-core`. Không có circular dependency `api → worker`.

## 4. Bảng truy vết yêu cầu (đã đối chiếu Doc02/Doc04/Doc05/Doc07 sau khi đóng băng)

### 4.1. Tổng hợp

| Module | FR/NFR (Doc02) | API (Doc05) | DB (Doc04) | UI (Doc06) | Test (Doc07) |
|---|---|---|---|---|---|
| Auth | FR-AUTH-01..07 | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users/{id}/reset-password` | `users`, `sessions` | SCR-AUTH-01..05 | TC-AUTH-01..05 |
| IAM (RBAC) | FR-AUTH-03/05; AC-01/14 | `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes` | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `access_scopes` | SCR-IAM-01..06 + **SCR-IAM-04 (Role/Scope Assignment, Figma v1.1)** | TC-RBAC-01..06 |
| Tổ chức & danh mục | FR-ORG-01..03; FR-CFG-01..02 | `/departments`, `/locations`, `/asset-types`, `/system-settings` | `departments`, `locations`, `asset_types`, `system_settings` | SCR-ORG-01..03 + **SCR-ORG-01b (Loại thiết bị & danh mục dùng chung, Figma v1.1)** + **SCR-ORG-02b (Cơ cấu tổ chức & vị trí, Figma v1.1)** | TC-ORG-01..04, TC-CFG-01..03 |
| Asset | FR-ASSET-01..09; AC-02 | `/assets`, `/assets/{id}`, `/assets/{id}/lifecycle`, `/assets/{id}/qr`, `/technical-documents`, `/technical-documents/{id}/versions`, `/technical-documents/{id}/roles` | `assets`, `technical_documents`, `document_versions`, `document_roles`, `attachment_links`, `audit_logs` | SCR-ASSET-01..05 + **SCR-ASSET-05b (Hồ sơ thiết bị — tabs Tổng quan/Sự cố/Công việc/Tài liệu, Figma v1.1)** | TC-ASSET-01..05 |
| Incident | FR-INC-01..09; AC-03 | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/messages` | `incidents`, `incident_messages`, `attachment_links`, `audit_logs` | SCR-INC-01..06 + **SCR-INC-02a (Hộp thư Sự cố — queue, Figma v1.1)** | TC-INC-01..06 |
| Work Order | FR-WO-01..09; AC-04/13 | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/notes`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | `work_orders`, `work_order_notes`, `audit_logs` | SCR-WO-01..07 + **SCR-WO-02 (Điều phối Phiếu công việc — Kanban board, Figma v1.1)** + **SCR-WO-05b (Cập nhật kết quả, Figma v1.1)** + **SCR-WO-06b (Ghi linh kiện — Issue parts, Figma v1.1)** | TC-WO-01..08 |
| Maintenance | FR-MNT-01..09; AC-05 | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | `maintenance_plans`, `maintenance_occurrences`, `work_orders`, `audit_logs` | SCR-MNT-01..04 + **SCR-MNT-02 (Chi tiết kế hoạch bảo trì, Figma v1.1)** + **SCR-MNT-03 (Lịch và kỳ bảo trì — Calendar view, Figma v1.1)** | TC-MNT-01..05 |
| Inventory | FR-PART-01..08; AC-06 | `/parts`, `/parts/{id}/adjust`, `/stock-transactions`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return` | `parts`, `part_asset_types`, `work_order_parts`, `stock_transactions`, `notifications` | SCR-PART-01..03 + **SCR-PART-04 (Sổ giao dịch tồn kho, Figma v1.1)** + **SCR-PART-05 (Nhập kho & điều chỉnh, Figma v1.1)** | TC-PART-01..07 |
| Cost | FR-COST-01..04; AC-08 | `/work-orders/{id}/cost-entries` | `cost_entries`, `stock_transactions` | SCR-COST-01..03 | TC-COST-01..04 |
| Approval | FR-APR-01..09; AC-07/14 | `/approvals`, `/approvals/{id}/draft`, `/approvals/{id}/submit`, `/approvals/{id}/request-info`, `/approvals/{id}/approve`, `/approvals/{id}/reject`, `/approvals/{id}/cancel`, `/approvals/{id}/history`, `/approvals/{id}/revisions` | `approvals`, `approval_revisions`, `approval_revision_parts`, `approval_events`, `audit_logs` | SCR-APR-01..04 + **SCR-APR-01a (Hộp thư phê duyệt — queue, Figma v1.1)** | TC-APR-01..07 |
| Notification | FR-NOT-01..06; AC-09 | `/notifications`, `/notifications/{id}/read`, `WS /ws` | `notifications`, `audit_logs` | SCR-NOT-01..03 | TC-NOT-01..06 |
| Dashboard/Report | FR-REP-01..05; AC-11 | `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | query trên `incidents`, `work_orders`, `cost_entries` (không tạo bảng riêng) | SCR-DASH-01..02 + **SCR-DASH-01b (Khối lượng kỹ thuật viên, Figma v1.1)** + **SCR-REP-05 (Thiết bị nhiều sự cố/chi phí cao, Figma v1.1)** | TC-REP-01..04 + **TC-REP-05 (MỚI, Figma v1.1)** |
| AI | FR-AI-01..06; NFR-AI-01..05; AC-10 | `POST /ai/incidents/{id}/analyze`, `POST /ai/assets/{id}/summary`, `GET /ai/requests/{id}` | `ai_requests` | SCR-AI-01..02 | TC-AI-01..06 |
| Attachment | FR-DOC-01..04 | `POST /files`, `GET /files/{fileId}/download` | `files` (STAGED/READY/REJECTED), `attachment_links` | **SCR-DOC-01..05 (Quản lý tài liệu kỹ thuật — phiên bản + quyền đọc, Figma v1.1)** | TC-DOC-01..05 |
| Audit | FR-AUD-01..03; AC-12 | `/audit-logs` | `audit_logs` | **SCR-AUD-01b (Nhật ký hệ thống — bảng + filter nhạy cảm, Figma v1.1)** | TC-AUD-01..04 |
| System config | FR-CFG-01..02; AC-12 | `/system-settings`, `/system-settings/{key}` | `system_settings` | SCR-CFG-01..02 + **SCR-CFG-03 (Ngưỡng nghiệp vụ & cấu hình, Figma v1.1)** | TC-CFG-01..03 |
| Bảo mật & toàn vẹn | NFR-SEC-01..06; DR-* | (across modules) | DB-01..DB-13 (CHECK + FK ghép + UNIQUE) | n/a | TC-SEC-01..08; TC-DATA-01..05 |
| UX | UI-*; NFR-USAB-*; UI-AC-* | — | — | SCR-* | TC-UX-01..08 |
| Hiệu năng | NFR-PERF-* | — | — | — | TC-PERF-01..04 |
| Vận hành | NFR-MNT-03 | — | (migration) | — | TC-OPS-01..03 |

### 4.2. FR/NFR coverage

| FR/NFR | Test |
|---|---|
| FR-ORG-01..03; FR-CFG-01..02 | TC-ORG-01..04; TC-CFG-01..03 |
| FR-AUTH-01..07 | TC-AUTH-01..05 |
| FR-AUTH-03/05 (RBAC) | TC-RBAC-01..06 |
| FR-ASSET-*; AC-02 | TC-ASSET-01..05 |
| FR-INC-*; AC-03 | TC-INC-01..06 |
| FR-WO-*; AC-04/13 | TC-WO-01..08 |
| FR-MNT-*; AC-05 | TC-MNT-01..05 |
| FR-PART-*; AC-06 | TC-PART-01..07 |
| FR-COST-*; AC-08 | TC-COST-01..04 |
| FR-APR-01..09; AC-07/14 | TC-APR-01..07 |
| FR-NOT-*; AC-09 | TC-NOT-01..06 |
| FR-DOC-* | TC-DOC-01..05 |
| FR-REP-*; AC-11 | TC-REP-01..04 + **TC-REP-05 (MỚI, Figma v1.1 — Thiết bị nhiều sự cố / chi phí cao)** |
| FR-AI-*; AC-10 | TC-AI-01..06 |
| FR-AUD-*; AC-12 | TC-AUD-01..04 |
| NFR-SEC-01..06 | TC-SEC-01..08 |
| DR-* + DB-01..DB-13 | TC-DATA-01..05 + DT-01..DT-18 |
| NFR-PERF-* | TC-PERF-01..04 |
| NFR-USAB-*; UI-AC-* | TC-UX-01..08 |
| NFR-MNT-03; ops | TC-OPS-01..03 |

## 5. Q-items — quyết định đã chốt (baseline M0)

> Q-01..Q-07 đã được Doc04 §10 đề xuất; plan rev. 6 chốt theo hướng Doc04 khuyến nghị. Q-04 (SLA waiting_approval) defer cấu hình giá trị.

| ID | Nội dung | Baseline áp dụng |
|---|---|---|
| Q-01 | Hệ quả hủy WO | **WO REPAIR bị hủy**: (a) Nếu còn WO khác đang mở cho Incident → giữ nguyên trạng thái Incident. (b) Nếu không còn WO mở: lý do hủy ghi nhận `need_info_from_reporter` → Incident → `AWAITING_INFO`; các lý do khác → `NEW`. **WO MAINTENANCE bị hủy** (xem Q-02). Approval `PENDING/NEEDS_INFO` của WO bị hủy → `CANCELLED`. Lưu `work_orders.replaced_by_work_order_id` (NULL cho P1, sẵn sàng cho tương lai). Không xóa `stock_transactions` / `cost_entries`. |
| Q-02 | Recurrence + SCHEDULED/DUE/OVERDUE/SKIPPED | FIXED. Plan `is_active=false` (paused) → occurrence đến hạn/quá hạn → `SKIPPED`, reason `PLAN_PAUSED`. Plan `is_active=true` (active) → scheduler đánh `DUE` khi đến `due_on`; quá hạn (do scheduler lỗi hoặc không chạy, tức `now > due_on + MAINTENANCE_DUE_GRACE_HOURS`) → `OVERDUE`. Khi scheduler phục hồi, occurrence `OVERDUE` vẫn phải có đúng một WO đang mở hoặc được sinh WO mới (không chuyển SKIPPED, không bỏ qua). Resume plan → KHÔNG sinh bù các occurrence `SKIPPED`; occurrence `OVERDUE` không bị bỏ qua — scheduler phải đảm bảo occurrence đó có WO đang mở hoặc WO thay thế hợp lệ. Hủy WO MAINTENANCE: nếu `now < due_on` → occurrence `SCHEDULED`; nếu `due_on <= now < due_on + MAINTENANCE_DUE_GRACE_HOURS` → `DUE`; nếu `now >= due_on + MAINTENANCE_DUE_GRACE_HOURS` → `OVERDUE`; cho phép tạo WO thay thế (lưu `replaced_by_work_order_id`). Threshold `MAINTENANCE_DUE_GRACE_HOURS` lưu trong `system_settings.key='maintenance.due_grace_hours'`; mặc định 24 giờ. `UNIQUE(plan_id, due_on)` (Doc04 DB-04). Per-occurrence WO partial unique (`work_orders.occurrence_id` UNIQUE khi NOT NULL). |
| Q-03 | Mô hình kho + RETURN | Một vị trí, một `parts.on_hand` mỗi part (Doc04 §2 TK-07). `stock_transactions.operation_key UNIQUE` (Doc04 DB-07). `stock_transactions.original_stock_tx_id` cho RETURN (Doc04 §5.6). RETURN kiểm tra qty remaining trên ISSUE gốc. ISSUE/RETURN qua WO route; ADJUST route riêng. CREDIT theo `unit_price_snapshot` (Doc04 §5.6 cost_entries). Atomic (transaction với `parts.on_hand` update). |
| Q-04 | SLA | `work_order_notes.note_type ∈ {PROGRESS, PAUSE_START, PAUSE_END, WAITING_APPROVAL_START, WAITING_APPROVAL_END}`; row `work_orders.due_at` + `started_at` + `completed_at` + `cancelled_at` cho khoảng chính. `audit_logs.action` cho event chuyển trạng thái. `active_elapsed = total_elapsed − waiting_approval_seconds − authorized_pause_seconds`. `is_overdue = active_elapsed > sla_seconds`. `sla_seconds` đọc từ `system_settings.key='sla.{priority}'` (mặc định HIGH=4h, MEDIUM=24h, LOW=72h). **Thời gian chờ phê duyệt mặc định KHÔNG tính quá hạn** (Q-04 defer chi tiết; xem plan §8). |
| Q-05 | Department snapshot | `work_orders.department_id_snapshot` — copy tại lúc tạo WO (Doc04 §5.4). `assets.location_id_snapshot` cho báo cáo lịch sử khi thiết bị di chuyển. |
| Q-06 | Vượt phương án duyệt | Check `net_issued_quantity` (sum `stock_transactions.quantity` với `movement_type='ISSUE'` trừ RETURN cho cùng `approval_revision_id`) và `net_cost` (sum `cost_entries.unit_price * quantity` với `category='PART'`) so với `approval_revisions` đã `APPROVED`. Vượt → HTTP 422 với gợi ý `approval_revisions` mới. Chỉ tiếp tục sau khi APPROVED mới (Doc04 §5.6 + Q-06). |
| Q-07 | LOCATION scope cha-con | `access_scopes` với `scope_type='LOCATION'` — bao gồm vị trí được cấp và các vị trí con còn `is_active=true` (Doc04 Q-07 khuyến nghị). |
| Q-08 | Nhãn tiếng Việt cho `assets.activity_status` (Figma v1.1) | Ánh xạ từ enum Doc04 sang label UI tiếng Việt hiển thị trên Frontend (không thay đổi enum/DB): `OPERATIONAL` → "Đang hoạt động"; `MAINTENANCE` → "Đang bảo trì" (có WO MAINTENANCE đang mở); `REPAIR` → "Đang sửa chữa" (có WO REPAIR đang mở); `SUSPENDED` → "Tạm ngừng"; `RETIRED` → "Ngừng sử dụng". View `v_asset_state` (Doc04 §7.2) tính từ `assets.manual_state` + `work_orders` đang mở (filter `status IN ('NEW','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL')` và `type ∈ ('MAINTENANCE','REPAIR')`). Mapping lưu trong `packages/shared/labels.ts` để dùng chung cho cả web và api (response trả về `activity_status_label` tiếng Việt kèm enum). |

## 6. Trạng thái tham chiếu (Doc04 §3.2)

- **Incident**: `NEW | AWAITING_INFO | IN_PROGRESS | RESOLVED | CLOSED | CANCELLED` (Doc04, không REOPENED)
- **Work Order**: `NEW | ASSIGNED | IN_PROGRESS | WAITING_APPROVAL | COMPLETED | CANCELLED` (Doc04, không PAUSED/WAITING_PARTS — pause lưu qua `work_order_notes`)
- **Approval**: `DRAFT | PENDING | NEEDS_INFO | APPROVED | REJECTED | CANCELLED` (Doc04; rev. 5 ghi `AWAITING_INFO` đã sửa)
- **Asset `manual_state`**: `NORMAL | SUSPENDED | RETIRED` (Doc04; rev. 5 ghi `ACTIVE/PAUSED/RETIRED` đã sửa)
- **Asset `activity_status` (derived, view `v_asset_state`)**: `OPERATIONAL | MAINTENANCE | REPAIR | SUSPENDED | RETIRED`
- **Maintenance `plan.is_active`**: boolean (`true` = ACTIVE; `false` = PAUSED; không có ARCHIVED trong Doc04 — plan cũ dùng `is_active=false`)
- **Maintenance `occurrence` status** (do nghiệp vụ đặt, không có enum cứng): `SCHEDULED | DUE | OVERDUE | SKIPPED | COMPLETED | CANCELLED`
- **`approval_events.event_type`** (Doc04 §5.5): `SUBMIT | REQUEST_INFO | APPROVE | REJECT | CANCEL`
- **`stock_transactions.movement_type`** (Doc04 §5.6): `RECEIPT | ISSUE | ADJUST_IN | ADJUST_OUT`
- **`files.storage_state`** (Doc04 §5.7): `STAGED | READY | REJECTED`
- **`notifications.read_at`**: NULL = chưa đọc; non-NULL = đã đọc (Doc04 §5.8)
- **`ai_requests.status`**: `QUEUED | RUNNING | SUCCEEDED | FAILED | TIMED_OUT` (Doc04 §5.8)
- **`audit_logs.actor_type`**: `USER | SYSTEM` (Doc04 §5.8)
- **`user_roles.granted_by`**: chỉ NULL khi bootstrap Admin đầu tiên (Doc04 §5.3)

## 7. State machine

### 7.1. Incident (Doc04, không REOPENED)

```
NEW ──request_info──> AWAITING_INFO ──supplement──> IN_PROGRESS
 │                          │
 │                          ├──> RESOLVED ──close──> CLOSED
 │                          └──> CANCELLED (Manager)
 ├──> IN_PROGRESS ──work_order_create──> IN_PROGRESS (auto, Q-05 WO nguồn)
 │                  │
 │                  ├──> RESOLVED ──close──> CLOSED
 │                  └──> CANCELLED (Manager)
 └──> CANCELLED (Manager)
```

### 7.2. Work Order (Doc04)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need_approval──> WAITING_APPROVAL
 │                  │                  │                              │
 │                  │                  ├──> COMPLETED              ├──approve──> IN_PROGRESS
 │                  │                  ├──> CANCELLED (Manager)    ├──reject──> IN_PROGRESS
 │                  │                  │                          ├──cancel──> CANCELLED
 │                  │                  │                          └──request_info──> IN_PROGRESS
 │                  │                  │
 │                  └──> CANCELLED
 └──> CANCELLED
```

"Paused" nghiệp vụ (chờ linh kiện): giữ `IN_PROGRESS` + ghi `work_order_notes` row type `PAUSE_START` (lưu `pause_reason`); khi resume ghi row `PAUSE_END`. **Không** yêu cầu tạo approval request pending cho mỗi lần chờ linh kiện — chỉ tạo approval khi phát sinh đề xuất chi phí/linh kiện vượt ngưỡng cần duyệt.

### 7.3. Approval (Doc04)

```
DRAFT ──submit──> PENDING ──approve──> APPROVED
                   │            │
                   ├──> NEEDS_INFO ──submit_revision──> PENDING (revision mới)
                   ├──> REJECTED (Manager, actor_id ≠ proposer_id — FR-APR-09)
                   └──> CANCELLED (Technician, khi chưa có quyết định cuối)
```

## 8. SLA (Q-04)

**Schema dùng cho SLA**:

| Bảng | Cột/Field | Mục đích |
|---|---|---|
| `work_orders` | `started_at`, `completed_at`, `cancelled_at`, `due_at` | Khoảng chính |
| `work_order_notes` | `note_type ∈ {PROGRESS, PAUSE_START, PAUSE_END, WAITING_APPROVAL_START, WAITING_APPROVAL_END}` + `created_at` | Khoảng pause & waiting |
| `audit_logs` | `action` (incident/wo state change) + `created_at` | Event nguồn cho audit |

**Ràng buộc event** (enforce ở service):
- `PAUSE_END` chỉ hợp lệ sau `PAUSE_START`.
- `WAITING_APPROVAL_END` chỉ hợp lệ sau `WAITING_APPROVAL_START`.
- `COMPLETED` / `CANCELLED` chỉ một lần.

**Công thức (xử lý cả khoảng mở, Doc04 §7.2):**

```
end_at = COALESCE(completed_at, cancelled_at, now())

# Khoảng pause: [paused_at, COALESCE(resumed_at, end_at)]
# Khoảng waiting: [entered_at, COALESCE(exited_at, end_at)]

total_elapsed_seconds = end_at − sla_started_at  (= started_at nếu đã start, else created_at)

# Trừ thời lượng hợp của pause ∪ waiting (không trừ hai lần nếu overlap)
excluded_seconds = duration(union(pause_intervals, waiting_approval_intervals))
active_elapsed_seconds = total_elapsed_seconds − excluded_seconds

is_overdue = active_elapsed_seconds > sla_seconds
             AND status IN (ASSIGNED, IN_PROGRESS, WAITING_APPROVAL)
```

> Trường hợp WO đang pause hoặc đang chờ duyệt (chưa kết thúc): khoảng chưa đóng lấy `end_at = now()`; khi WO complete/cancel, recalc với `end_at` cố định. Trừ thời lượng hợp (union) để tránh trừ hai lần khi pause và waiting overlap.

WAITING_APPROVAL không tính vào SLA; hiển thị thành chỉ số riêng `waiting_approval_seconds`.

## 9. RBAC chain — gắn trên `userRoleId` (Doc05 §8.2, Doc04 DB-12)

```
Request → Authenticated
       → resolve active user_roles (granted, not revoked)
       → chọn 1 userRoleId thỏa đồng thời:
            (a) user_roles → roles → role_permissions → permissions: có permission.action = required
            (b) access_scopes(user_role_id): scope chứa target (GLOBAL/DEPARTMENT/LOCATION/ASSET/INCIDENT_READ)
       → 200 OK
       → Nếu 0 userRoleId thỏa → 403 (KHÔNG ghép quyền A với scope B)
```

`permissions` (plan tự đặt, mở rộng Doc04): bảng `permissions(code PK, description)`, `role_permissions(role_id FK, permission_id FK, PK composite)`. Seed cứng 4 vai trò ADMIN/MANAGER/TECHNICIAN/USER với matrix quyền version 1 (Doc04 §2 TK-06: ma trận quyền version cứng trong code).

**Permission codes bổ sung (theo Figma v1.1)**:
- `work_order.dispatch.read` — đọc Kanban Điều phối Phiếu công việc (SCR-WO-02). Chỉ role MANAGER có permission này; KTV chỉ thấy "Công việc của tôi".
- `incident.queue.read` — đọc Hộp thư Sự cố (SCR-INC-02a). MANAGER + ADMIN.
- `approval.queue.read` — đọc Hộp thư phê duyệt (SCR-APR-01a). MANAGER + ADMIN.
- `audit.read_all` — đọc Nhật ký hệ thống với filter nhạy cảm (SCR-AUD-01b). Chỉ ADMIN.
- `system_config.update` — chỉnh sửa Ngưỡng nghiệp vụ & cấu hình (SCR-CFG-03). ADMIN + MANAGER (với scope tương ứng); thay đổi ghi `audit_logs` (NFR-SEC-02).
- `document.read` — đọc tài liệu kỹ thuật (SCR-DOC-01..05). MANAGER + TECHNICIAN; `document_roles` cho phép giới hạn theo role/asset_type.

**UI-side rules** (ghi nhận cho Frontend):
- Nút "Tạo Phiếu công việc" trên Chi tiết Sự cố (SCR-INC-03): chỉ hiển thị khi user có permission `work_order.create` + `access_scopes` chứa asset của incident + `assets.manual_state != 'RETIRED'` + Incident chưa có WO REPAIR đang mở (Doc04 DB-03).
- Nút "Tạo WO cho kỳ" trên Lịch và kỳ bảo trì (SCR-MNT-03): chỉ MANAGER + `maintenance_occurrences.status IN ('SCHEDULED','DUE','OVERDUE')`.

## 10. Attachment STAGED → READY (Doc05 §10.2)

```
POST /files → lưu object + files(STAGED)
                        │
                        ▼
           Magic bytes check (file signature)
                        │ fail → 415 Unsupported Media Type
                        ▼ pass
           MIME allowlist + extension blocklist
                        │ fail → 400
                        ▼ pass
           size check (≤ 25 MB; system_settings.key='file.size_limit')
                        │ fail → 400
                        ▼ pass
           trả { fileId, expiresAt }
```

- **Magic bytes** (defense-in-depth): PNG → `89 50 4E 47`, PDF → `25 50 44 46`, JPEG → `FF D8 FF`, XLSX → `50 4B 03 04`.
- MIME allowlist + extension blocklist + size check → từ `system_settings`.
- Link vào nghiệp vụ: kiểm tra ownership/scope → transaction: INSERT `attachment_links` + UPDATE `files` → `READY`. Doc04 §5.7 + Doc05 §10.2.
- Download: check `READY` + quyền trên TẤT CẢ `attachment_links.parent`.
- Cron: dọn `STAGED` không còn dùng (Doc04 §9.2).
- `attachment_links` có `CHECK num_nonnulls(asset_id, incident_id, incident_message_id, work_order_id, approval_revision_id) = 1` (Doc04 §6.3 DB-09).

## 11. AI — 100% async (Doc05 §10.1)

```
POST /ai/incidents/{id}/analyze  body { description, assetType, symptoms, validCategories[] }
  → 202 { requestId } (Doc05 §7.6)
POST /ai/assets/{id}/summary    body { from?, to? }
  → 202 { requestId }

GET /ai/requests/{id} → { status: QUEUED|RUNNING|SUCCEEDED|FAILED|TIMED_OUT, outputPayload?, errorCode? }
```

- Worker gọi provider ngoài HTTP; không giữ transaction ngầm (Doc05 §10.1: "không giữ giao dịch CSDL trong lúc gọi AI").
- `ai_requests.input_snapshot` (JSONB): ngữ cảnh đã lọc — mô tả sự cố, loại thiết bị, triệu chứng, danh mục hợp lệ. Không gửi PII, mô tả dài không cần thiết (Doc04 §5.8 + Doc05 §10.1).
- Timeout: 30–60s (`system_settings.key='ai.timeout_ms'`, mặc định 45000).
- Retry: 2 lần exponential backoff (`system_settings.key='ai.max_retries'`, mặc định 2).
- Failure → `outputPayload` rỗng + `FAILED`; workflow tiếp tục thủ công (Doc02 FR-AI-04/05).
- API cũng hỗ trợ AI_PROVIDER=`mock` (mặc định cho demo) — không cần OpenAI key.
- Nếu `AI_PROVIDER=openai` thì khóa API từ env `AI_API_KEY`; không log/audit khóa (Doc05 §8.3).

## 12. Milestone plan (M0 + 14 tuần)

> M0 = đóng băng baseline (trước W1, 28/09/2026).
> W1–W12: triển khai. Feature freeze 20/12/2026.
> W13–W14: tích hợp, sửa lỗi, báo cáo, diễn tập.

### 12.1. Thứ tự dependency

M1 (Foundation) → M2 (Asset) → M3 (Attachment) → M4 (Incident + AI) → M5 (WO core + SLA) → M6 (Cost + Approval + WAITING_APPROVAL) → M7 (Inventory + Q-06 net_issued_quantity) → M8 (Maintenance) → M9 (Notification + Realtime + Dashboard + Report) → M10 (tích hợp + hardening + E2E).

Lý do đổi M6/M7 (so với Doc02 thứ tự gốc): M7 phụ thuộc M6 vì `stock_transactions.approval_revision_id` cần `approval_revisions` tồn tại để check Q-06.

### 12.2. Bảng milestone

| # | Tên | Tuần | Migration (Prisma) | Backend | API | UI | Test | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|---|---|
| **M0** | Đóng băng baseline | Trước W1 | (n/a) | — | — | — | — | Doc02..07 cập nhật Q; đánh dấu LOCKED v1.x; ký tên |
| **M1** | Foundation + Auth + IAM + Org | W1–W2 | `0001_init`: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `access_scopes`, `sessions`, `departments`, `locations`, `asset_types`, `system_settings`, `audit_logs` | common, infra (prisma/backend-core), auth, iam, organization, health | `/healthz`, `/auth/*`, `/admin/*`, `/departments`, `/locations`, `/system-settings` | login, user/role/scope mgmt, dept tree, settings, **SCR-IAM-04 (Role/Scope Assignment)**, **SCR-ORG-01b (Loại thiết bị & danh mục)**, **SCR-ORG-02b (Cơ cấu tổ chức & vị trí)**, **SCR-CFG-03 (Ngưỡng & cấu hình)** | TC-AUTH-01..05, TC-RBAC-01..06, TC-ORG-01..04, TC-CFG-01..03, TC-SEC-01..04 | Lint/typecheck/test pass; login 4 vai trò; Admin gán role+scope (Figma SCR-IAM-04: mỗi assignment giữ role + scope trên cùng `user_role_id`); audit ghi |
| **M2** | Asset + QR + lifecycle | W3 | `0002_asset`: `assets` (`manual_state` enum, `qr_key`), `asset_types` đã có FK locations/departments | asset | `/asset-types`, `/assets`, `/assets/{id}/lifecycle`, `/assets/{id}/qr` | asset list/detail, qr, **SCR-ASSET-05b (Hồ sơ thiết bị — tabs Tổng quan/Sự cố/Công việc/Tài liệu)** | TC-ASSET-01..05 | `manual_state` transitions; RETIRED chặn WO mới (Doc02 FR-ASSET-07); activity_status (derived view `v_asset_state`) đúng; **Q-08: nhãn tiếng Việt hiển thị trên UI (`packages/shared/labels.ts`)** |
| **M3** | Attachment STAGED→READY + technical documents | W4 | `0003_attachments`: `files` (STAGED/READY/REJECTED), `attachment_links` (CHECK một parent), `technical_documents`, `document_versions`, `document_roles` | attachment, audit | `POST /files`, `GET /files/{fileId}/download`, `/technical-documents` | attachment modal, **SCR-DOC-01..05 (Quản lý tài liệu kỹ thuật — metadata, phiên bản, quyền đọc)** | TC-DOC-01..05, TC-AUD-01..04 | Magic bytes + MIME + size check; STAGED→READY in tx; cron dọn STAGED; audit viewer |
| **M4** | Incident + AI async (worker) | W5–W6 | `0004_incidents_ai`: `incidents`, `incident_messages`, `audit_logs` (incident events), `ai_requests` | incident, ai (provider interface + mock + worker), backend-core domain | `/incidents`, `/incidents/{id}/transition`, `/incidents/{id}/messages`, `POST /ai/incidents/{id}/analyze`, `GET /ai/requests/{id}` | incident list/detail/reporter, AI suggest, **SCR-INC-02a (Hộp thư Sự cố — queue với filter tabs)** | TC-INC-01..06, TC-AI-01..06 | State machine đúng enum Doc04; AI 202 + requestId; GET `/ai/requests/{id}`; fallback |
| **M5** | Work Order (core + SLA, không WAITING_APPROVAL) | W7–W8 | `0005_work_orders`: `work_orders` (`department_id_snapshot`, `cancelled_by/at/reason`, `completed_at`, `started_at`, `due_at`, `downtime_start/end`, `checklist_snapshot`, `checklist_results`, FK ghép với incidents/maintenance_occurrences), `work_order_notes` (note_type) | work-order, backend-core domain (SLA, pause/resume) | `/work-orders`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition` (NEW/ASSIGNED/IN_PROGRESS/COMPLETED/CANCELLED — **enum status Doc04, không có PAUSED**), `POST /work-orders/{id}/notes` (note_type=PAUSE_START/PAUSE_END), `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | WO list/detail/assign/complete/cancel; pause modal, **SCR-WO-02 (Điều phối Phiếu công việc — Kanban board)**, **SCR-WO-05b (Cập nhật kết quả)**, **SCR-WO-06b (Ghi linh kiện — Issue parts)** | TC-WO-01..04 (core); TC-WO-05..08 (regression ở M6/M7 sau khi integrate) | SLA pause/waiting works; partial unique per incident (Doc04 DB-03); Complete WO chỉ chuyển Incident → RESOLVED khi không còn WO khác đang mở cho Incident đó; Cancel side effects Q-01; **M5 chưa có WAITING_APPROVAL/Approval** |
| **M6** | Cost + Approval + WAITING_APPROVAL hoàn thiện | W9 | `0006_cost_approval`: `cost_entries`, `approvals`, `approval_revisions`, `approval_revision_parts`, `approval_events` | cost, approval, backend-core domain (Q-06 cost) | `/work-orders/{id}/cost-entries`, `/approvals`, `/approvals/{id}/draft` (PATCH), `/approvals/{id}/submit`, `/approvals/{id}/request-info`, `/approvals/{id}/approve`, `/approvals/{id}/reject`, `/approvals/{id}/cancel`, `/approvals/{id}/history`, mở rộng `/work-orders/{id}/transition` (ENTER/EXIT WAITING_APPROVAL) | cost form, approval inbox, decision UI, **SCR-APR-01a (Hộp thư phê duyệt — queue với tabs + sort theo hạn)** | TC-WO-05..08 (full); TC-COST-01..04; TC-APR-01..07 | WAITING_APPROVAL ENTER/EXIT qua `work_order_notes.note_type`; self-approval FR-APR-09 (CHECK + trigger); Q-06 check `net_cost` (chưa check net_issued_quantity); revision chain; re-run TC-WO-05..08 |
| **M7** | Inventory + Q-06 net_issued_quantity hoàn thiện | W10 | `0007_inventory`: `parts` (on_hand, minimum_stock, reference_price, requires_approval, supplier_name, department_id, location_id), `part_asset_types`, `work_order_parts` (planned), `stock_transactions` (movement_type, operation_key UNIQUE, original_stock_tx_id, approval_revision_id) | inventory, backend-core domain (issue/return Q-06 full) | `/parts`, `/parts/{id}/adjust`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/work-orders/{id}/parts/planned`, `/stock-transactions` | parts list, issue modal, low-stock, **SCR-PART-04 (Sổ giao dịch tồn kho — ledger view)**, **SCR-PART-05 (Nhập kho & điều chỉnh — 2 tab)** | TC-PART-01..07; re-run TC-WO-05..08 + TC-APR-01..07 (integration) | Concurrency 50 req đồng thời → `parts.on_hand >= 0`; RETURN không vượt ISSUE gốc; Q-06 full (`net_issued_quantity` + `net_cost`); low-stock alert (ghi `notifications` event_key='low_stock:{part_id}'); **chạy lại full WO + Approval integration test** |
| **M8** | Maintenance Plan + Scheduler | W11 | `0008_maintenance`: `maintenance_plans` (is_active, schedule_basis FIXED/AFTER_COMPLETION — P1 dùng FIXED, cột để sẵn), `maintenance_occurrences` (plan_id, asset_id, due_on, plan_version snapshot) | maintenance, scheduler processor (worker) | `/maintenance-plans`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | plan list/calendar, **SCR-MNT-02 (Chi tiết kế hoạch bảo trì — checklist mẫu + history)**, **SCR-MNT-03 (Lịch và kỳ bảo trì — Calendar view)** | TC-MNT-01..05 | FIXED recurrence; `is_active=false` → SKIPPED (PLAN_PAUSED); `is_active=true` → OVERDUE; Resume **không sinh bù occurrence SKIPPED**; occurrence **OVERDUE vẫn phải được scheduler đảm bảo có đúng một WO mở hoặc WO thay thế hợp lệ** (xem Q-02); `UNIQUE(plan_id, due_on)` (Doc04 DB-04); `work_orders.occurrence_id` UNIQUE partial |
| **M9** | Notification + Realtime + Dashboard + Report | W12 | `0009_notif_dashboard`: `notifications` (Doc04 §5.8: `UNIQUE(recipient_id, event_key)`, `event_type`, `object_type`, `object_key`, `read_at`); view `v_kpi_*` runtime (không tạo bảng) | notification (controller + worker processor + Socket.IO gateway), dashboard, report | `/notifications`, `/notifications/{id}/read`, `WS /ws`, `/dashboard/kpis`, `/dashboard/overdue`, `/dashboard/technician-load`, `/dashboard/asset-critical`, `/reports/{type}.csv` | notif list + realtime toast, dashboard, report, **SCR-DASH-01b (Khối lượng kỹ thuật viên)**, **SCR-REP-05 (Thiết bị nhiều sự cố / chi phí cao)** | TC-NOT-01..06, TC-REP-01..04, **TC-REP-05 (MỚI)**, TC-DATA-01..05 | 6 nhóm FR-NOT đúng; WS JWT; KPI đúng scope; CSV có permission; overdue = active_elapsed > sla; 5 ca data integrity (DT-09, DT-10, DT-12, DT-17, DT-18); DT còn lại map vào TC-WO/APR/PART; **Sắp quá hạn tab trong Hộp thư phê duyệt dùng `system_settings.key='approval.near_expiry_hours'` (mặc định 4)** |
| **M10** | Tích hợp + hardening + E2E + docs | W13–W14 | (n/a) | cross-cutting | — | UX polish | TC-UX-01..08, TC-OPS-01..03, TC-PERF-01..04 | Toàn bộ test pass; prod build; demo flow; README; 0 TODO/mock ngoài stub; feature freeze; diễn tập |

## 13. Docker Compose — tách infra và demo

### docker-compose.infra.yml (hạ tầng, dùng với pnpm dev)

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: equipcare
      POSTGRES_PASSWORD: equipcare_pwd
      POSTGRES_DB: equipcare
    ports: ["5432:5432"]
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U equipcare -d equipcare"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2024-09-13T03-26-17Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/ready"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  pg_data:
  minio_data:
```

### docker-compose.demo.yml (full stack, dùng với pnpm demo:up)

> Worker **không** phụ thuộc service `ai` (OpenAI là provider ngoài, mock provider chạy trong worker). Các service infra khai báo đầy đủ (không dùng `extends:` vì cú pháp đầy đủ phức tạp — copy service block để file tự đứng được). Build images apps từ `apps/*/Dockerfile`.

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: equipcare
      POSTGRES_PASSWORD: equipcare_pwd
      POSTGRES_DB: equipcare
    ports: ["5432:5432"]
    volumes:
      - pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U equipcare -d equipcare"]
      interval: 5s
      timeout: 3s
      retries: 10

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

  minio:
    image: minio/minio:RELEASE.2024-09-13T03-26-17Z
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports: ["9000:9000", "9001:9001"]
    volumes:
      - minio_data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/ready"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    environment:
      DATABASE_URL: postgresql://equipcare:equipcare_pwd@postgres:5432/equipcare
      REDIS_URL: redis://redis:6379
      S3_ENDPOINT: http://minio:9000
      S3_ACCESS_KEY: minioadmin
      S3_SECRET_KEY: minioadmin
      S3_BUCKET: equipcare-files
      AI_PROVIDER: mock
      NODE_ENV: production
    ports: ["3001:3001"]
    env_file: ../.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      seed:
        condition: service_completed_successfully
      minio-init:
        condition: service_completed_successfully

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3001
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    env_file: ../.env
    ports: ["3000:3000"]
    depends_on:
      - api

  worker:
    build:
      context: ..
      dockerfile: apps/worker/Dockerfile
    environment:
      DATABASE_URL: postgresql://equipcare:equipcare_pwd@postgres:5432/equipcare
      REDIS_URL: redis://redis:6379
      AI_PROVIDER: mock
      AI_REQUEST_TIMEOUT_MS: "45000"
      NODE_ENV: production
    env_file: ../.env
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
      seed:
        condition: service_completed_successfully
      minio-init:
        condition: service_completed_successfully
    restart: unless-stopped

  migrate:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    entrypoint: ["pnpm", "db:migrate:deploy"]
    environment:
      DATABASE_URL: postgresql://equipcare:equipcare_pwd@postgres:5432/equipcare
    env_file: ../.env
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"

  seed:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    entrypoint: ["pnpm", "db:seed"]
    environment:
      DATABASE_URL: postgresql://equipcare:equipcare_pwd@postgres:5432/equipcare
    env_file: ../.env
    depends_on:
      migrate:
        condition: service_completed_successfully
    restart: "no"

  minio-init:
    image: minio/mc:RELEASE.2024-09-16T17-43-14Z
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
        until /usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin; do sleep 1; done &&
        /usr/bin/mc mb --ignore-existing -p local/equipcare-files &&
        echo 'MinIO bucket equipcare-files ready (private)'
      "
    restart: "no"

volumes:
  pg_data:
  minio_data:
```

> **Chuỗi khởi động**: `postgres/redis/minio healthy` → `migrate` → `seed` (phụ thuộc `migrate`) + `minio-init` (phụ thuộc `minio`) → `api` + `worker` (chờ cả `seed` và `minio-init` xong mới start). Bucket `equipcare-files` ở **chế độ private** (không `anonymous download`); quyền tải kiểm tra qua API tại thời điểm request.

> Secret nạp từ `.env` ở host hoặc từ secrets manager; docker compose đọc biến môi trường qua `env_file: ../.env` ở mỗi service. Không commit `.env` thật vào repo.

> OpenAI (nếu `AI_PROVIDER=openai`) là provider bên ngoài qua HTTPS, không cần service trong Compose.

### Scripts

| Lệnh | Hành động |
|---|---|
| `pnpm infra:up` | `docker compose -f infra/docker-compose.infra.yml up -d` |
| `pnpm infra:down` | `docker compose -f infra/docker-compose.infra.yml down` |
| `pnpm demo:up` | `docker compose -f infra/docker-compose.demo.yml up -d` |
| `pnpm demo:down` | `docker compose -f infra/docker-compose.demo.yml down` |
| `pnpm dev` | Chạy apps trên hạ tầng đã có (`pnpm infra:up` trước) |

> Không bao giờ chạy `pnpm dev` khi đã có `pnpm demo:up` — tránh trùng cổng và worker.

## 14. Quy trình tự kiểm tra sau mỗi milestone

1. Đối chiếu code với acceptance criteria trong §12.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` ở cả apps + worker.
3. `pnpm db:migrate:deploy` từ DB sạch + `pnpm db:seed` → idempotent.
4. `pnpm infra:up` rồi `pnpm dev` rồi chạy demo flow.
5. Kiểm RBAC chain (4 vai trò).
6. Kiểm UI state loading/empty/error/denied.
7. Quét `TODO|FIXME|XXX|@ts-ignore|console.log` trong scope.
8. Quét secret — không có giá trị thật.
9. So sánh coverage test vs §4 — ghi nhận thiếu.
10. Commit + push + cập nhật plan (đánh dấu milestone done).

## 15. Demo flow

Baseline đi theo hướng **duyệt trước khi issue** (Q-06). `system_settings` (cấu hình bởi Admin/Manager qua `/system-settings`) quyết định giao dịch nào bắt buộc phải phê duyệt (key: `approval.threshold_cost`, `approval.requires_approval_part`). Nếu giao dịch thuộc diện phải duyệt thì chỉ được ISSUE sau khi có `approval.status='APPROVED'`. `approval_revision_parts` lưu giới hạn số lượng, đơn giá và thành tiền đã duyệt cho đề xuất cụ thể. Nếu `net_issued_quantity` hoặc `net_cost` vượt giới hạn này → hệ thống từ chối ISSUE và yêu cầu tạo `approval_revisions` mới (Q-06).

```
Reporter (user.sx01)          → Tạo Incident
Manager (manager.sx)          → Tiếp nhận; tạo WO REPAIR; phân công KTV
Technician (ktv.sx01)        → IN_PROGRESS; lập đề xuất linh kiện/chi phí → approval PENDING
Manager (manager.sx)         → Approve approval → WO về IN_PROGRESS
Technician (ktv.sx01)        → ISSUE parts theo approval; RESOLVE; complete WO → Incident RESOLVED
Manager (manager.sx)          → Close Incident → CLOSED
Reporter / Manager            → Dashboard; xuất CSV; báo cáo
```

> Nếu giao dịch thuộc diện bắt buộc phê duyệt nhưng chưa có approval APPROVED, hoặc `net_issued_quantity` / `net_cost` vượt giới hạn đã duyệt, API trả HTTP 422. Không có thay đổi nào được ghi vào `stock_transactions`, `parts.on_hand`, `cost_entries`; nếu transaction đã mở thì phải rollback toàn bộ.

## 16. Rủi ro còn lại

| # | Mục | Giảm thiểu |
|---|---|---|
| R-01 | OpenAI timeout | Mock mặc định; OpenAI optional + smoke test; timeout 30–60s |
| R-02 | Realtime qua proxy | Fallback polling 10s |
| R-03 | Worker dùng chung logic | `packages/backend-core` là shared layer; worker + api cùng import |
| R-04 | Deadline 14 tuần | Phasing §12; defer circuit breaker/materialized view/SMTP nếu thiếu ~1 tuần |
| R-05 | PowerShell vs bash | Cung cấp cả `.sh` và `.ps1`; PS dùng `Copy-Item`, `Remove-Item` |
| R-06 | UUID seed idempotent | **Dùng UUID cố định cho Admin đầu tiên** trong `prisma/seed/constants.ts` (vd `const BOOTSTRAP_ADMIN_ID = '00000000-0000-4000-8000-000000000001'`). Seed chạy lại phải idempotent: `upsert` theo `login_name`, không `create`. `user_roles.granted_by=NULL` chỉ cho bootstrap (Doc04 §5.3). |
| R-07 | Magic bytes không match MIME | Nếu file magic bytes không khớp MIME claim → REJECTED state, trả 415. Defense-in-depth bổ sung Doc02 NFR-SEC-05 |
| R-08 | Q-04 SLA waiting_approval | Mặc định waiting không tính quá hạn; config qua `system_settings.key='sla.waiting_approval_counts_as_overdue'` (boolean). Defer chi tiết business rules |
| R-09 | UI screens Figma v1.1 chưa có trong Doc06 baseline | Bổ sung 14 SCR mới vào §4.1 + TC-REP-05 (§4.2). Frontend dev cần ước lượng effort thêm ~1 tuần cho: SCR-WO-02 (Kanban), SCR-PART-04/05 (ledger + nhập kho), SCR-DOC-01..05 (tài liệu kỹ thuật). Nếu thiếu thời gian, defer Kanban + Document UI vào P2 (vẫn có API backend). |
| R-10 | Nhãn tiếng Việt cho `activity_status` (Q-08) | Lưu mapping trong `packages/shared/labels.ts` để cả web + api dùng chung. Tránh hard-code label trong component. Backend trả `activity_status_label` kèm enum để FE render. Mapping tiếng Việt không thay đổi enum Doc04; chỉ là UI label. |

## 17. Tài liệu tham chiếu (Doc01..07 LOCKED)

- [Doc01] Khảo sát nghiệp vụ và phân tích bài toán, v1.4, 08/09/2026
- [Doc02] Đặc tả yêu cầu phần mềm (SRS), v1.4, 08/09/2026
- [Doc03] Phân tích ca sử dụng và phân quyền theo vai trò, v1.4, 08/09/2026
- [Doc04] Thiết kế cơ sở dữ liệu và ERD, v1.2, 08/09/2026
- [Doc05] Thiết kế kiến trúc hệ thống và đặc tả API, v1.2, 08/09/2026
- [Doc06] Đặc tả UX/UI, Sitemap, User Flow và danh mục màn hình, v1.1, 08/09/2026
- [Doc07] Kế hoạch kiểm thử và nghiệm thu, v1.1, 08/09/2026

Baseline được đóng băng với chốt Q-01..Q-07 theo khuyến nghị Doc04. Mọi thay đổi sau ngày LOCK phải qua change request.
