# EquipCare AI — Implementation Plan (rev. 3)

> AI-Powered Equipment Maintenance Management System — phạm vi P1 theo bộ tài liệu đính kèm (Spec + Document01..07).
> Monorepo: `apps/api` NestJS + Prisma + Postgres · `apps/web` Next.js 14 (App Router) · `packages/shared` types/enums/RBAC · Infra Postgres 16 + Redis 7 + MinIO (Docker Compose).

Bản sửa đổi này đối chiếu lại toàn bộ các quyết định nghiệp vụ với Tài liệu 02 (SRS), 03 (UC/RBAC), 04 (ERD), 05 (Kiến trúc/API), 06 (UX), 07 (Kế hoạch kiểm thử), sau hai vòng review.

## Tóm tắt thay đổi so với rev. 2

| # | Vấn đề (rev. 2) | Sửa ở rev. 3 | Bằng chứng |
|---|---|---|---|
| 1 | Mã test sai/sáng tác (AUTH 11, RBAC 20, ASSET 10, INC 12, WO 15, COST 06, APR 10, AI 08, DASH/RPT) | Đổi về đúng Doc07 §4: TC-AUTH-01..05, TC-RBAC-01..06, TC-ORG-01..04, TC-ASSET-01..05, TC-INC-01..06, TC-WO-01..08, TC-MNT-01..05, TC-PART-01..07, TC-APR-01..07, TC-COST-01..04, TC-DOC-01..05, TC-NOT-01..06, TC-REP-01..04, TC-AI-01..06, TC-AUD-01..04, TC-CFG-01..03, TC-SEC-01..08, TC-DATA-01..05, TC-UX-01..08, TC-PERF-01..04, TC-OPS-01..03 | Doc07 §4 |
| 2 | Q-02 SKIPPED cho mọi kỳ quá hạn | Chỉ SKIPPED khi plan đang PAUSED; kỳ quá hạn khi ACTIVE → OVERDUE. Unique `UNIQUE(plan_id, due_on)` không phụ thuộc status. WO per occurrence dùng partial unique riêng | Doc02 FR-MNT-06..09 |
| 3 | Hủy WO PM trả occurrence | Nếu `due_on` còn tương lai → `SCHEDULED`; nếu đã đến hạn → `DUE` + cho phép tạo WO thay thế qua `replaced_by_work_order_id`; không scheduler chuyển ngay sang SKIPPED | Q-01 + review |
| 4 | Migration M1/M2/M3 chồng chéo, M9 thiếu migration | Sắp xếp lại: M1 gồm IAM+ORG nền; M2 Asset; M3 files/attachment; M4 Incident + AI; M9 Notification + AI còn lại | review |
| 5 | "AI sync" + timeout 8s + circuit breaker nâng cao | AI 100% async; mock provider chạy qua BullMQ trả 202 + requestId ngay từ M4; timeout **30–60s** (Doc07); circuit breaker nâng cao → **optional**, P1 chỉ cần timeout + retry giới hạn + fallback | Doc07 §6.4 |
| 6 | SLA thiếu định nghĩa | Định nghĩa `active_elapsed`, `is_overdue`, pause/resume lưu ở `work_order_status_history` (start/end); WAITING_APPROVAL loại khỏi SLA và hiển thị riêng; PAUSED cần quyền+lý do+audit; WAITING_PARTS **đã loại khỏi enum WO** (Doc04 dùng NEW/ASSIGNED/IN_PROGRESS/WAITING_APPROVAL/COMPLETED/CANCELLED) → áp dụng theo Doc04 | Doc04 §9 + Doc07 §6.4 |
| 7 | Asset status bị gộp | Tách `lifecycle_status` (lưu cột) = ACTIVE/PAUSED/RETIRED; `activity_status` (dẫn xuất, view) = NORMAL/UNDER_REPAIR/UNDER_MAINTENANCE; priority: RETIRED > PAUSED > activity | Doc02 FR-ASSET-04..05 |
| 8 | Thiếu `role_permissions`; lộ `user_role_permission` | Thêm bảng `role_permissions(role_id, permission_id)`; user_roles → roles → role_permissions → permissions | Doc05 §10.4 (chuỗi join) |
| 9 | Transaction ISSUE chứa "files"; concurrency test mô tả sai; WO completed tự CLOSED; ADJUST đặt lẫn với WO | Bỏ "files"; thêm `part_balances.UNIQUE(spare_part_id)`; `stock_transactions.operation_key UNIQUE`; RETURN tham chiếu ISSUE gốc với qty remaining; route ISSUE/RETURN qua `/work-orders/{id}/parts/{issue\|return}`; ADJUST là route quản lý tồn riêng; concurrency test "50 request/Promise chạy đồng thời"; WO completed → Incident RESOLVED (Manager CLOSED thủ công) | Doc04 §4 + Doc02 |
| 10 | Coverage P1 chưa rõ | Bổ sung ORG+asset_types+threshold (FR-ORG/CFG), low-stock alert (TC-PART-06), 6 nhóm NOT (TC-NOT-01..06), 5 ca TC-DATA-01..05, exit criteria AC-01..14 + UI-AC-01..08 + 0 S1/S2 mở | Doc07 §1.2 + §5.1 |
| 11 | Node 20 LTS "hết hỗ trợ", pin version chưa rõ, MinIO tag sai | Đổi Node sang **22 LTS** (đang maintained 2024-10 → 2027-04); pin đúng `pnpm-lock.yaml`; MinIO pin tag `RELEASE.2024-09-13T03-26-17Z`; NestJS 10 không phải "stable LTS" | https://nodejs.org/en/about/previous-releases |
| 12 | Demo dùng bash + AI_PROVIDER không rõ; Worker process không nói rõ; README thiếu PS | Demo mặc định `AI_PROVIDER=mock`; OpenAI chỉ cho smoke test; Worker là app Nest riêng trong `apps/worker` chạy trong cùng Docker Compose; bổ sung PowerShell script; demo flow đúng chuỗi Reporter → Manager → Technician → Manager approve → RESOLVED | review |
| 13 | Tuyên bố "Q-01..07 đã chốt" nhưng Doc04 vẫn open | Q-01..07 là **proposed**; trước khi code M2 cần freeze Q-list 1 lần; baseline Doc04/Doc07 phải cập nhật Q và version log | Doc04 §10 + Doc07 |

## 1. Phạm vi MVP (P1) — tổng quan

Một **đơn vị** (single-tenant). 4 vai trò: Admin, Manager, Technician, Reporter. 5 module nghiệp vụ (Asset, Incident, Work Order, Maintenance Plan, Spare Parts) + Cost & Approval + Notification + Dashboard + AI hỗ trợ.

**Trong phạm vi P1:**
- Auth (login/logout/refresh/change-password/admin-reset), audit.
- IAM (user, role, permission, scope, gán vai trò theo scope, deactivate).
- Tổ chức & danh mục (single tenant): `org_unit` 1 bản ghi, `departments` cây, `locations` cây, `asset_types`, threshold cấu hình (FR-ORG-01..03, FR-CFG-01..02).
- Asset CRUD + `lifecycle_status` + tài liệu kỹ thuật + attachment.
- Incident lifecycle + chuyển trạng thái + AI suggest category/priority.
- Work Order lifecycle + assign + issue/return/adjust parts + cost + approval + complete/cancel.
- Maintenance Plan + recurrence + scheduler.
- Spare parts + ledger + issue/return/adjust + cảnh báo tồn thấp (TC-PART-06).
- Cost & Approval (DRAFT/PENDING/AWAITING_INFO/APPROVED/REJECTED/CANCELLED).
- Notification list + realtime WS + retry-safe job (đủ 6 nhóm FR-NOT-01..06).
- Dashboard KPI + CSV report.
- AI provider abstraction (mock + OpenAI optional) — **100% async, 202 + requestId**.
- Audit log viewer (bất biến, TC-AUD-01..04).
- Data integrity tests (TC-DATA-01..05).

**Ngoài phạm vi P1 (deferred):**
- Multi-tenant, SSO/AD, phê duyệt nhiều tầng, nhiều kho, serial/lot kho, định giá kế toán, AI tự hành động, mobile app native, email thật (chỉ log), cloud storage production (chỉ MinIO), circuit breaker nâng cao, materialized view, SMTP thật.

## 2. Stack & phiên bản đã khóa (pin trong `pnpm-lock.yaml`)

| Thành phần | Phiên bản | Lý do |
|---|---|---|
| Node.js | **22 LTS** (Active LTS, 2024-10 → 2027-04) | Đang maintained, tương thích NestJS 10/11, Next 14/15. Không dùng Node 20 (đã EOL 2026-04) |
| pnpm | 9.x (9.12+) | Workspaces, lockfile chặt |
| NestJS | 10.x (current, không có LTS chính thức — ghi rõ là "current") | Tương thích Prisma 5/6, BullMQ, Passport, Swagger |
| Prisma | 5.x (latest 5.22) | Migration version đáng tin cậy, generated types |
| PostgreSQL | 16 | JSONB, partial unique index, generated columns |
| Redis | 7 | BullMQ |
| Next.js | 14.x (App Router, 14.2.x) | Stable, RSC, route handlers |
| React | 18.x | Tương thích Next 14 |
| TypeScript | 5.4+ strict | Bắt buộc |
| MinIO | `RELEASE.2024-09-13T03-26-17Z` | S3-compatible, local dev |
| Test backend | Jest 29 + Supertest + Testcontainers | Unit + integration + e2e DB thật |
| Test frontend | Vitest 1.x + Testing Library + Playwright 1.4x | Unit + E2E critical path |

> **Quy tắc pin**: tất cả phiên bản chính xác nằm trong `pnpm-lock.yaml`. Không bump major giữa dự án; nếu cần, đóng băng từng migration.

## 3. Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                 NestJS backend (HTTP + Swagger)
│  │  ├─ src/
│  │  │  ├─ modules/       auth, iam, org-unit, asset, incident, work-order,
│  │  │  │                maintenance, inventory, cost, approval,
│  │  │  │                notification, dashboard, ai, attachment, audit, report, health
│  │  │  ├─ common/        AppError, filters, pipes, decorators, guards (PolicyGuard, ScopeGuard)
│  │  │  ├─ infra/         prisma, redis, storage, mail (log-only), realtime (WS gateway)
│  │  │  └─ main.ts
│  │  ├─ prisma/           schema.prisma, migrations/, seed.ts, seed-helpers/
│  │  ├─ test/             e2e
│  │  └─ package.json
│  ├─ web/                 Next.js frontend
│  │  ├─ src/app/          App Router pages (SCR-*)
│  │  ├─ src/features/     feature-based, mỗi feature có api/ + ui/
│  │  ├─ src/lib/          auth, rbac-check, ws-client
│  │  └─ package.json
│  └─ worker/              BullMQ worker app — chạy RIÊNG với api
│     ├─ src/processors/   ai.processor.ts, notification.processor.ts, scheduler.processor.ts
│     └─ package.json
├─ packages/
│  └─ shared/              types, enums, RBAC policy, OpenAPI client
├─ infra/
│  ├─ docker-compose.yml   postgres, redis, minio, api, web, worker
│  └─ minio/               init bucket script
├─ scripts/
│  ├─ reset-db.sh
│  ├─ reset-db.ps1
│  ├─ demo-flow.sh
│  └─ demo-flow.ps1
├─ .env.example
├─ .nvmrc                  22
├─ .editorconfig
├─ .eslintrc.cjs (root)
├─ .prettierrc
├─ tsconfig.base.json
├─ pnpm-workspace.yaml
├─ package.json
├─ README.md
└─ IMPLEMENTATION_PLAN.md
```

> **Worker là app riêng** (`apps/worker`), không nhúng vào API. Lý do: scaling độc lập, không block HTTP khi job nặng; tránh giữ DB transaction ngầm.

## 4. Bảng truy vết yêu cầu (đã đối chiếu Doc02/Doc07)

Mã yêu cầu lấy đúng từ Doc02; mã test lấy đúng từ Doc07.

### 4.1. Tổng hợp

| Module | FR/NFR (Doc02) | API (Doc05) | DB (Doc04) | UI (Doc06) | Test (Doc07) |
|---|---|---|---|---|---|
| Auth | FR-AUTH-01..07 | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users/{id}/reset-password` | users, sessions, login_attempts | SCR-AUTH-01..05 | TC-AUTH-01..05 |
| IAM (RBAC) | FR-AUTH-03/05; AC-01/14 | `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes` | users, roles, permissions, role_permissions, user_roles, user_role_scopes | SCR-IAM-01..06 | TC-RBAC-01..06 |
| Tổ chức & danh mục | FR-ORG-01..03; FR-CFG-01..02 | `/departments`, `/locations`, `/asset-types`, `/config` | org_unit, departments, locations, asset_types, thresholds | SCR-ORG-01..03 | TC-ORG-01..04 |
| Asset | FR-ASSET-01..09; AC-02 | `/assets`, `/assets/{id}`, `/assets/{id}/lifecycle`, `/assets/{id}/qr`, `/assets/{id}/documents`, `/technical-documents` | assets, asset_status_history, technical_documents, document_versions, document_roles | SCR-ASSET-01..05 | TC-ASSET-01..05 |
| Incident | FR-INC-01..09; AC-03 | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/ai/suggest/category`, `.../priority` | incidents, incident_messages, incident_history | SCR-INC-01..06 | TC-INC-01..06 |
| Work Order | FR-WO-01..09; AC-04/13 | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | work_orders, work_order_tasks, work_order_status_history, work_order_attachments | SCR-WO-01..07 | TC-WO-01..08 |
| Maintenance | FR-MNT-01..09; AC-05 | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | maintenance_plans, plan_occurrences, plan_generation_log | SCR-MNT-01..04 | TC-MNT-01..05 |
| Inventory | FR-PART-01..08; AC-06 | `/spare-parts`, `/spare-parts/{id}/adjust`, `/stock-transactions`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/low-stock-alerts` | spare_parts, part_balances, stock_transactions | SCR-PART-01..03 | TC-PART-01..07 |
| Cost | FR-COST-01..04; AC-08 | `/work-orders/{id}/cost-entries` | cost_entries | SCR-COST-01..03 | TC-COST-01..04 |
| Approval | FR-APR-01..06; AC-07/14 | `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel` | approval_requests, approval_items, approval_history, approval_revisions | SCR-APR-01..04 | TC-APR-01..07 |
| Notification | FR-NOT-01..06; AC-09 | `/notifications`, `/notifications/{id}/read`, `WS /ws` | notifications, notification_jobs | SCR-NOT-01..03 | TC-NOT-01..06 |
| Dashboard/Report | FR-REP-01..05; AC-11 | `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | view v_kpi_* | SCR-DASH-01..02 | TC-REP-01..04 |
| AI | FR-AI-01..06; NFR-AI-01..05; AC-10 | `POST /ai/suggest/*` (202 + requestId), `GET /ai/requests/{id}` | ai_requests, ai_suggestions, ai_jobs | SCR-AI-01..02 | TC-AI-01..06 |
| Attachment | FR-DOC-01..04 | `POST /files`, `GET /files/{fileId}/download` | files (STAGED/READY), attachment_links | n/a (modal) | TC-DOC-01..05 |
| Audit | FR-AUD-01..03; AC-12 | `/audit-logs`, `/audit-logs/{id}` | audit_logs | SCR-AUD-01 | TC-AUD-01..04 |
| Config | FR-CFG-01..02; AC-12 | `/config`, `/config/{key}` | config | SCR-CFG-01..02 | TC-CFG-01..03 |
| Bảo mật & toàn vẹn | NFR-SEC-01..06; DR-* | (across modules) | (across modules) | n/a | TC-SEC-01..08; TC-DATA-01..05 |
| UX | UI-*; NFR-USAB-*; UI-AC-* | — | — | SCR-* | TC-UX-01..08 |
| Hiệu năng | NFR-PERF-* | — | — | — | TC-PERF-01..04 |
| Vận hành | NFR-MNT-03 | — | (migration) | — | TC-OPS-01..03 |

> Không dùng TC-RT-* và TC-AI-FAIL-* — Doc07 chưa định nghĩa. WS và AI fail test được cover trong TC-NOT-* và TC-AI-* + TC-SEC-*.

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
| FR-APR-*; AC-07/14 | TC-APR-01..07 |
| FR-NOT-*; AC-09 | TC-NOT-01..06 |
| FR-DOC-* | TC-DOC-01..05 |
| FR-REP-*; AC-11 | TC-REP-01..04 |
| FR-AI-*; AC-10 | TC-AI-01..06 |
| FR-AUD-*; AC-12 | TC-AUD-01..04 |
| NFR-SEC-01..06 | TC-SEC-01..08 |
| DR-* (data integrity) | TC-DATA-01..05 |
| NFR-PERF-* | TC-PERF-01..04 |
| NFR-USAB-*; UI-AC-* | TC-UX-01..08 |
| NFR-MNT-03; ops | TC-OPS-01..03 |

### 4.3. Q-items trong Doc04 §10 — baseline đã chốt (sẽ cập nhật lại Doc04 ở vòng sau)

| ID | Nội dung | Baseline áp dụng |
|---|---|---|
| Q-01 | Hệ quả hủy WO với Incident/Occurrence/Approval | (1) WO REPAIR hủy: Incident về `NEW` hoặc `AWAITING_INFO` tùy lý do; nếu Incident không còn WO đang mở khác. (2) WO MAINTENANCE hủy: nếu `due_on` còn tương lai → occurrence về `SCHEDULED`; nếu đã đến hạn → occurrence về `DUE`, cho phép tạo WO thay thế. (3) Approval `PENDING/AWAITING_INFO` liên quan WO bị hủy → `CANCELLED`. Lưu `replaces_work_order_id` / `replaced_by_work_order_id` để truy vết. (4) Không tự xóa stock_transactions / cost_entries; giữ audit. |
| Q-02 | Recurrence FIXED/AFTER_COMPLETION + SKIPPED/OVERDUE | (1) Recurrence **FIXED**. (2) Plan `PAUSED` → kỳ quá hạn chuyển `SKIPPED` với reason `PLAN_PAUSED`. (3) Plan `ACTIVE` → kỳ quá hạn chuyển `OVERDUE`. (4) Khi resume plan: KHÔNG sinh bù các kỳ đã SKIPPED; tiếp tục từ kỳ tương lai gần nhất. (5) `UNIQUE(plan_id, due_on)` (không phụ thuộc status). (6) Per-occurrence WO: partial unique riêng `UNIQUE(source_occurrence_id) WHERE status IN (active set)`. |
| Q-03 | Mô hình kho + RETURN | (1) Một vị trí lưu duy nhất, một `on_hand` mỗi part; `part_balances.UNIQUE(spare_part_id)`. (2) `stock_transactions.operation_key UNIQUE` (idempotency). (3) `stock_transactions.original_stock_tx_id` cho RETURN; RETURN tham chiếu ISSUE gốc và kiểm tra qty remaining trên chính ISSUE đó. (4) ISSUE/RETURN đi qua `/work-orders/{id}/parts/{issue\|return}`; ADJUST là route quản lý tồn riêng. (5) CREDIT theo unit_price snapshot. (6) Tất cả trong cùng transaction. |
| Q-04 | SLA khi chờ duyệt | (1) SLA bắt đầu ở `work_order_status_history`: row đầu tiên với `status IN (ASSIGNED, IN_PROGRESS)`. (2) pause/resume lưu cùng bảng `work_order_status_history` (`started_at`, `ended_at`, `pause_reason`). (3) `WAITING_APPROVAL` không tính SLA; hiển thị riêng `waiting_approval_time`. (4) `PAUSED` cần quyền + lý do + audit; hiện `PAUSED` chưa có trong enum WO Doc04 (`NEW/ASSIGNED/IN_PROGRESS/WAITING_APPROVAL/COMPLETED/CANCELLED`) → **dùng đúng enum Doc04**, không thêm PAUSED ở WO. Trạng thái "ngưng" thể hiện bằng `IN_PROGRESS` + audit log + lý do. (5) `WAITING_PARTS` không có trong enum Doc04 → không dùng; nếu chờ linh kiện → giữ `IN_PROGRESS` + flag trong approval request. |
| Q-05 | Department snapshot WO | `work_orders.department_id_snapshot` (FK departments) — copy tại lúc tạo WO, không đổi khi asset chuyển phòng ban sau. |
| Q-06 | Vượt phương án duyệt | (1) Kiểm tra `net_issued_quantity` và `net_cost` (sum DEBIT − sum CREDIT) so với approval `APPROVED`. (2) Vượt → từ chối issue/cost-entry; gợi ý tạo `approval_revisions` (FK `original_approval_id`); chỉ tiếp tục sau khi APPROVED. (3) `approval_items.quantity` chính là ngưỡng. |
| Q-07 | LOCATION scope cha-con | Scope `user_role_scopes(location_id, department_id, asset_id)` — khi check, **cha bao gồm con**: nếu user_role_scope có location_id=X, tất cả location có ancestor chứa X đều nằm trong scope. |

### 4.4. Trạng thái tham chiếu (theo Doc04)

- **Incident** enum: `NEW | ASSIGNED | AWAITING_INFO | IN_PROGRESS | RESOLVED | CLOSED | CANCELLED` (Doc04)
- **Work Order** enum: `NEW | ASSIGNED | IN_PROGRESS | WAITING_APPROVAL | COMPLETED | CANCELLED` (Doc04 — không có PAUSED, WAITING_PARTS)
- **Approval** enum: `DRAFT | PENDING | AWAITING_INFO | APPROVED | REJECTED | CANCELLED`
- **Asset.lifecycle_status** (lưu cột): `ACTIVE | PAUSED | RETIRED`
- **Asset.activity_status** (dẫn xuất, view): `NORMAL | UNDER_REPAIR | UNDER_MAINTENANCE`

> UI hiển thị: `RETIRED > PAUSED > activity_status > NORMAL`.

## 5. State machine

### 5.1. Incident (Doc04 enum)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need info──> AWAITING_INFO ──resend──> IN_PROGRESS
 │                  │                    │                          │
 │                  │                    ├──> RESOLVED ──close──> CLOSED
 │                  │                    ├──> CANCELLED (Manager) ─┘
 │                  │                    └──(back to IN_PROGRESS)
 │                  └──> CANCELLED (Manager)
 └──> CANCELLED (Manager)
                                                                REOPENED ──> IN_PROGRESS
```

Quy tắc chuyển:
- Cancel Incident: chỉ Manager trong scope; nếu còn WO đang mở → từ chối (BR-12).
- Close Incident: chỉ Manager; sau khi mọi WO liên quan đã `COMPLETED` (xem §10.5).

### 5.2. Work Order (Doc04 enum — 6 trạng thái)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need approval──> WAITING_APPROVAL
   │                  │                  │                                │
   │                  │                  ├──> COMPLETED (BR-12)            ├──approve──> IN_PROGRESS
   │                  │                  ├──> CANCELLED (Manager, BR-13)   ├──reject──> IN_PROGRESS
   │                  │                  │                                ├──cancel──> CANCELLED
   │                  │                  └──(loop until all gates pass)
   │                  └──> CANCELLED
   └──> CANCELLED
```

Quy tắc (Doc02 + Doc04):
- Complete WO: bắt buộc result, performer, end_at, các checklist bắt buộc, **không còn approval `PENDING/AWAITING_INFO`**, không còn stock_tx `PENDING`.
- Cancel WO: chỉ Manager trong scope; lý do bắt buộc; **không** tự hoàn tồn / xóa cost_entries / xóa stock_transactions; **hệ quả** theo Q-01 + §3.
- Trạng thái "ngưng tạm" trong nghiệp vụ (vd thiếu linh kiện): giữ `IN_PROGRESS` + ghi `pause_reason` ở `work_order_status_history` + audit + có thể kèm approval request `PENDING` chờ duyệt phương án mua linh kiện.

### 5.3. Approval (Doc02 + Doc04)

```
DRAFT ──submit──> PENDING ──approve──> APPROVED
                   │            │
                   ├──> AWAITING_INFO ──resubmit──> PENDING
                   ├──> REJECTED (Manager, người duyệt ≠ người tạo)
                   └──> CANCELLED (KTV hoặc WO cancel; chưa có quyết định cuối)
```

### 5.4. Asset (Doc02 — tách 2 lớp)

- `lifecycle_status` (cột lưu, 3 giá trị): `ACTIVE | PAUSED | RETIRED`. Manager đổi qua API; lý do bắt buộc.
- `activity_status` (view dẫn xuất, 3 giá trị):
  - Có WO REPAIR `IN_PROGRESS` cho asset → `UNDER_REPAIR`.
  - Có WO MAINTENANCE `IN_PROGRESS` cho asset → `UNDER_MAINTENANCE`.
  - Ngược lại → `NORMAL`.
- **Hiển thị UI** (priority, không lưu): `RETIRED > PAUSED > activity_status > NORMAL`.
- Chặn tạo WO mới cho asset `lifecycle_status = RETIRED` (BR-04).

### 5.5. Maintenance Plan + Occurrence

- Plan: `ACTIVE | PAUSED | ARCHIVED`.
- Occurrence: `SCHEDULED | DUE | OVERDUE | SKIPPED | COMPLETED | CANCELLED`.

Quy tắc scheduler (Doc02 FR-MNT-04..09 + Q-02):
- Plan `ACTIVE`, đến `due_on`, chưa có WO đang mở → chuyển `DUE` → sinh WO (idempotent).
- Plan `ACTIVE`, đến `due_on`, chưa có WO đang mở nhưng KHÔNG sinh được WO (vd asset RETIRED) → giữ `DUE` + flag `WO_BLOCKED`.
- Plan `PAUSED`, kỳ đến/quá hạn → `SKIPPED`, reason `PLAN_PAUSED`.
- Plan `ACTIVE`, kỳ đã quá hạn (do scheduler không chạy hoặc lỗi) → `OVERDUE`.
- Resume plan → KHÔNG sinh bù các kỳ SKIPPED/OVERDUE; tiếp tục từ kỳ tương lai gần nhất.
- Hủy WO MAINTENANCE: nếu `due_on > now()` → occurrence `SCHEDULED`; nếu `due_on <= now()` → occurrence `DUE` + cho phép tạo WO thay thế (lưu `replaced_by_work_order_id`).
- `UNIQUE(plan_id, due_on)` (không phụ thuộc status) — chống duplicate.
- Per-occurrence WO: partial unique riêng `UNIQUE(source_occurrence_id) WHERE status IN active_set`.

## 6. SLA — định nghĩa rõ (Q-04)

- **sla_started_at**: thời điểm WO vào `ASSIGNED` (row đầu trong `work_order_status_history` với status thuộc active set).
- **active_elapsed**: `min(now, completed_at or cancelled_at) − sla_started_at − Σ(pause_duration)`. `pause_duration` cộng dồn từ các khoảng trong `work_order_status_history` có `pause_reason IS NOT NULL` (hiện Doc04 chưa có status PAUSED → các khoảng này ứng với `IN_PROGRESS` có ghi `pause_reason`).
- **waiting_approval_time**: `Σ(end − start)` của các khoảng `WAITING_APPROVAL`. Hiển thị riêng trong UI/report.
- **is_overdue** (dẫn xuất): `now() > sla_due_at AND status IN (NEW, ASSIGNED, IN_PROGRESS, WAITING_APPROVAL) AND active_elapsed > sla_minutes × 60`. KHÔNG lưu cột.
- **sla_due_at**: `sla_started_at + sla_minutes × 60` (cấu hình theo priority).
- **PAUSED**: hiện Doc04 enum WO không có → không dùng trạng thái PAUSED. Việc "ngưng" thể hiện qua `IN_PROGRESS` + `pause_reason` + audit.

## 7. Single-tenant

- Bảng `org_unit` lưu **1 bản ghi** (`id = ORG_ID = 1`): tên/địa chỉ/logo/múi giờ/threshold cấu hình.
- **Không** có `organization_id` ở bất kỳ bảng nào. Mọi truy vấn trong phạm vi đơn vị là mặc định.
- Seed: 1 `org_unit`, 5 departments, 8 locations, 4 asset_types, 12 assets, 8 users (4 vai trò), 20 spare parts, 3 maintenance plans, 5 incidents, 10 WOs, 4 approval requests, ~50 audit logs.

## 8. RBAC chain (Doc05 §10.4)

```
Request → Authenticated
       → resolve active user_roles (valid_from <= now < valid_to AND status='ACTIVE')
       → chọn 1 userRoleId thỏa đồng thời:
            (a) roles → role_permissions → permissions: có permission.action = required
            (b) user_role_scopes(UserRoleId): scope chứa target (location/department/asset)
       → 200 OK
       → Nếu 0 userRoleId thỏa → 403 forbidden (KHÔNG ghép quyền A với scope B)
```

Schema IAM:
- `users(id, username, email, password_hash, full_name, status, ...)`
- `roles(id, code, name, ...)`
- `permissions(id, code, action, resource)` — vd `INCIDENT_UPDATE`, `WO_CANCEL`, `INVENTORY_ISSUE`
- `role_permissions(role_id, permission_id)` — bảng nối trung gian
- `user_roles(id, user_id, role_id, granted_by, granted_at, valid_from, valid_to, status)`
- `user_role_scopes(user_role_id, scope_type: LOCATION|DEPARTMENT|ASSET, scope_id)`

> Lưu ý: KHÔNG có bảng `user_role_permission` (không có trong tài liệu). Permission chain đi qua `user_roles → roles → role_permissions → permissions`.

## 9. Attachment STAGED → READY (Doc05 §8, §13)

```
POST /files (multipart) → lưu object private + files(fileId, STAGED, owner_id, mime, size)
                         → trả { fileId, expiresAt }
                                        │
                                        ▼
POST /incidents (DTO có attachmentFileIds)
  → kiểm tra ownership/scope + parent tồn tại + quyền hiện tại
  → transaction:
        INSERT attachment_links
        UPDATE files.status='READY'
                                        │
                                        ▼
GET /files/{fileId}/download
  → check READY + quyền trên TẤT CẢ attachment_links.parent (Doc05 §13)
  → trả presigned URL (TTL ≤ 300s)
                                        │
                                        ▼
Cron mỗi giờ: files.status='STAGED' AND created_at < now()-ATTACHMENT_STAGED_TTL_HOURS
              → xóa object trên MinIO + UPDATE files.status='EXPIRED'
```

- MIME allowlist: `image/png|jpeg|webp|gif`, `application/pdf`, `text/plain`, `application/vnd.ms-excel`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
- Dung lượng tối đa: 25 MB/file (`S3_MAX_UPLOAD_BYTES`).
- Không thực thi file trên app server (chỉ stream từ MinIO qua presigned).
- Extension blocklist: `.exe .bat .sh .cmd .com .msi .scr .vbs .js .jar .php`.

## 10. AI — 100% async (Doc05 §6.4, Doc07 §6.4)

```
POST /ai/suggest/category  body { incidentId }  → 202 { requestId }
POST /ai/suggest/priority  body { incidentId }
POST /ai/suggest/solution  body { workOrderId }
POST /ai/propose-plan      body { incidentId }

GET /ai/requests/{id} → { status: QUEUED|RUNNING|SUCCEEDED|FAILED, suggestions[], error? }
```

- Provider được gọi trong `apps/worker` (BullMQ), ngoài HTTP request, không giữ DB transaction ngầm.
- **Timeout: 30–60 giây** (Doc07 §6.4 — cấu hình `AI_REQUEST_TIMEOUT_MS=45000`).
- Retry giới hạn 2 lần với exponential backoff (200ms, 800ms).
- **Circuit breaker nâng cao → optional** (deferred nếu chậm). P1 chỉ cần timeout + retry + fallback.
- Structured Output (Zod JSON schema) + server-side validate; allowlist category/priority từ `incident_categories` + `priorities`.
- Trusted instructions tách khỏi user content; attachment chỉ truyền vào phần "context" (không phải system).
- Không gửi PII không cần thiết (chỉ ID, không mô tả dài).
- Failure: trả suggestion rỗng + status `FAILED` + workflow tiếp tục thủ công. Test bằng mock provider (`AI_PROVIDER=mock`).

## 11. Transaction boundary & concurrency

| Nghiệp vụ | Boundary | Rủi ro | Cơ chế |
|---|---|---|---|
| Issue parts | `stock_transactions` (operation_key UNIQUE) + `part_balances` + `cost_entries` + `audit_logs` | Race trừ kho → âm | `SELECT ... FOR UPDATE` trên `part_balances` + check `on_hand >= qty` + check Q-06 net issued + net cost |
| Return parts | RETURN stock_tx (`original_stock_tx_id` FK) + CREDIT cost_entry + UPDATE part_balances | RETURN vượt ISSUE gốc | Trong tx: `SELECT ... FOR UPDATE` row ISSUE gốc → check `Σ(issue_to_issue) − Σ(return_from_issue) >= qty_return`; snapshot unit_price từ ISSUE gốc |
| Adjust stock | ADJUST stock_tx + UPDATE balance + audit | Cần lý do + role | Role ADMIN/MANAGER + `reason` bắt buộc |
| Complete WO | Update WO + sum cost + Incident → RESOLVED (không tự CLOSED) + nullify pause + WS notif + audit | Update trùng → mất cost | Optimistic version + Idempotency-Key + check no `PENDING/AWAITING_INFO` approval |
| Cancel WO | Update WO + status_history + Q-01 side effects + cancel pending approvals | Race với complete | Optimistic version + check status IN active list + lock approval rows |
| Approval decision | Update approval + cost_entries status + audit | Self-approval (BR-12) | Reject nếu `requester_user_id == approver_user_id`; BR enforced ở policy |
| PM occurrence generation | Insert occurrence + scheduler log | Scheduler chạy 2 lần → sinh trùng | `UNIQUE(plan_id, due_on)` + scheduler log + idempotency key theo ngày |
| PM WO generation per occurrence | Insert WO + occurrence update | Sinh 2 WO cho 1 occurrence | Partial unique `UNIQUE(source_occurrence_id) WHERE status IN active_set` |
| Login | Update login_attempts + sessions + audit | Brute force | Rate limit 10/IP/60s + lockout 15p sau 5 fail/user |
| File STAGED → READY | UPDATE files + INSERT attachment_links | Race dùng file chưa thuộc quyền | SELECT FOR UPDATE files + check owner + scope |
| Asset lifecycle change | UPDATE assets + INSERT asset_status_history | Race với WO complete | Optimistic version |
| AI request | INSERT ai_requests (QUEUED) → worker INSERT ai_jobs | HTTP timeout | 202 ngay; worker xử lý |

> Concurrency test bằng **50 request/Promise chạy đồng thời** trong test (Node `Promise.allSettled` hoặc Supertest parallel) cho issue parts trên cùng part — assertion: `on_hand >= 0` và tổng issue đúng bằng số thực tế.

## 12. Milestone plan (vertical slice, 14 tuần)

> Mỗi milestone = migration mới cho đúng module + backend (domain → service → controller) + API client regen + UI feature + test phù hợp + self-review §14.
> 14 tuần = 12 tuần triển khai + 2 tuần cuối tích hợp, sửa lỗi, hoàn thiện báo cáo, diễn tập bảo vệ.
> Feature freeze cuối W12 (20/12/2026). W13–W14 chỉ sửa lỗi.

| # | Tên | Tuần | Migration (Prisma) | Backend modules | API mới | UI mới | Test tối thiểu | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|---|---|
| **M1** | Foundation + Auth + IAM + Org nền | W1–W2 | `0001_init`: org_unit, departments, locations, users, roles, permissions, role_permissions, user_roles, user_role_scopes, sessions, login_attempts, audit_logs, config | common, infra (prisma/redis/storage stub), auth, iam, org-unit, health | `/healthz`, `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes`, `/admin/users/{id}/reset-password`, `/departments`, `/locations`, `/config` | login, user mgmt, role mgmt, scope mgmt, dept tree, config | TC-AUTH-01..05, TC-RBAC-01..06, TC-ORG-01..04, TC-CFG-01..03, TC-SEC-01..04 | Lint/typecheck/test pass; healthcheck 200; login 4 vai trò OK; Admin gán role + scope thành công; userRoleId binding test pass; audit ghi đủ |
| **M2** | Asset + QR + lifecycle_status | W3 | `0002_asset`: assets, asset_status_history, asset_types, throttle (FK locations/departments; KHÔNG FK attachment — để M3) | org-unit (asset_types), asset | `/asset-types`, `/assets`, `/assets/{id}`, `/assets/{id}/lifecycle`, `/assets/{id}/qr`, `/assets/{id}/status-history` | asset list/detail, qr scan stub | TC-ASSET-01..05 | LOCATION scope cha bao gồm con pass; lifecycle_status transitions + RETIRED chặn tạo WO; QR trả token hợp lệ; activity_status view đúng |
| **M3** | Attachment STAGED→READY + Audit viewer | W4 | `0003_attachments`: files (STAGED/READY/EXPIRED), attachment_links (CK một parent); document_versions, document_roles | attachment, audit | `POST /files`, `GET /files/{fileId}/download`, `/audit-logs` | attachment modal, audit viewer | TC-DOC-01..05, TC-AUD-01..04 | Upload STAGED; link trong transaction → READY; download có quyền mới được; cron dọn STAGED; audit log viewer (bất biến) |
| **M4** | Incident + AI async (mock provider qua worker) | W5–W6 | `0004_incidents_ai`: incidents, incident_messages, incident_history, ai_requests, ai_suggestions, ai_jobs | incident, ai (provider interface + mock + worker adapter), realtime gateway (skeleton) | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/messages`, `/ai/suggest/category`, `/ai/suggest/priority`, `/ai/requests/{id}` | incident list/detail/reporter, AI suggest UI | TC-INC-01..06, TC-AI-01..06 | State machine đúng Doc04 enum; AI 202 + requestId; mock provider qua worker; GET /ai/requests/{id} chuyển trạng thái; fallback khi provider down |
| **M5** | Work Order (CRUD + state machine + complete/cancel) | W7–W8 | `0005_work_orders`: work_orders (department_id_snapshot, source_occurrence_id, replaced_by_work_order_id), work_order_tasks, work_order_status_history, work_order_attachments | work-order, realtime (notify on transition) | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel`, `/work-orders/{id}/status-history` | WO list/detail/assign/complete/cancel | TC-WO-01..08 | Complete check BR-12 (no PENDING/AWAITING_INFO); Cancel side effects Q-01; Incident → RESOLVED (không tự CLOSED); partial unique WO per incident enforced |
| **M6** | Spare parts + Issue/Return/Adjust + concurrency | W9 | `0006_inventory`: spare_parts, part_balances (UNIQUE spare_part_id), stock_transactions (operation_key UNIQUE, original_stock_tx_id), low_stock_alerts | inventory, realtime | `/spare-parts`, `/spare-parts/{id}/adjust`, `/stock-transactions`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/low-stock-alerts` | parts list/detail/issue modal, low-stock page | TC-PART-01..07 | Concurrency test 50 request/Promise đồng thời → `on_hand >= 0`; RETURN không vượt qty remaining của ISSUE gốc; ADJUST cần reason; low-stock alert đúng threshold |
| **M7** | Cost + Approval + Q-06 (vượt duyệt) | W10 | `0007_cost_approval`: cost_entries, approval_requests, approval_items, approval_history, approval_revisions | cost, approval, realtime | `/work-orders/{id}/cost-entries`, `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel`, `/approvals/{id}/revisions` | cost entry form, approval inbox, decision UI | TC-COST-01..04, TC-APR-01..07 | Self-approval test pass; Q-06 check `net_issued_quantity` + `net_cost`; APPROVED → chỉ cho issue theo phiên; revision chain đúng |
| **M8** | Maintenance Plan + Scheduler (BullMQ) | W11 | `0008_maintenance`: maintenance_plans, plan_occurrences, plan_generation_log | maintenance, worker (scheduler processor) | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | plan list/calendar | TC-MNT-01..05 | Recurrence FIXED pass; plan PAUSED → SKIPPED với reason; plan ACTIVE → OVERDUE; UNIQUE(plan_id, due_on); resume không sinh bù; partial unique per-occurrence WO |
| **M9** | Notification + Realtime WS + Dashboard + Report | W12 | (no new table cho notif — dùng notification, notification_jobs đã có từ M4/M5; nếu chưa có thì migration `0009_notif_dashboard`) | notification (controller + worker processor), dashboard, report | `/notifications`, `/notifications/{id}/read`, `WS /ws`, `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | notification list + realtime toast, dashboard, report | TC-NOT-01..06, TC-REP-01..04, TC-DATA-01..05 | WS auth JWT; notification 6 nhóm đúng FR-NOT; KPI tính đúng scope; CSV có permission filter; overdue công thức Q-04; 5 ca data integrity pass |
| **M10** | Tích hợp + hardening + E2E + docs | W13–W14 | (n/a) | cross-cutting, all | — | polish UX (TC-UX-01..08), accessibility | TC-UX-01..08, TC-OPS-01..03, TC-PERF-01..04 | Toàn bộ test pass; prod build; demo script E2E chạy từ env sạch; README đầy đủ; 0 TODO/mock ngoài stub đã phê duyệt; feature freeze; diễn tập bảo vệ |

### 12.1. Phân bổ coverage P1

- P1 Critical (Doc07): AUTH, RBAC, WO, PART, APR, SEC/DATA.
- Phủ AC-01..AC-14, UI-AC-01..UI-AC-08 trong exit criteria M10.
- 6 nhóm FR-NOT-* đầy đủ ở M9.
- FR-ORG-01..03 + FR-CFG-01..02 phủ ở M1 + M2.
- 5 ca TC-DATA-01..05 ở M9 (kết hợp các module đã xong).

### 12.2. Deferred / optional

- Circuit breaker nâng cao, email thật, materialized view, storage cloud → **optional**; ưu tiên core.
- "AI suggestion stats" (số liệu thống kê) → nếu còn thời gian ở M9, dùng view `v_ai_stats` (mock).
- SMTP thật, OIDC/SSO → ngoài P1.

## 13. Baseline tài liệu — cần đồng bộ

Trước khi đóng băng baseline (cuối M0), cần cập nhật:

1. **Doc04 v1.3**: cập nhật Q-01..Q-07 thành "đã chốt" theo §4.3; thêm `role_permissions`; bổ sung `part_balances.UNIQUE(spare_part_id)` và `stock_transactions.operation_key UNIQUE`; Incident enum đổi `AWAITING_INFO` (đã có); WO enum không thêm PAUSED/WAITING_PARTS.
2. **Doc07 v1.2**: chuyển test phụ thuộc Q-01..Q-07 từ `Blocked/Deferred` → `Planned/Ready`; thêm TC-DATA-01..05 đầy đủ nội dung 5 ca; bổ sung version log.
3. **Doc05**: bổ sung diagram Worker riêng.
4. **Doc02**: thêm ghi chú `WAITING_PARTS` không dùng (chờ linh kiện → giữ `IN_PROGRESS` + approval pending).

> Tôi sẽ không tự sửa Doc02/04/05/07 — đây là tài liệu nguồn của bạn. Sau khi M10 pass, bạn cập nhật Doc* theo §13 và phát hành v1.x mới.

## 14. Quy trình tự kiểm tra sau mỗi milestone

1. Đối chiếu code với acceptance criteria trong §12.
2. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` ở cả 2 apps + worker.
3. `pnpm db:migrate:deploy` từ DB sạch + `pnpm db:seed` → idempotent.
4. `pnpm infra:up` rồi chạy `bash scripts/demo-flow.sh` (hoặc `pwsh scripts/demo-flow.ps1` trên Windows).
5. Kiểm RBAC chain (4 vai trò) + tenant isolation.
6. Kiểm UI state loading/empty/error/denied cho từng feature mới.
7. Quét `TODO|FIXME|XXX|@ts-ignore|console.log` trong scope milestone — phải giải trình hoặc xóa.
8. Quét secret — `git diff --staged | grep -E "(secret|password|token|key=)"` không được có giá trị thật (placeholder OK).
9. So sánh coverage test vs §4 — ghi nhận test nào còn thiếu.
10. Commit + push + cập nhật `IMPLEMENTATION_PLAN.md` (đánh dấu milestone done).

## 15. Demo flow end-to-end

Tham khảo §11/§12 của README. Chuỗi thao tác:

```
Reporter (reporter.sx01)      → Tạo Incident "Máy CNC-01 báo lỗi spindle"
Manager (manager.sx)          → Tiếp nhận; tạo WO REPAIR; phân công KTV
Technician (ktv.sx01)         → Cập nhật WO IN_PROGRESS; issue parts; tạo approval PENDING
Manager (manager.sx)          → Approve approval; WO về IN_PROGRESS
Technician (ktv.sx01)         → Resolve; nhập kết quả; complete WO → Incident RESOLVED
Manager (manager.sx)          → Close Incident → CLOSED
Reporter / Manager            → Xem dashboard; xuất CSV work-orders.csv; kiểm tra báo cáo
```

## 16. Rủi ro còn lại

| # | Mục | Giảm thiểu |
|---|---|---|
| R-01 | OpenAI rate limit / timeout | Mock provider mặc định; OpenAI optional + smoke test riêng; timeout 30–60s |
| R-02 | Realtime qua proxy / firewall | Fallback polling 10s |
| R-03 | Storage prod | MinIO local đủ demo; S3 impl deferred |
| R-04 | Single-tenant nếu sau này mở rộng | `org_unit.id` đã có sẵn |
| R-05 | Worker BullMQ cần Redis | Docker Compose có Redis; healthcheck kiểm tra trước khi start worker |
| R-06 | Deadline 14 tuần | Phasing trong §12; defer circuit breaker/SMTP/materialized view nếu thiếu ~1 tuần |
| R-07 | PowerShell vs bash trên Windows | Cung cấp cả 2 script (`.sh` và `.ps1`); PowerShell dùng `Copy-Item`, `Remove-Item`, `Select-String` thay `cp`, `rm`, `grep` |