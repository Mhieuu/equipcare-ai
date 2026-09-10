# EquipCare AI — Implementation Plan (rev. 4)

> AI-Powered Equipment Maintenance Management System — phạm vi P1 theo bộ tài liệu đính kèm (Spec + Document01..07).
> Monorepo: `apps/api` NestJS + Prisma + Postgres · `apps/web` Next.js 14 (App Router) · `packages/shared` + `packages/backend-core` · Infra Postgres 16 + Redis 7 + MinIO (Docker Compose).

Bản sửa đổi này đối chiếu lại toàn bộ các quyết định nghiệp vụ với Tài liệu 02 (SRS), 03 (UC/RBAC), 04 (ERD), 05 (Kiến trúc/API), 06 (UX), 07 (Kế hoạch kiểm thử), sau ba vòng review.

## Tóm tắt thay đổi so với rev. 3

| # | Vấn đề (rev. 3) | Sửa ở rev. 4 | Bằng chứng |
|---|---|---|---|
| 1 | Baseline cập nhật mâu thuẫn ("sau M10" vs "trước M1") | Chốt: **đóng băng baseline trước M1** — cập nhật Doc02/04/05/07 và đánh dấu "baseline v1.x locked" ở cuối M0. Khi đóng băng, ký tên và ghi ngày. | review |
| 2 | M9 ghi "no new table" | M9 tạo `notifications`, `notification_jobs`, `outbox_events` (optional) | review |
| 3 | M6 phụ thuộc M7 (Issue/RETURN kiểm tra Q-06 approval) | Đổi: **M6 = Cost + Approval**; **M7 = Inventory**. Q-06 check chỉ áp dụng khi đã có approval. M6 hoàn thành trước khi M7 bắt đầu. | review |
| 4 | Docker Compose trùng dịch vụ (Compose + pnpm dev) | Chia Compose: `docker-compose.infra.yml` (hạ tầng) + `docker-compose.demo.yml` (full stack); `pnpm infra:up` chỉ bật hạ tầng; `pnpm demo:up` chạy toàn bộ; `pnpm dev` chỉ chạy apps trên hạ tầng đã có | review |
| 5 | Q-02 OVERDUE chưa đúng | Bổ sung: occurrence OVERDUE khi plan ACTIVE vẫn phải được xử lý — khi scheduler phục hồi, occurrence OVERDUE sinh WO (không phải SKIPPED); SKIPPED chỉ khi plan PAUSED | review |
| 6 | Pause SLA bằng IN_PROGRESS thông thường | Cần PAUSE/RESUME event riêng trong `work_order_status_history`: thêm cột `event_type: ASSIGNED\|STARTED\|PAUSED\|RESUMED\|WAITING_APPROVAL_ENTER\|WAITING_APPROVAL_EXIT\|COMPLETED\|CANCELLED`; `paused_at`, `resumed_at`, `pause_reason` lưu ở row PAUSED/RESUMED. Công thức: `active_elapsed = total_elapsed − waiting_approval_seconds − authorized_pause_seconds` | review |
| 7 | Worker dùng chung mã nghiệp vụ | Tạo `packages/backend-core`: chứa Prisma client, domain logic (state machine, policy), không chứa HTTP/controller. `apps/worker` và `apps/api` cùng import `backend-core`. Không có circular dependency api→worker. | review |
| 8 | Schema: throttle → thresholds | Đổi `throttle` → `thresholds` (thống nhất với Doc04) | review |
| 9 | Schema: work_order_attachments → attachment_links | Bỏ `work_order_attachments`; dùng `attachment_links` cho mọi đối tượng (sau M3) | review |
| 10 | Incident state machine có REOPENED không tồn tại | Bỏ node REOPENED; chuyển trực tiếp RESOLVED về IN_PROGRESS (reopen incident) | Doc04 enum (không có REOPENED) |
| 11 | SLA công thức chưa chuẩn | Dùng: `active_elapsed = total_elapsed − waiting_approval_seconds − authorized_pause_seconds`; `is_overdue = active_elapsed > sla_seconds` | review |
| 12 | Single-tenant: ORG_ID=1 + UUID PK | Dùng UUID v4 làm PK; `org_unit` lưu UUID cố định (seed); không mặc định `ORG_ID=1`. | review |
| 13 | AI gửi chỉ incidentId/workOrderId | Ghi rõ: gửi **ngữ cảnh nghiệp vụ tối thiểu đã làm sạch** (mô tả sự cố, loại thiết bị, triệu chứng, danh mục hợp lệ); không gửi PII hoặc dữ liệu không liên quan | review |
| 14 | Upload chỉ kiểm MIME/extension | Bổ sung **magic bytes/file signature check** trước khi lưu object | review |
| 15 | FR-APR: đang ghi 01..06, Doc02 có 01..09 | Đổi thành **FR-APR-01..09**; TC-APR-01..07 (Doc07 chỉ có 7 ca) | Doc02 lines 751–815 |
| 16 | Stack version wording | Node 22 LTS → **"baseline locked, Node.js 22.x (Active LTS)"**; NestJS 10 → **"baseline locked, NestJS 10.x"**; Prisma 5 → **"baseline locked, Prisma 5.x"** | review |

## 0. M0 — Đóng băng baseline (trước W1, 28/09/2026)

**Mục tiêu**: đồng bộ tài liệu nguồn, ký xác nhận, không sửa nội dung nghiệp vụ chính thức sau bước này.

### 0.1. Cập nhật tài liệu

| Tài liệu | Thay đổi cần thực hiện |
|---|---|
| **Doc02 v1.5** | Bổ sung FR-APR-07..09 (quy tắc từ BR-12 + chuỗi test); ghi chú "WAITING_PARTS không dùng trong hệ thống"; bổ sung thông tin "AI gửi ngữ cảnh nghiệp vụ tối thiểu đã làm sạch" |
| **Doc04 v1.3** | Cập nhật Q-01..Q-07 thành "đã chốt"; thêm bảng `role_permissions`; bổ sung `part_balances.UNIQUE(spare_part_id)`; `stock_transactions.operation_key UNIQUE`; `work_order_status_history.event_type`; bỏ REOPENED khỏi incident enum; đổi `throttle` → `thresholds` |
| **Doc05 v1.3** | Bổ sung diagram `apps/worker`; ghi chú `packages/backend-core` là shared logic; bổ sung magic bytes check cho upload |
| **Doc07 v1.2** | Chuyển test phụ thuộc Q từ Blocked/Deferred → Planned/Ready; thêm TC-DATA-01..05 đầy đủ; bổ sung version log + ngày đóng băng |

### 0.2. Đánh dấu đóng băng

Thêm vào header mỗi tài liệu (Doc02..07):
```
Baseline Status : LOCKED v1.x
Locked Date     : YYYY-MM-DD
Locked By      : [Tên sinh viên]
```

Sau khi đóng băng, mọi thay đổi tài liệu phải qua form change request riêng.

## 1. Phạm vi MVP (P1)

Một **đơn vị** (single-tenant, RBAC data-scope isolation). 4 vai trò: Admin, Manager, Technician, Reporter. 5 module nghiệp vụ (Asset, Incident, Work Order, Maintenance Plan, Spare Parts) + Cost & Approval + Notification + Dashboard + AI hỗ trợ.

**Trong phạm vi P1:**
- Auth (login/logout/refresh/change-password/admin-reset), audit.
- IAM (user, role, permission, scope, gán vai trò theo scope, deactivate).
- Tổ chức & danh mục (single tenant): `org_unit` 1 bản ghi (UUID seed cố định), `departments` cây, `locations` cây, `asset_types`, thresholds cấu hình (FR-ORG-01..03, FR-CFG-01..02).
- Asset CRUD + `lifecycle_status` + tài liệu kỹ thuật + attachment (STAGED→READY).
- Incident lifecycle + chuyển trạng thái + AI suggest category/priority.
- Work Order lifecycle + assign + issue/return/adjust parts + cost + approval + complete/cancel.
- Maintenance Plan + recurrence + scheduler.
- Spare parts + ledger + issue/return/adjust + cảnh báo tồn thấp.
- Cost & Approval (DRAFT/PENDING/AWAITING_INFO/APPROVED/REJECTED/CANCELLED, FR-APR-01..09).
- Notification list + realtime WS + retry-safe job (đủ 6 nhóm FR-NOT-01..06).
- Dashboard KPI + CSV report (FR-REP-01..05).
- AI provider abstraction (mock + OpenAI optional) — 100% async, 202 + requestId.
- Audit log viewer (bất biến).
- Data integrity tests (TC-DATA-01..05).

**Ngoài phạm vi P1 (deferred):**
- Multi-tenant, SSO/AD, phê duyệt nhiều tầng, nhiều kho, serial/lot kho, định giá kế toán, AI tự hành động, mobile app native, email thật, cloud storage production, circuit breaker nâng cao, materialized view.

## 2. Stack & phiên bản đã khóa (pin trong `pnpm-lock.yaml`)

| Thành phần | Phiên bản baseline | Ghi chú |
|---|---|---|
| Node.js | **22.x** (Active LTS, 2024-10 → 2027-04) | Không dùng Node 20 (đã EOL 2026-04) |
| pnpm | 9.x (9.12+) | Workspaces, lockfile chặt |
| NestJS | **10.x** (baseline locked) | Tương thích Prisma 5/6, BullMQ, Passport, Swagger |
| Prisma | **5.x** (baseline locked) | Migration version đáng tin cậy, generated types |
| PostgreSQL | 16 | JSONB, partial unique index, generated columns |
| Redis | 7 | BullMQ |
| Next.js | **14.x** (baseline locked, App Router) | Stable, RSC, route handlers |
| React | **18.x** (baseline locked) | Tương thích Next 14 |
| TypeScript | 5.4+ strict | Bắt buộc |
| MinIO | `RELEASE.2024-09-13T03-26-17Z` | S3-compatible, local dev |
| Test backend | Jest 29 + Supertest + Testcontainers | Unit + integration + e2e DB thật |
| Test frontend | Vitest 1.x + Testing Library + Playwright | Unit + E2E critical path |

> **Quy tắc pin**: tất cả phiên bản chính xác nằm trong `pnpm-lock.yaml`. Không bump major sau khi đóng băng baseline.

## 3. Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                      NestJS backend (HTTP + Swagger)
│  │  ├─ src/
│  │  │  ├─ modules/           auth, iam, org-unit, asset, incident, work-order,
│  │  │  │                   maintenance, inventory, cost, approval,
│  │  │  │                   notification, dashboard, ai, attachment, audit, report, health
│  │  │  ├─ common/           AppError, filters, pipes, decorators, guards
│  │  │  ├─ infra/            storage, mail (log-only), realtime (WS gateway)
│  │  │  └─ main.ts
│  │  ├─ prisma/schema.prisma, migrations/, seed.ts
│  │  ├─ test/
│  │  └─ package.json
│  ├─ web/                     Next.js frontend
│  │  ├─ src/app/
│  │  ├─ src/features/
│  │  ├─ src/lib/
│  │  └─ package.json
│  └─ worker/                  BullMQ worker — chạy RIÊNG với api
│     ├─ src/
│     │  └─ processors/        ai.processor.ts, notification.processor.ts,
│     │                         scheduler.processor.ts, outbox.processor.ts
│     └─ package.json
├─ packages/
│  ├─ shared/                  types, enums, RBAC policy, OpenAPI client
│  └─ backend-core/            PrismaService, domain (state machine, policy, RBAC),
│                                NOT contains HTTP controllers; imported by both api & worker
├─ infra/
│  ├─ docker-compose.infra.yml  postgres, redis, minio (chỉ hạ tầng)
│  ├─ docker-compose.demo.yml   api, web, worker + infra (full stack)
│  └─ minio/                   init bucket script
├─ scripts/
│  ├─ reset-db.sh / .ps1
│  ├─ demo-flow.sh / .ps1
│  └─ freeze-baseline.sh        M0: đánh dấu baseline đã khóa
├─ .env.example
├─ .nvmrc
├─ .editorconfig
├─ .eslintrc.cjs
├─ .prettierrc
├─ tsconfig.base.json
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
- `domain/policy/` — RBAC policy, scope check, self-approval check
- `domain/sla.ts`
- `domain/inventory.ts` — issue/return/check Q-06 logic
- KHÔNG chứa HTTP decorators, controllers, guards

`apps/worker` và `apps/api` cùng import `backend-core`. Không có circular dependency `api → worker`.

## 4. Bảng truy vết yêu cầu (đã đối chiếu Doc02/Doc07 sau khi đóng băng)

### 4.1. Tổng hợp

| Module | FR/NFR (Doc02) | API (Doc05) | DB (Doc04) | UI (Doc06) | Test (Doc07) |
|---|---|---|---|---|---|
| Auth | FR-AUTH-01..07 | `/auth/login`, `/auth/logout`, `/auth/refresh`, `/auth/change-password`, `/admin/users/{id}/reset-password` | users, sessions, login_attempts | SCR-AUTH-01..05 | TC-AUTH-01..05 |
| IAM (RBAC) | FR-AUTH-03/05; AC-01/14 | `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes` | users, roles, permissions, role_permissions, user_roles, user_role_scopes | SCR-IAM-01..06 | TC-RBAC-01..06 |
| Tổ chức & danh mục | FR-ORG-01..03; FR-CFG-01..02 | `/departments`, `/locations`, `/asset-types`, `/config` | org_unit, departments, locations, asset_types, thresholds | SCR-ORG-01..03 | TC-ORG-01..04 |
| Asset | FR-ASSET-01..09; AC-02 | `/assets`, `/assets/{id}`, `/assets/{id}/lifecycle`, `/assets/{id}/qr`, `/technical-documents` | assets, asset_status_history, technical_documents, document_versions, document_roles | SCR-ASSET-01..05 | TC-ASSET-01..05 |
| Incident | FR-INC-01..09; AC-03 | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/messages` | incidents, incident_messages, incident_history | SCR-INC-01..06 | TC-INC-01..06 |
| Work Order | FR-WO-01..09; AC-04/13 | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | work_orders, work_order_tasks, work_order_status_history | SCR-WO-01..07 | TC-WO-01..08 |
| Maintenance | FR-MNT-01..09; AC-05 | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | maintenance_plans, plan_occurrences, plan_generation_log | SCR-MNT-01..04 | TC-MNT-01..05 |
| Inventory | FR-PART-01..08; AC-06 | `/spare-parts`, `/spare-parts/{id}/adjust`, `/stock-transactions`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/low-stock-alerts` | spare_parts, part_balances, stock_transactions | SCR-PART-01..03 | TC-PART-01..07 |
| Cost | FR-COST-01..04; AC-08 | `/work-orders/{id}/cost-entries` | cost_entries | SCR-COST-01..03 | TC-COST-01..04 |
| Approval | **FR-APR-01..09**; AC-07/14 | `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel` | approval_requests, approval_items, approval_history, approval_revisions | SCR-APR-01..04 | TC-APR-01..07 |
| Notification | FR-NOT-01..06; AC-09 | `/notifications`, `/notifications/{id}/read`, `WS /ws` | notifications, notification_jobs, outbox_events | SCR-NOT-01..03 | TC-NOT-01..06 |
| Dashboard/Report | FR-REP-01..05; AC-11 | `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | view v_kpi_* | SCR-DASH-01..02 | TC-REP-01..04 |
| AI | FR-AI-01..06; NFR-AI-01..05; AC-10 | `POST /ai/suggest/*` (202 + requestId), `GET /ai/requests/{id}` | ai_requests, ai_suggestions, ai_jobs | SCR-AI-01..02 | TC-AI-01..06 |
| Attachment | FR-DOC-01..04 | `POST /files`, `GET /files/{fileId}/download` | files (STAGED/READY/EXPIRED), attachment_links | n/a | TC-DOC-01..05 |
| Audit | FR-AUD-01..03; AC-12 | `/audit-logs` | audit_logs | SCR-AUD-01 | TC-AUD-01..04 |
| Config | FR-CFG-01..02; AC-12 | `/config`, `/config/{key}` | thresholds, config | SCR-CFG-01..02 | TC-CFG-01..03 |
| Bảo mật & toàn vẹn | NFR-SEC-01..06; DR-* | (across modules) | (across modules) | n/a | TC-SEC-01..08; TC-DATA-01..05 |
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
| **FR-APR-01..09**; AC-07/14 | TC-APR-01..07 |
| FR-NOT-*; AC-09 | TC-NOT-01..06 |
| FR-DOC-* | TC-DOC-01..05 |
| FR-REP-*; AC-11 | TC-REP-01..04 |
| FR-AI-*; AC-10 | TC-AI-01..06 |
| FR-AUD-*; AC-12 | TC-AUD-01..04 |
| NFR-SEC-01..06 | TC-SEC-01..08 |
| DR-* | TC-DATA-01..05 |
| NFR-PERF-* | TC-PERF-01..04 |
| NFR-USAB-*; UI-AC-* | TC-UX-01..08 |
| NFR-MNT-03; ops | TC-OPS-01..03 |

## 5. Q-items — quyết định đã chốt (baseline M0)

| ID | Nội dung | Baseline áp dụng |
|---|---|---|
| Q-01 | Hệ quả hủy WO | WO REPAIR hủy: Incident → `NEW` hoặc `AWAITING_INFO` (tùy lý do); nếu không còn WO mở → về `NEW`. WO MAINTENANCE hủy: `due_on > now` → `SCHEDULED`; `due_on <= now` → `DUE` + cho tạo WO thay thế. Approval `PENDING/AWAITING_INFO` → `CANCELLED`. Lưu `replaced_by_work_order_id`. Không xóa stock_transactions / cost_entries. |
| Q-02 | Recurrence + SKIPPED/OVERDUE | FIXED. Plan `PAUSED` → kỳ quá hạn → `SKIPPED`, reason `PLAN_PAUSED`. Plan `ACTIVE` → kỳ quá hạn → `OVERDUE`; khi scheduler phục hồi, occurrence `OVERDUE` vẫn sinh WO (không phải SKIPPED). Resume → KHÔNG sinh bù. `UNIQUE(plan_id, due_on)`. Per-occurrence WO partial unique. |
| Q-03 | Mô hình kho + RETURN | Một vị trí, một `on_hand` mỗi part. `part_balances.UNIQUE(spare_part_id)`. `stock_transactions.operation_key UNIQUE`. `original_stock_tx_id` cho RETURN. RETURN kiểm tra qty remaining trên ISSUE gốc. ISSUE/RETURN qua WO route; ADJUST route riêng. CREDIT theo unit_price snapshot. Atomic. |
| Q-04 | SLA | `event_type` trong `work_order_status_history`: `ASSIGNED|STARTED|PAUSED|RESUMED|WAITING_APPROVAL_ENTER|WAITING_APPROVAL_EXIT|COMPLETED|CANCELLED`. Row PAUSED/RESUMED lưu `paused_at`, `resumed_at`, `pause_reason`. `active_elapsed = total_elapsed − waiting_approval_seconds − authorized_pause_seconds`. `is_overdue = active_elapsed > sla_seconds`. |
| Q-05 | Department snapshot | `work_orders.department_id_snapshot` — copy tại lúc tạo WO. |
| Q-06 | Vượt phương án duyệt | Check `net_issued_quantity` và `net_cost` so với approval APPROVED. Vượt → từ chối + gợi ý `approval_revisions`. Chỉ tiếp tục sau khi APPROVED mới. |
| Q-07 | LOCATION scope cha-con | `user_role_scopes` — cha bao gồm con. |

## 6. Trạng thái tham chiếu

- **Incident**: `NEW | ASSIGNED | AWAITING_INFO | IN_PROGRESS | RESOLVED | CLOSED | CANCELLED` (Doc04, không REOPENED)
- **Work Order**: `NEW | ASSIGNED | IN_PROGRESS | WAITING_APPROVAL | COMPLETED | CANCELLED` (Doc04, không PAUSED/WAITING_PARTS)
- **Approval**: `DRAFT | PENDING | AWAITING_INFO | APPROVED | REJECTED | CANCELLED`
- **Asset.lifecycle_status** (lưu cột): `ACTIVE | PAUSED | RETIRED`
- **Asset.activity_status** (dẫn xuất): `NORMAL | UNDER_REPAIR | UNDER_MAINTENANCE`
- **Plan**: `ACTIVE | PAUSED | ARCHIVED`
- **Occurrence**: `SCHEDULED | DUE | OVERDUE | SKIPPED | COMPLETED | CANCELLED`

## 7. State machine

### 7.1. Incident (không REOPENED)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need info──> AWAITING_INFO ──resend──> IN_PROGRESS
 │                  │                    │
 │                  │                    ├──> RESOLVED ──close──> CLOSED
 │                  │                    ├──> CANCELLED (Manager)
 │                  └──> CANCELLED (Manager)
 └──> CANCELLED (Manager)
```

### 7.2. Work Order

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need approval──> WAITING_APPROVAL
   │                  │                  │                            │
   │                  │                  ├──> COMPLETED              ├──approve──> IN_PROGRESS
   │                  │                  ├──> CANCELLED (Manager)    ├──reject──> IN_PROGRESS
   │                  │                  └──(loop)                   └──cancel──> CANCELLED
   │                  └──> CANCELLED
   └──> CANCELLED
```

"Paused" nghiệp vụ (chờ linh kiện): giữ `IN_PROGRESS` + ghi `pause_reason` ở `work_order_status_history` row type `PAUSED` + approval request pending.

### 7.3. Approval

```
DRAFT ──submit──> PENDING ──approve──> APPROVED
                   │            │
                   ├──> AWAITING_INFO ──resubmit──> PENDING
                   ├──> REJECTED (Manager, người duyệt ≠ người tạo — FR-APR-09)
                   └──> CANCELLED
```

## 8. SLA (Q-04)

**work_order_status_history** schema:

| event_type | sla_started_at | paused_at | resumed_at | pause_reason |
|---|---|---|---|---|
| ASSIGNED | ✓ (sla_started_at) | null | null | null |
| STARTED | null | null | null | null |
| PAUSED | null | ✓ | null | ✓ |
| RESUMED | null | null | ✓ | null |
| WAITING_APPROVAL_ENTER | null | null | null | null |
| WAITING_APPROVAL_EXIT | null | null | null | null |
| COMPLETED | null | null | null | null |
| CANCELLED | null | null | null | null |

**Công thức:**

```
total_elapsed_seconds   = min(now, completed_at, cancelled_at) − sla_started_at
authorized_pause_seconds = Σ(resumed_at − paused_at)  [từ các row PAUSED→RESUMED]
waiting_approval_seconds = Σ(WAITING_APPROVAL_EXIT.at − WAITING_APPROVAL_ENTER.at)
active_elapsed_seconds   = total_elapsed_seconds − waiting_approval_seconds − authorized_pause_seconds
is_overdue              = active_elapsed_seconds > sla_seconds  AND  status NOT IN (COMPLETED, CANCELLED)
```

WAITING_APPROVAL không tính vào SLA; hiển thị thành chỉ số riêng `waiting_approval_seconds`.

## 9. RBAC chain — gắn trên `userRoleId` (Doc05 §10.4)

```
Request → Authenticated
       → resolve active user_roles (valid_from <= now < valid_to AND status='ACTIVE')
       → chọn 1 userRoleId thỏa đồng thời:
            (a) user_roles → roles → role_permissions → permissions: có permission.action = required
            (b) user_role_scopes(UserRoleId): scope chứa target
       → 200 OK
       → Nếu 0 userRoleId thỏa → 403 (KHÔNG ghép quyền A với scope B)
```

## 10. Attachment STAGED → READY

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
           size check (≤ 25 MB)
                        │ fail → 400
                        ▼ pass
           trả { fileId, expiresAt }
```

- **Magic bytes** (file signature): kiểm tra header bytes thực tế của file, không chỉ extension/MIME. Ví dụ: PNG → `89 50 4E 47`, PDF → `25 50 44 46`, JPEG → `FF D8 FF`, XLSX → `50 4B 03 04`.
- MIME allowlist + extension blocklist + size check → xong.
- Link vào nghiệp vụ: kiểm tra ownership/scope → transaction: INSERT attachment_links + UPDATE files → READY.
- Download: check READY + quyền trên TẤT CẢ attachment_links.parent.
- Cron: dọn STAGED hết hạn (EXPIRED).

## 11. AI — 100% async

```
POST /ai/suggest/category  body { incidentId, incidentDescription, assetType, symptoms, validCategories[] }
  → 202 { requestId }
POST /ai/suggest/priority  body { incidentId, incidentDescription, assetType, symptoms, validPriorities[] }
  → 202 { requestId }
POST /ai/suggest/solution  body { workOrderId, assetType, problem, history }
  → 202 { requestId }
POST /ai/propose-plan      body { incidentId, assetId }

GET /ai/requests/{id} → { status: QUEUED|RUNNING|SUCCEEDED|FAILED, suggestions[], error? }
```

- Worker gọi provider ngoài HTTP; không giữ transaction ngầm.
- **Gửi ngữ cảnh nghiệp vụ tối thiểu đã làm sạch**: mô tả sự cố, loại thiết bị, triệu chứng, danh mục hợp lệ. Không gửi PII, mô tả dài không cần thiết.
- Timeout: **30–60s** (`AI_REQUEST_TIMEOUT_MS=45000`).
- Retry: 2 lần exponential backoff.
- Circuit breaker nâng cao → optional deferred.
- Failure → suggestion rỗng + FAILED; workflow tiếp tục thủ công.

## 12. Milestone plan (M0 + 14 tuần)

> M0 = đóng băng baseline (trước W1).
> W1–W12: triển khai. Feature freeze 20/12/2026.
> W13–W14: tích hợp, sửa lỗi, báo cáo, diễn tập.

### 12.1. Đổi thứ tự M6/M7

M6 (Inventory) phụ thuộc M7 (Cost/Approval) vì Issue/RETURN kiểm tra Q-06 (net_issued_quantity, net_cost). Đổi:

- **M6 = Cost + Approval** (W9)
- **M7 = Inventory** (W10)

### 12.2. Bảng milestone

| # | Tên | Tuần | Migration (Prisma) | Backend | API | UI | Test | Tiêu chí hoàn thành |
|---|---|---|---|---|---|---|---|---|
| **M0** | Đóng băng baseline | Trước W1 | (n/a) | — | — | — | — | Doc02..07 cập nhật Q; đánh dấu LOCKED v1.x; ký tên |
| **M1** | Foundation + Auth + IAM + Org | W1–W2 | `0001_init`: org_unit (UUID seed), departments, locations, users, roles, permissions, role_permissions, user_roles, user_role_scopes, sessions, login_attempts, audit_logs, thresholds | common, infra (prisma/backend-core), auth, iam, org-unit, health | `/healthz`, `/auth/*`, `/admin/*`, `/departments`, `/locations`, `/config` | login, user/role/scope mgmt, dept tree | TC-AUTH-01..05, TC-RBAC-01..06, TC-ORG-01..04, TC-CFG-01..03, TC-SEC-01..04 | Lint/typecheck/test pass; login 4 vai trò; Admin gán role+scope; audit ghi |
| **M2** | Asset + QR + lifecycle | W3 | `0002_asset`: assets, asset_status_history, asset_types, thresholds | asset | `/asset-types`, `/assets`, `/assets/{id}/lifecycle`, `/assets/{id}/qr` | asset list/detail, qr | TC-ASSET-01..05 | lifecycle_status transitions; RETIRED chặn WO; activity_status dẫn xuất đúng |
| **M3** | Attachment STAGED→READY + technical documents | W4 | `0003_attachments`: files (STAGED/READY/EXPIRED), attachment_links (CK một parent), technical_documents, document_versions, document_roles | attachment, audit | `POST /files`, `GET /files/{fileId}/download`, `/technical-documents` | attachment modal | TC-DOC-01..05, TC-AUD-01..04 | Magic bytes + MIME + size check; STAGED→READY in tx; cron dọn; audit viewer |
| **M4** | Incident + AI async (worker) | W5–W6 | `0004_incidents_ai`: incidents, incident_messages, incident_history, ai_requests, ai_suggestions, ai_jobs | incident, ai (provider interface + mock + worker), backend-core domain | `/incidents`, `/incidents/{id}/transition`, `/incidents/{id}/messages`, `/ai/suggest/category`, `/ai/suggest/priority`, `/ai/requests/{id}` | incident list/detail/reporter, AI suggest | TC-INC-01..06, TC-AI-01..06 | State machine đúng enum Doc04; AI 202 + requestId; GET /ai/requests/{id}; fallback |
| **M5** | Work Order | W7–W8 | `0005_work_orders`: work_orders (department_id_snapshot, replaced_by_work_order_id), work_order_tasks, work_order_status_history (event_type + pause fields) | work-order, backend-core domain | `/work-orders`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel` | WO list/detail/assign/complete/cancel | TC-WO-01..08 | Partial unique per incident; Incident → RESOLVED (not CLOSED); Cancel side effects Q-01; SLA event_type works |
| **M6** | Cost + Approval | W9 | `0006_cost_approval`: cost_entries, approval_requests, approval_items, approval_history, approval_revisions | cost, approval, backend-core domain (Q-06) | `/work-orders/{id}/cost-entries`, `/approvals`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel`, `/approvals/{id}/revisions` | cost form, approval inbox | TC-COST-01..04, TC-APR-01..07 | Self-approval BR-12 (FR-APR-09); Q-06 net issued + net cost check; revision chain |
| **M7** | Spare Parts + Issue/Return/Adjust | W10 | `0007_inventory`: spare_parts, part_balances (UNIQUE spare_part_id), stock_transactions (operation_key UNIQUE, original_stock_tx_id), low_stock_alerts | inventory, backend-core domain (issue/return Q-06) | `/spare-parts`, `/spare-parts/{id}/adjust`, `/work-orders/{id}/parts/issue`, `/work-orders/{id}/parts/return`, `/low-stock-alerts` | parts list, issue modal, low-stock | TC-PART-01..07 | Concurrency 50 req đồng thời → on_hand >= 0; RETURN không vượt ISSUE gốc; Q-06 check; low-stock alert |
| **M8** | Maintenance Plan + Scheduler | W11 | `0008_maintenance`: maintenance_plans, plan_occurrences, plan_generation_log | maintenance, scheduler processor (worker) | `/maintenance-plans`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume` | plan list/calendar | TC-MNT-01..05 | FIXED recurrence; PAUSED→SKIPPED (PLAN_PAUSED); ACTIVE→OVERDUE (sinh WO khi phục hồi); UNIQUE(plan_id,due_on); resume không sinh bù |
| **M9** | Notification + Realtime + Dashboard + Report | W12 | `0009_notif_dashboard`: notifications, notification_jobs, outbox_events (optional), v_kpi_* | notification (controller + worker processor), dashboard, report | `/notifications`, `/notifications/{id}/read`, `WS /ws`, `/dashboard/kpis`, `/dashboard/overdue`, `/reports/{type}.csv` | notif list + realtime toast, dashboard, report | TC-NOT-01..06, TC-REP-01..04, TC-DATA-01..05 | 6 nhóm FR-NOT đúng; WS JWT; KPI đúng scope; CSV có permission; overdue = active_elapsed > sla; 5 ca data integrity |
| **M10** | Tích hợp + hardening + E2E + docs | W13–W14 | (n/a) | cross-cutting | — | UX polish | TC-UX-01..08, TC-OPS-01..03, TC-PERF-01..04 | Toàn bộ test pass; prod build; demo flow; README; 0 TODO/mock ngoài stub; feature freeze; diễn tập |

## 13. Docker Compose — tách infra và demo

### docker-compose.infra.yml (hạ tầng, dùng với pnpm dev)

```yaml
services:
  postgres:  { image: postgres:16, port: 5432, env/credentials }
  redis:     { image: redis:7-alpine, port: 6379 }
  minio:     { image: minio/minio:RELEASE.2024-09-13T03-26-17Z, ports: [9000,9001] }
```

### docker-compose.demo.yml (full stack, dùng với pnpm demo:up)

```yaml
services:
  postgres:  { extends: infra }
  redis:     { extends: infra }
  minio:     { extends: infra }
  api:       { build: apps/api, ports: [3001], depends_on: [postgres,redis,minio] }
  web:       { build: apps/web, ports: [3000], depends_on: [api] }
  worker:    { build: apps/worker, depends_on: [postgres,redis,ai] }
```

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

```
Reporter (reporter.sx01)      → Tạo Incident
Manager (manager.sx)          → Tiếp nhận; tạo WO; phân công KTV
Technician (ktv.sx01)        → IN_PROGRESS; issue parts; tạo approval PENDING
Manager (manager.sx)         → Approve → WO về IN_PROGRESS
Technician (ktv.sx01)        → Resolve; complete WO → Incident RESOLVED
Manager (manager.sx)          → Close Incident → CLOSED
Reporter / Manager            → Dashboard; xuất CSV; báo cáo
```

## 16. Rủi ro còn lại

| # | Mục | Giảm thiểu |
|---|---|---|
| R-01 | OpenAI timeout | Mock mặc định; OpenAI optional + smoke test; timeout 30–60s |
| R-02 | Realtime qua proxy | Fallback polling 10s |
| R-03 | Worker dùng chung logic | `packages/backend-core` là shared layer; worker + api cùng import |
| R-04 | Deadline 14 tuần | Phasing §12; defer circuit breaker/materialized view/SMTP nếu thiếu ~1 tuần |
| R-05 | PowerShell vs bash | Cung cấp cả `.sh` và `.ps1`; PS dùng `Copy-Item`, `Remove-Item` |
| R-06 | DB UUID seed | Dùng `crypto.randomUUID()` hoặc giá trị seed cố định cho `org_unit.id` trong migration initial |