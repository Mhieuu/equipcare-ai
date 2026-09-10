# EquipCare AI — Implementation Plan (rev. 2)

> AI-Powered Equipment Maintenance Management System — phạm vi P1 theo bộ tài liệu đính kèm (Spec + Document01..07).
> Repository mẫu: monorepo (`apps/api` NestJS + Prisma + Postgres, `apps/web` Next.js + TS + Tailwind + shadcn/ui, `packages/shared` types/enums/RBAC/OpenAPI client), infra Postgres + Redis + MinIO qua Docker Compose.

Bản sửa đổi này đối chiếu lại toàn bộ các quyết định nghiệp vụ với Tài liệu 02 (SRS), 03 (UC/RBAC), 04 (ERD), 05 (Kiến trúc/API), 06 (UX), 07 (Kế hoạch kiểm thử) sau vòng review.

## Tóm tắt thay đổi so với bản 1

| Vấn đề (bản 1) | Sửa ở bản 2 | Bằng chứng |
|---|---|---|
| Multi-tenant không thuộc phạm vi | Loại bỏ `organization_id` khỏi mọi bảng nghiệp vụ. Một đơn vị duy nhất; thông tin đơn vị lưu trong bảng `org_unit` (một bản ghi). Không CRUD nhiều tổ chức, không seed 2 org, không xây cross-org scope. | Doc07 §1.3: "SSO/Active Directory, multi-tenant SaaS và phê duyệt nhiều tầng" ngoài phạm vi |
| Có forgot/reset password | Chỉ "đổi mật khẩu" (`POST /auth/change-password`) và "Admin reset" (`POST /admin/users/{id}/reset-password`). Bỏ `/auth/forgot`, `/auth/reset`, bảng `password_reset_tokens`. | Doc02 FR-AUTH-04, FR-AUTH-05 |
| Q-01 hủy WO đơn giản | Bổ sung điều kiện "không còn WO đang mở khác"; Incident có thể về `NEW` hoặc `WAITING_FOR_INFO` tùy lý do hủy; approval WAITING → CANCELLED; giữ nguyên lịch sử kho/chi phí/audit. | Doc02 FR-INC-09, FR-WO-09; Doc04 mục 10 Q-01 |
| Chưa giải quyết WO thay thế | Ràng buộc unique chỉ chặn WO đang hoạt động: `UNIQUE(source_incident_id) WHERE status IN ('DRAFT','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL','WAITING_PARTS','PAUSED')`; WO `CANCELLED` không chặn tạo WO mới; bổ sung quan hệ `replaced_by_work_order_id` (optional) để truy vết. | Doc02 FR-WO-01 "mỗi sự cố có tối đa một phiếu sửa chữa đang hoạt động" |
| State machine sai | AI_suggested là dữ liệu phụ, không phải trạng thái Incident. Incident không tự vào WAITING_PARTS. "Vượt approved" là policy, không phải transition. Enum khớp SRS/DB. | Doc02 + Doc04 §10 |
| Asset thiếu Tạm ngừng/Ngừng sử dụng + ưu tiên | Bổ sung enum `ACTIVE/UNDER_MAINTENANCE/UNDER_REPAIR/PAUSED/RETIRED`. Manual status (`PAUSED`, `RETIRED`) ưu tiên trạng thái suy ra từ WO. Chặn tạo WO mới cho `RETIRED`. | Doc02 FR-ASSET-04..05, mục trạng thái |
| RETURN thiếu ràng buộc Q-03 | RETURN cùng WO, WO còn mở, tham chiếu ISSUE gốc, tổng RETURN không vượt ISSUE gốc; tạo CREDIT theo unit_price snapshot; tất cả trong cùng transaction; cập nhật part_balances. | Doc04 stock_transactions §4; Q-03 |
| Q-06 mới chặn qty, thiếu cost | Kiểm tra cả `net_issued_quantity` (sum ISSUE − sum RETURN) và `net_cost` (sum DEBIT − sum CREDIT). Vượt → từ chối issue/cost-entry, gợi ý tạo approval_revision mới; chỉ tiếp tục sau khi duyệt. | Doc04 cost_entries §5; Q-06 |
| Q-04 mới ghi quyết định | SLA pause/resume tường minh: pause khi vào `WAITING_APPROVAL`/`WAITING_PARTS`/`PAUSED`; resume khi thoát; `WAITING_APPROVAL` hiển thị thành chỉ số riêng; `is_overdue` là dẫn xuất, không lưu cột. Công thức: `elapsed = active_time − waiting_approval_time`. | Doc04 §9.4; Doc02 FR-WO-05 |
| AI thiếu hợp đồng bất đồng bộ | `POST /ai/...` trả `202 Accepted` + `requestId`. `GET /ai/requests/{id}` trả trạng thái `QUEUED/RUNNING/SUCCEEDED/FAILED`. Worker BullMQ gọi provider ngoài HTTP request, không giữ DB transaction. | Doc05 §6 |
| Attachment chỉ presigned | Chu trình STAGED → READY: `POST /files` tạo bản ghi STAGED + trả fileId; DTO nghiệp vụ mang `attachmentFileIds`; Backend kiểm tra quyền + chuyển READY + tạo `attachment_links` trong transaction. Cron dọn STAGED hết hạn; không thực thi file trên app server; kiểm MIME/dung lượng. | Doc05 §8, §13 |
| RBAC chưa rõ userRoleId | Permission + scope xác minh trên cùng `userRoleId` đang hiệu lực. Backend không được ghép quyền của role A với scope của role B. | Doc05 §9, §10.4 |
| Ma trận truy vết dùng mã tự đặt | Đối chiếu lại trực tiếp với Doc02/Doc07; bỏ `FR-REPORT-REAL-TIME`; bổ sung FR-PART/NOT/AUD/CFG/DOC theo đúng SRS | Doc02 + Doc07 |
| M1 yêu cầu 33 bảng | M1 chỉ monorepo + Docker + Prisma + Auth/IAM + schema nền; mỗi milestone sau thêm migration đúng module | Nguyên tắc vertical slice |
| Phiên bản stack cũ | Khóa phiên bản tương thích (bảng bên dưới); pnpm-lock.yaml sẽ là nguồn sự thật | Doc05 chỉ nói "NestJS + Prisma + Postgres", không ép phiên bản |

## 1. Phạm vi MVP (P1) — tổng quan

Một **đơn vị** (single-tenant), 4 vai trò (Admin, Manager, Technician, Reporter), 5 module nghiệp vụ (Asset, Incident, Work Order, Maintenance Plan, Spare Parts) + Cost & Approval + Notification + Dashboard + AI hỗ trợ.

**Trong phạm vi P1:**
- Login/logout, đổi MK, Admin reset MK, lockout, audit.
- CRUD tài khoản, vai trò, quyền, scope; gán vai trò theo scope; deactivate.
- Location cây cha-con (scope cha bao gồm con — đã chốt Q-07).
- Department cây cha-con; WO giữ `department_id_snapshot` (Q-05).
- Asset CRUD + 5 trạng thái (ACTIVE / UNDER_MAINTENANCE / UNDER_REPAIR / PAUSED / RETIRED) + tài liệu kỹ thuật + attachment.
- Incident lifecycle + AI suggest category/priority + chuyển trạng thái.
- Work Order lifecycle + assign + issue/return/adjust parts + cost + approval + complete/cancel.
- Maintenance Plan + recurrence + idempotent scheduler.
- Spare parts CRUD + ledger + issue/return/adjust với concurrency safety.
- Cost & Approval (DRAFT/PENDING/INFO_REQUESTED/APPROVED/REJECTED/CANCELLED).
- Notification list + realtime WS + retry-safe job.
- Dashboard KPI + CSV report.
- AI provider abstraction (mock + OpenAI tùy chọn).
- Audit log viewer.

**Ngoài phạm vi P1 (deferred):**
- Multi-tenant, SSO/AD, phê duyệt nhiều tầng, nhiều kho, serial/lot kho, định giá kế toán, AI tự hành động, mobile app native, email thật (chỉ log), cloud storage production (chỉ MinIO), circuit breaker nâng cao, materialized view.

## 2. Stack & phiên bản đã khóa (sẽ pin trong `pnpm-lock.yaml`)

| Thành phần | Phiên bản | Lý do |
|---|---|---|
| Node.js | 20 LTS (≥ 20.10) | Tương thích NestJS 10/11, Next 14/15 |
| pnpm | 9.x | Workspaces, lockfile chặt |
| NestJS | 10.x (stable LTS) | Tương thích Prisma, BullMQ, Passport, Swagger |
| Prisma | 5.x | Migration version đáng tin cậy, generated types |
| PostgreSQL | 16 | JSONB, generated columns, partial unique index |
| Redis | 7 | BullMQ |
| Next.js | 14.x (App Router) | Stable, RSC, route handlers |
| React | 18.x | Tương thích Next 14 |
| TypeScript | 5.4+ strict | Bắt buộc |
| Test backend | Jest 29 + Supertest + Testcontainers | Unit + integration + e2e DB thật |
| Test frontend | Vitest 1.x + Testing Library + Playwright | Unit + E2E critical path |
| MinIO | RELEASE.2024-09 (S3 compat) | Local dev |

> Nest 11 / Prisma 6 / Next 15 sẽ được đánh giá sau M3; bump nếu không phá tương thích.

## 3. Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                         NestJS backend
│  │  ├─ src/
│  │  │  ├─ modules/
│  │  │  │  ├─ auth/              controller + service + domain (policy) + guards
│  │  │  │  ├─ iam/               user/role/permission/scope
│  │  │  │  ├─ org-unit/          department + location tree (single tenant)
│  │  │  │  ├─ asset/             asset + status + qr + documents
│  │  │  │  ├─ incident/          state machine + AI suggest (sync)
│  │  │  │  ├─ work-order/        state machine + assign + complete + cancel
│  │  │  │  ├─ maintenance/       plan + recurrence + scheduler
│  │  │  │  ├─ inventory/         spare part + ledger + issue/return/adjust
│  │  │  │  ├─ cost/              cost entries
│  │  │  │  ├─ approval/          approval request + decision
│  │  │  │  ├─ notification/      list + WS + job
│  │  │  │  ├─ dashboard/         KPI + overdue
│  │  │  │  ├─ ai/                provider + queue + suggestion
│  │  │  │  ├─ attachment/        STAGED→READY flow
│  │  │  │  ├─ audit/             viewer
│  │  │  │  ├─ report/            CSV export
│  │  │  │  └─ health/            healthz + readyz
│  │  │  ├─ common/                AppError, filters, pipes, decorators, guards
│  │  │  ├─ infra/
│  │  │  │  ├─ prisma/            PrismaService
│  │  │  │  ├─ redis/             BullMQ + cache
│  │  │  │  ├─ storage/           MinIO + presigned
│  │  │  │  ├─ mail/              log-only stub
│  │  │  │  └─ realtime/          Socket.IO gateway
│  │  │  └─ main.ts
│  │  ├─ prisma/
│  │  │  ├─ schema.prisma
│  │  │  ├─ migrations/           version
│  │  │  ├─ seed.ts               deterministic seed (idempotent)
│  │  │  └─ seed-helpers/
│  │  ├─ test/                    e2e
│  │  └─ package.json
│  └─ web/                         Next.js frontend
│     ├─ src/
│     │  ├─ app/                  App Router pages (SCR-*)
│     │  ├─ features/             feature-based (incident, work-order, ...)
│     │  │  ├─ api/               generated OpenAPI client + RHF hooks
│     │  │  └─ ui/                components + states (loading/empty/error/denied)
│     │  ├─ lib/                  auth, rbac-check, ws-client
│     │  └─ styles/
│     └─ package.json
├─ packages/
│  └─ shared/                      types, enums, RBAC policy constants, Zod schemas
├─ infra/
│  ├─ docker-compose.yml           postgres, redis, minio (dev)
│  └─ minio/                       init bucket script
├─ scripts/
│  ├─ reset-db.sh
│  └─ demo-flow.sh                 E2E demo: login → incident → WO → parts → complete
├─ .env.example
├─ .nvmrc
├─ .editorconfig
├─ .eslintrc.cjs (root extends + TS)
├─ .prettierrc
├─ tsconfig.base.json
├─ pnpm-workspace.yaml
├─ package.json (root, scripts)
├─ README.md
└─ IMPLEMENTATION_PLAN.md (file này)
```

## 4. Bảng truy vết yêu cầu (đã đối chiếu Doc02/Doc07)

Mã yêu cầu lấy đúng từ Doc02; mã test lấy đúng từ Doc07.

### 4.1. Bảng tổng hợp

| Module | FR/NFR (Doc02) | API (Doc05) | DB (Doc04) | UI (Doc06) | Test (Doc07) |
|---|---|---|---|---|---|
| Auth | FR-AUTH-01..07 | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users/{id}/reset-password` | users, sessions, login_attempts | SCR-AUTH-01..05 | TC-AUTH-01..11 |
| IAM | FR-AUTH-04/05; FR-INC-* (scope); FR-WO-* | `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes` | users, roles, permissions, user_roles, user_role_scopes | SCR-IAM-01..06 | TC-RBAC-01..20 |
| Org-unit | FR-INC-*, FR-WO-* (department snapshot), FR-ASSET-* (location) | `/departments`, `/locations` | departments, locations | SCR-LOC-01..02 | TC-LOC-01..05 |
| Asset | FR-ASSET-01..09 | `/assets`, `/assets/{id}`, `/assets/{id}/status`, `/assets/{id}/qr`, `/assets/{id}/documents`, `/technical-documents` | assets, asset_status_history, technical_documents, document_versions, document_roles | SCR-ASSET-01..05 | TC-ASSET-01..10 |
| Incident | FR-INC-01..09 | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/ai/suggest/category`, `/incidents/{id}/ai/suggest/priority` | incidents, incident_attachments (FK attachment_links), incident_history | SCR-INC-01..06 | TC-INC-01..12 |
| Work Order | FR-WO-01..09 | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/work-orders/{id}/parts/adjust`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | work_orders, work_order_tasks, work_order_history, replaced_by_work_order_id | SCR-WO-01..07 | TC-WO-01..15 |
| Maintenance | FR-MNT-01..09 | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `/maintenance-plans/{id}/pause`, `/maintenance-plans/{id}/resume` | maintenance_plans, plan_occurrences, plan_generation_log | SCR-MNT-01..04 | TC-MNT-01..05 |
| Inventory | FR-PART-01..08 | `/spare-parts`, `/spare-parts/{id}`, `/spare-parts/{id}/issue`, `/spare-parts/{id}/return`, `/spare-parts/{id}/adjust`, `/stock-transactions` | spare_parts, part_balances, stock_transactions | SCR-PART-01..03 | TC-PART-01..07 |
| Cost | FR-COST-01..04 | `/work-orders/{id}/cost-entries`, `/cost-entries/{id}` | cost_entries | SCR-COST-01..03 | TC-COST-01..06 |
| Approval | FR-APR-01..06 | `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel` | approval_requests, approval_items, approval_history | SCR-APR-01..04 | TC-APR-01..10 |
| Notification | FR-NOT-01..06 | `/notifications`, `/notifications/{id}/read`, `WS /ws` | notifications, notification_jobs | SCR-NOT-01..03 | TC-NOT-01..06 |
| Dashboard | (FR-DASH không có trong Doc02) | `/dashboard/kpis`, `/dashboard/overdue` | view/materialized optional | SCR-DASH-01..02 | TC-DASH-01..04 |
| AI | FR-AI-01..06; NFR-AI-01..05 | `POST /ai/suggest/*` (202 + requestId), `GET /ai/requests/{id}` | ai_requests, ai_suggestions, ai_jobs | SCR-AI-01..02 | TC-AI-01..08 |
| Attachment | FR-DOC-* | `POST /files`, `POST /files/{fileId}/link` (qua DTO), `GET /files/{fileId}/download` | files (STAGED/READY), attachment_links | n/a (modal) | TC-DOC-01..05 |
| Audit | (FR-AUDIT-* không có trong Doc02) | `/audit-logs`, `/audit-logs/{id}` | audit_logs | SCR-AUD-01 | TC-AUD-01..04 |
| Report | FR-COST-*; FR-REP-03 | `/reports/work-orders.csv`, `/reports/incidents.csv`, `/reports/assets.csv` | (read-only) | SCR-RPT-01 | TC-RPT-01..02 |
| Realtime | (Doc05 §6.4) | `WS /ws` | events log | embedded | TC-RT-01..03 |

### 4.2. Coverage theo NFR

| NFR | Test |
|---|---|
| NFR-SEC-01..06 | TC-SEC-01..08 |
| NFR-PERF-01..06 | TC-PERF-01..04 |
| NFR-USAB-01..04 | TC-UX-01..08 |
| NFR-MNT-01..03 | TC-OPS-01..03 |
| NFR-AI-01..05 | TC-AI-FAIL-01..04 + TC-AI-01..08 |

> Lưu ý: Doc02 dùng `FR-NOT-*` chứ không phải `FR-NOTIF-*`; dùng `FR-PART-*` chứ không phải `FR-INV-*`. FR-REPORT-REAL-TIME là mã tự đặt, không tồn tại trong SRS — đã loại.

### 4.3. Q-items trong Doc04 — quyết định đã chốt

| ID | Nội dung (Doc04 §10) | Quyết định áp dụng |
|---|---|---|
| Q-01 | Hệ quả hủy WO với Incident/Occurrence/Approval | Hủy WO chỉ khi WO đang hoạt động và người hủy có quyền trong phạm vi. **Nếu Incident không còn WO đang mở khác**: Incident về `NEW` (lý do khác) hoặc `WAITING_FOR_INFO` (lý do "thiếu thông tin"). **Occurrence** (PM): về `SCHEDULED` để scheduler có thể sinh lại WO mới. **Approval WAITING**: → `CANCELLED`; lịch sử kho, chi phí, audit được giữ nguyên. |
| Q-02 | Recurrence FIXED/AFTER_COMPLETION | **FIXED**. Kỳ lỡ (không có WO đang hoạt động và quá `due_on`) → đánh `SKIPPED`; KHÔNG sinh WO bù. |
| Q-03 | Mô hình kho + RETURN | **Một vị trí lưu duy nhất**, một `on_hand` mỗi part. RETURN cùng WO, WO còn mở (status ≠ COMPLETED/CANCELLED), tham chiếu ISSUE gốc, tổng RETURN không vượt ISSUE gốc; CREDIT theo unit_price snapshot. Tất cả trong cùng transaction. |
| Q-04 | SLA khi WAITING_APPROVAL | **Pause đồng hồ SLA** khi WO vào `WAITING_APPROVAL`/`WAITING_PARTS`/`PAUSED`. `WAITING_APPROVAL` hiển thị thành chỉ số riêng (`waiting_approval_time`). `is_overdue` là dẫn xuất = `now > scheduled_at && active_time > sla_minutes*60`. Tập trường tối thiểu trước COMPLETED/CANCELLED theo BR-12/BR-13. |
| Q-05 | Department snapshot WO | `work_orders.department_id_snapshot` (FK departments) — copy tại lúc tạo WO, không đổi khi asset chuyển phòng ban sau. Lý do: phòng ban quản lý WO phụ thuộc bối cảnh xử lý. |
| Q-06 | Vượt phương án duyệt | Kiểm tra cả `net_issued_quantity` và `net_cost` so với phiên đề xuất APPROVED. Vượt bất kỳ chiều nào → từ chối issue/cost-entry; backend gợi ý tạo `approval_revision` (approval mới tham chiếu approval cũ); chỉ tiếp tục sau khi APPROVED. |
| Q-07 | LOCATION scope cha-con | Scope trên `user_role_scopes` (location_id, dept_id, asset_id) — khi check, **cha bao gồm con**: nếu user_role_scope có location_id=X, tất cả location có ancestor chứa X đều nằm trong scope. |

## 5. State machines (đã khớp SRS + DB)

### 5.1. Incident (Doc02 + Doc04)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──resolve──> RESOLVED ──close──> CLOSED
 │                  │                  │                            │
 │                  │                  ├──> WAITING_FOR_INFO ────────┤
 │                  │                  ├──> CANCELLED  (Manager)    │
 │                  │                  └──(back to IN_PROGRESS)     │
 └──(cancel)──> CANCELLED  (Manager)                              │
                                                                  │
                                                                REOPENED ──> IN_PROGRESS
```

Trạng thái Incident enum: `NEW | ASSIGNED | IN_PROGRESS | WAITING_FOR_INFO | RESOLVED | CLOSED | CANCELLED | REOPENED`.

**Không** có `AI_SUGGESTED`. AI suggestion là bản ghi `ai_suggestions` gắn với incident, không phải trạng thái.

### 5.2. Work Order (Doc02 + Doc04)

```
DRAFT ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need parts──> WAITING_PARTS ──> IN_PROGRESS
                      │                  │                          │
                      │                  ├──> WAITING_APPROVAL ──approve/reject──> IN_PROGRESS
                      │                  ├──> PAUSED ──> IN_PROGRESS
                      │                  └──> COMPLETED (BR-12: kết quả tối thiểu + không còn approval pending)
                      └──(cancel, Manager)──> CANCELLED (BR-13: lý do, người hủy, thời điểm)
```

Enum WO: `DRAFT | ASSIGNED | IN_PROGRESS | WAITING_PARTS | WAITING_APPROVAL | PAUSED | COMPLETED | CANCELLED`.

**Policy** (không phải transition):
- Complete: bắt buộc có result, performer, end_at, các checklist bắt buộc, không còn approval `WAITING`/`INFO_REQUESTED`.
- Cancel: chỉ Manager trong scope; lý do bắt buộc; KHÔNG tự hoàn tồn / xóa cost_entries / xóa stock_transactions; **hệ quả** theo Q-01.

### 5.3. Approval (Doc02 + Doc04)

```
DRAFT ──submit──> PENDING ──approve──> APPROVED
                   │            │
                   ├──> INFO_REQUESTED ──resubmit──> PENDING
                   ├──> REJECTED (Manager, không phải requester — BR-12)
                   └──> CANCELLED (KT trước khi có quyết định; WO cancel → CANCELLED)
```

Enum Approval: `DRAFT | PENDING | INFO_REQUESTED | APPROVED | REJECTED | CANCELLED`.

**Policy "vượt duyệt" (Q-06)**: không phải transition — là check trước khi ISSUE / trước khi cost-entry INSERT.

### 5.4. Asset status (Doc02)

Enum `asset.status`: `ACTIVE | UNDER_MAINTENANCE | UNDER_REPAIR | PAUSED | RETIRED`.

**Derived status** (UI, không lưu cột): `UNDER_REPAIR` nếu có WO sửa chữa `IN_PROGRESS`; `UNDER_MAINTENANCE` nếu có WO bảo trì `IN_PROGRESS`; ngược lại `ACTIVE`.

**Manual priority** (Doc02 §3.3.4): `RETIRED` > `PAUSED` > derived. WO mới cho asset `RETIRED` bị từ chối ở backend (`409 asset_retired`).

### 5.5. Maintenance Plan (Doc02 + Doc04)

Enum plan: `ACTIVE | PAUSED | ARCHIVED`.
Enum occurrence: `SCHEDULED | DUE | OVERDUE | SKIPPED | COMPLETED | CANCELLED`.

**Recurrence FIXED**: `due_on` cố định theo recurrence. Khi quá `due_on` và chưa có WO đang hoạt động → scheduler đánh `SKIPPED`. Kỳ bị SKIPPED không tự sinh WO bù; nếu muốn, kỳ mới tiếp theo sẽ sinh bình thường.

## 6. Single-tenant — loại bỏ multi-tenant

- Bảng `org_unit` lưu một bản ghi duy nhất (`id` = hằng số `ORG_ID = 1`), chứa tên/địa chỉ/logo/cấu hình (múi giờ, ngưỡng cảnh báo). **Không có CRUD**.
- Không có `organization_id` ở bất kỳ bảng nào. Mọi truy vấn trong scope đơn vị là mặc định; không có filter theo org.
- Seed: 1 bản ghi `org_unit`, 5 departments, 8 locations, 12 assets, 8 users (đủ 4 vai trò), 20 spare parts, 3 maintenance plans, 5 incidents, 10 WOs, 4 approvals, ~50 audit logs.

## 7. RBAC chain — gắn trên `userRoleId` (Doc05 §10.4)

```
Request → Authenticated → (resolve active user_roles)
       → chọn 1 userRoleId thỏa đồng thời:
            (a) permission.action = required
            (b) scope chứa target (location/department/asset)
       → 200 OK
       → Nếu 0 userRoleId thỏa → 403 forbidden (không suy luận ghép chéo)
```

- `user_roles` (id, user_id, role_id, granted_by, granted_at, valid_from, valid_to, status)
- `user_role_scopes` (user_role_id, scope_type: LOCATION|DEPARTMENT|ASSET, scope_id)
- Permission check: tìm `user_role_permission` qua `userRoleId` → không gộp giữa các `userRoleId`.

## 8. Attachment chu trình STAGED → READY (Doc05 §8, §13)

```
POST /files  (multipart)  →  lưu object private + tạo files(fileId, STAGED, owner_id, mime, size)
                            →  trả { fileId, expiresAt }
                                        │
                                        ▼
PUT /incidents/{id}  (DTO có attachmentFileIds)
                            →  check ownership/scope + parent tồn tại + quyền hiện tại
                            →  transaction: INSERT attachment_links + UPDATE files.status='READY'
                                        │
                                        ▼
GET /files/{fileId}/download  → check READY + quyền trên tất cả attachment_links.parent
                            →  trả presigned URL (TTL ngắn)
                                        │
                                        ▼
Cron: files.status='STAGED' AND created_at < now()-24h AND chưa READY → xóa object + files
```

- MIME allowlist: `image/png|jpeg|webp|gif`, `application/pdf`, `text/plain`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Dung lượng tối đa: 25 MB/file.
- Không thực thi file trên app server (chỉ stream từ MinIO qua presigned).
- Không cho upload extension nguy hiểm: `.exe`, `.bat`, `.sh`, `.cmd`, `.com`, `.msi`, `.scr`, `.vbs`, `.js`, `.jar`, `.php`.

## 9. AI — hợp đồng bất đồng bộ (Doc05 §6.4)

```
POST /ai/suggest/category  body { incidentId }  → 202 { requestId }
POST /ai/suggest/priority  body { incidentId }
POST /ai/suggest/solution  body { workOrderId }
POST /ai/propose-plan      body { incidentId }

GET /ai/requests/{id}  → { status: QUEUED|RUNNING|SUCCEEDED|FAILED, suggestions[], error? }
```

- Provider được gọi trong **BullMQ worker** ngoài HTTP request, không giữ DB transaction.
- Timeout 8s, retry 2 lần với backoff, circuit breaker (mở 60s sau 5 fail liên tiếp).
- Structured Output (Zod JSON schema) + server-side validate; allowlist category/priority từ `incident_categories` + `priorities`.
- Trusted instructions tách khỏi user content; untrusted attachment chỉ truyền vào phần "context" (không phải system).
- Không gửi PII không cần thiết (chỉ incidentId/woId, không gửi mô tả dài nếu không cần).
- Failure: trả suggestion rỗng + status FAILED + cho phép workflow tiếp tục thủ công.

## 10. Transaction boundary & concurrency (Doc04 §6, Doc05 §10)

| Nghiệp vụ | Boundary | Rủi ro | Cơ chế |
|---|---|---|---|
| Issue parts | files+stock_tx+part_balances+cost_entry+audit | Race trừ kho → âm | `SELECT ... FOR UPDATE` trên `part_balances` + check `on_hand >= qty` + check Q-06 net issued + net cost |
| Return parts | RETURN stock_tx + CREDIT cost_entry + part_balances UPDATE | RETURN vượt ISSUE gốc | Check `SUM(issue) − SUM(return) >= qty_return` trong tx, snapshot unit_price từ ISSUE gốc |
| Adjust stock | ADJUST stock_tx + UPDATE balance + audit | Cần lý do + role | Role ADMIN/MANAGER + reason bắt buộc |
| Complete WO | Update WO + sum cost + close incident/occurrence + notif + audit | Update trùng → mất cost | Optimistic version + Idempotency-Key + check no pending approval |
| Cancel WO | Insert WO history + update WO + Q-01 side effects + cancel pending approvals | Race với complete | Optimistic version + check status IN active list |
| Approval decision | Update approval + cost_entries status + audit | Self-approval (BR-12) | Reject nếu `requester_user_id == approver_user_id`; BR enforced ở policy |
| PM occurrence generation | Insert nhiều occurrence + scheduler log | Scheduler chạy 2 lần sinh trùng | Partial unique `UNIQUE(plan_id, due_on) WHERE status='SCHEDULED'` + scheduler log + idempotency key theo ngày |
| Login | Update login_attempts + sessions + audit | Brute force | Rate limit (10 req / IP / 60s) + lockout 15p sau 5 fail / user |
| Asset status change | Update + status_history | Race với WO complete | Optimistic version |

## 11. Kế hoạch milestone (vertical slice, có thời lượng & tiêu chí hoàn thành)

> Mỗi milestone = migration mới cho đúng module + backend (domain → service → controller) + API client regen + UI feature + test phù hợp + self-review §13.
> Ước tính thời lượng: 14 tuần = 12 tuần triển khai + 2 tuần cuối tích hợp, sửa lỗi, hoàn thiện báo cáo, diễn tập bảo vệ.

| # | Tên | Tuần | Migration | Backend modules | API | UI | Test tối thiểu | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|---|---|
| **M1** | Foundation + Auth/IAM + schema nền | W1–W2 | 0001_init: org_unit, departments, locations, users, roles, permissions, user_roles, user_role_scopes, sessions, login_attempts, audit_logs | common, infra (prisma/redis/storage stub), auth, iam, health | `/healthz`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes`, `/admin/users/{id}/reset-password` | login, user mgmt, role mgmt, scope mgmt | TC-AUTH-01..11, TC-RBAC-01..20, TC-SEC-01..04 | Lint/typecheck/test pass; healthcheck 200; login 4 vai trò OK; Admin gán role + scope thành công; UserRoleId binding test pass; audit ghi đủ |
| **M2** | Org-unit (department + location) + Asset core + QR | W3 | 0002_org_unit_asset: departments, locations, assets, asset_status_history, asset_attachments (FK attachment_links) | org-unit, asset | `/departments`, `/locations`, `/assets`, `/assets/{id}`, `/assets/{id}/status`, `/assets/{id}/qr` | asset list/detail, qr scan stub | TC-LOC-01..05, TC-ASSET-01..10 | LOCATION scope cha bao gồm con pass; Asset status transitions + RETIRED chặn tạo WO; QR trả token hợp lệ |
| **M3** | Attachment STAGED→READY + Audit viewer | W4 | 0003_attachments: files (STAGED/READY), attachment_links | attachment, audit | `POST /files`, `GET /files/{fileId}/download`, `/audit-logs` | attachment modal, audit viewer | TC-DOC-01..05, TC-AUD-01..04 | Upload STAGED; link trong transaction → READY; download có quyền mới được; cron dọn STAGED; audit log viewer |
| **M4** | Incident + AI suggest (sync) | W5 | 0004_incidents: incidents, incident_attachments, incident_history | incident + ai (sync) | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/ai/suggest/category`, `.../priority` | incident list/detail/reporter | TC-INC-01..12 | State machine pass; AI mock + OpenAI optional; Reporter tạo được; Manager assign/hủy/đóng |
| **M5** | Work Order (CRUD + state machine + complete) | W6–W7 | 0005_work_orders: work_orders (department_id_snapshot), work_order_tasks, work_order_history, replaced_by_work_order_id | work-order | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | WO list/detail/assign/complete | TC-WO-01..15 | Complete check BR-12; Cancel side effects Q-01; unique WO active per incident enforced; WO replaced_by tracking |
| **M6** | Spare parts + Issue/Return/Adjust + concurrency | W8 | 0006_inventory: spare_parts, part_balances, stock_transactions | inventory | `/spare-parts`, `/spare-parts/{id}/issue`, `/spare-parts/{id}/return`, `/spare-parts/{id}/adjust`, `/stock-transactions` | parts list/detail/issue modal | TC-PART-01..07 | Concurrency test (50 goroutine cùng issue) → không âm; RETURN không vượt; ADJUST cần reason |
| **M7** | Cost + Approval + Q-06 | W9 | 0007_cost_approval: cost_entries, approval_requests, approval_items, approval_history | cost, approval | `/work-orders/{id}/cost-entries`, `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel` | cost entry form, approval inbox, decision UI | TC-COST-01..06, TC-APR-01..10 | Self-approval test pass; Q-06 net issued + net cost check pass; APPROVED → chỉ cho issue theo phiên |
| **M8** | Maintenance Plan + Scheduler (BullMQ) | W10 | 0008_maintenance: maintenance_plans, plan_occurrences, plan_generation_log | maintenance + infra (BullMQ) | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | plan list/calendar | TC-MNT-01..05 | FIXED recurrence pass; SKIPPED cho kỳ lỡ; scheduler chạy 2 lần không sinh trùng; plan version snapshot |
| **M9** | Notification + Realtime (Socket.IO) + AI queue | W11 | (no new table; dùng ai_requests, ai_suggestions, ai_jobs, notifications, notification_jobs) | notification, realtime, ai (queue) | `/notifications`, `/notifications/{id}/read`, `WS /ws`, `POST /ai/suggest/*` (202), `GET /ai/requests/{id}` | notification list, realtime toast | TC-NOT-01..06, TC-RT-01..03, TC-AI-01..08, TC-AI-FAIL-01..04 | WebSocket JWT; notification retry-safe; AI 202 + worker + circuit breaker; fallback khi AI down |
| **M10** | Dashboard + Report CSV | W12 | 0010_dashboard_view (optional materialized) | dashboard, report | `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | dashboard + report | TC-DASH-01..04, TC-RPT-01..02 | KPI tính đúng scope; CSV có permission filter; overdue công thức Q-04 |
| **M11** | Tích hợp + hardening + demo E2E + docs | W13–W14 | (n/a) | cross-cutting | — | — | TC-UX-01..08, TC-OPS-01..03, TC-PERF-01..04 | Toàn bộ test pass; prod build; demo script end-to-end chạy từ env sạch; README đầy đủ; 0 TODO/mock trong scope P1 |

### 11.1. Lưu ý phasing

- M3 (attachment) đưa ra khỏi M1 để tránh làm M1 quá tải; đặt ngay sau M2 để Incident/WO có thể nhận attachment.
- M9 chứa cả Notification lẫn Realtime + AI queue (đã phụ thuộc nhiều module), M11 tổng hợp.
- "AI suggestion stats" trong M10 (bản cũ) — đã loại. AI suggestion stats chuyển sang M9.
- Circuit breaker nâng cao, email thật, materialized view, storage cloud → **deferred / optional** nếu chậm tiến độ (chỉ dùng mock + MinIO local).
- Mỗi milestone kết thúc có §13 self-review trước khi push.

## 12. Quy ước code

- TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`); `any`/`@ts-ignore`/`as unknown as` chỉ khi đã có comment "why" được review.
- Module NestJS: **controller (HTTP) → service (use case) → repository (Prisma) → domain (entity/policy/state machine)**. Controller chỉ validate DTO + gọi service. Service chỉ điều phối + audit. Repository chỉ Prisma. Domain không phụ thuộc framework.
- DTO (`zCreateIncidentDto`) → response (`IncidentResponse`) → Prisma model → persistence (`IncidentEntity`). Không trả Prisma model thẳng ra HTTP.
- Mọi enum/status/role/permission/error code từ `@equipcare/shared/enums` / `@equipcare/shared/errors`.
- Error: `AppError extends Error { code, httpStatus, details? }` → `AllExceptionsFilter` map sang RFC 9457 Problem Details `{ type, title, status, code, requestId, traceId, details? }`. Không trả stack trace / SQL / secret.
- Pagination: `{ page, pageSize, sort, filter }` chuẩn cho mọi list API; tối đa `pageSize ≤ 200`; response kèm `total`, `page`, `pageSize`.
- Mỗi module có:
  - `*.domain.spec.ts` — unit test policy/state machine (RBAC, BR, Q-items).
  - `*.service.spec.ts` — use case, mock repository.
  - `*.e2e-spec.ts` — API + DB thật (Testcontainers Postgres) cho critical path.
- Frontend (Vitest): component test + hook test cho form, state machine UI, permission-denied state.

## 13. Quy trình tự kiểm tra sau mỗi milestone

Trước khi đánh dấu milestone hoàn thành:

1. Đối chiếu code với acceptance criteria trong §11.
2. Chạy `pnpm lint && pnpm typecheck && pnpm test && pnpm build` ở cả 2 apps.
3. Chạy `pnpm db:migrate:deploy` từ DB sạch + `pnpm db:seed` → idempotent.
4. Khởi động Docker Compose + chạy demo flow §14.
5. Kiểm RBAC chain (4 vai trò) + tenant (= đơn vị) isolation.
6. Kiểm UI state loading/empty/error/denied cho từng feature mới.
7. Quét `TODO|FIXME|XXX|@ts-ignore|console.log` trong scope milestone — phải giải trình hoặc xóa.
8. Quét secret — `gitleaks` (chỉ khi sẵn) hoặc `git diff --staged | grep -E "(secret|password|token|key=)"` không được có pattern.
9. So sánh coverage test vs §4 — ghi nhận test nào còn thiếu.
10. Commit + push + cập nhật `IMPLEMENTATION_PLAN.md` (đánh dấu milestone done).

## 14. Demo script end-to-end (chạy từ env sạch)

```bash
# 0. Clone + env
git clone https://github.com/Mhieuu/equipcare-ai.git && cd equipcare-ai
cp .env.example .env
pnpm install

# 1. Infra
docker compose -f infra/docker-compose.yml up -d

# 2. DB
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed

# 3. Chạy
pnpm dev   # api + web + worker

# 4. Demo flow (login admin → tạo incident → Manager assign → KTV tạo WO → issue parts →
#    tạo approval → Manager approve → complete → report CSV)
bash scripts/demo-flow.sh
```

Tài khoản seed (Doc07 §3):

| Vai trò | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Manager (phòng ban SX) | `manager.sx` | `Manager@123` |
| Kỹ thuật viên | `ktv.sx01` | `Ktv@12345` |
| Người sử dụng | `reporter.sx01` | `Reporter@123` |

## 15. URL & port

| Service | URL | Port |
|---|---|---|
| Web (Next.js) | http://localhost:3000 | 3000 |
| API (NestJS) | http://localhost:3001 | 3001 |
| Swagger UI | http://localhost:3001/docs | 3001 |
| OpenAPI JSON | http://localhost:3001/docs-json | 3001 |
| Postgres | localhost:5432 (user `equipcare`, db `equipcare`) | 5432 |
| Redis | localhost:6379 | 6379 |
| MinIO API | http://localhost:9000 | 9000 |
| MinIO Console | http://localhost:9001 (`minioadmin`/`minioadmin`) | 9001 |

## 16. Rủi ro còn lại

| # | Mục | Giảm thiểu |
|---|---|---|
| R-01 | OpenAI rate limit | Mock provider mặc định; OpenAI qua env optional; circuit breaker |
| R-02 | Realtime qua proxy | Fallback polling 10s cho notification |
| R-03 | Storage prod | `StorageProvider` interface + MinIO impl; S3 impl deferred |
| R-04 | Single-tenant nếu sau này mở rộng | `org_unit.id` đã có, dễ thêm `organization_id` vào bảng qua migration |
| R-05 | Worker BullMQ cần Redis local | Docker Compose có Redis; healthcheck kiểm tra Redis trước khi start worker |
| R-06 | Deadline đồ án 14 tuần | Phasing trong §11; defer email/circuit breaker nâng cao nếu thiếu ~1 tuần |