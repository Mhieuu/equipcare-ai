# EquipCare AI — Implementation Plan

> AI-Powered Equipment Maintenance Management System — P1 MVP
> Monorepo: `apps/api` (NestJS + Prisma + Postgres), `apps/web` (Next.js 14 + TS + Tailwind + shadcn/ui), `packages/shared` (types, enums, RBAC policy, OpenAPI client)
> Local infra: Postgres 16 + Redis 7 + MinIO (S3) via Docker Compose

## 1. Tóm tắt kiến trúc

- **Modular monolith** trên NestJS, chia module theo bounded context: `auth`, `org`, `iam` (user/role/permission), `asset`, `location`, `incident`, `work-order`, `maintenance`, `inventory`, `cost`, `approval`, `notification`, `dashboard`, `ai`, `attachment`, `audit`, `health`.
- **Domain layer** riêng (entity/value-object/policy/state-machine) — controller chỉ làm HTTP boundary, service chỉ điều phối use case.
- **Prisma schema** phản ánh đúng 33 bảng trong Doc04 (đã chốt Q-items), `organization_id` ở mọi bảng nghiệp vụ, FK + check + unique + index đầy đủ.
- **Type-safe end-to-end**: Prisma → Zod schema → Nest DTO → OpenAPI (zod-to-openapi) → generated TS client cho Next.js.
- **RBAC chain** 4 bước theo Doc05: (1) Authenticated, (2) Organization scope, (3) Permission, (4) Data scope (location/department). Áp dụng trong `PolicyGuard` + `ScopeGuard` ở backend.
- **State machine** cho Incident, WorkOrder, Approval, Asset, MaintenancePlan — dùng XState-style hoặc pure policy class có test riêng (BR-01..BR-24).
- **Optimistic locking** bằng cột `version` + check `WHERE version = ?` trên update; **pessimistic lock** cho issue/return inventory và approval transition.
- **Idempotency**: middleware `Idempotency-Key` cho mọi mutation có nguy cơ lặp (issue parts, generate PM occurrences, complete WO).
- **Realtime/Job**: Redis + BullMQ cho PM scheduler, notification, AI suggestion re-validate. WebSocket qua Socket.IO với JWT handshake.
- **AI**: `AiProvider` interface, hai implementation: `OpenAiResponsesProvider` (env-config) và `MockDeterministicProvider` (để demo khi không có key). Structured Outputs (zod) + server-side validate + allowlist từ DB. Timeout, retry với backoff, circuit breaker. Mọi đề xuất → người dùng xác nhận → mới áp dụng.

## 2. Phạm vi MVP (P1) — cốt lõi

| Module | P1 chức năng |
|---|---|
| Auth | Email/password + session table, refresh, logout, lockout, password policy, audit |
| Org | Tạo/quản lý organization, branding tối thiểu |
| IAM | User CRUD, Role CRUD, Permission CRUD, gán role theo scope, deactivate |
| Location | Cây vị trí cha-con, scope cha bao gồm con (Q-07 đã chốt) |
| Asset | Asset CRUD, status, location, attachments, QR token |
| Incident | Tạo sự cố (kể cả QR mobile), AI suggestion category/priority, chuyển trạng thái |
| Work Order | Tạo WO từ incident hoặc PM, assign, issue/return parts, đề xuất cost, complete |
| Maintenance Plan | CRUD plan, recurrence (FIXED), occurrence generation idempotent |
| Inventory | Spare part CRUD, stock_tx ledger, issue/return, adjustment có lý do (Q-03) |
| Cost & Approval | Cost entry, approval request, separation of duties, không vượt approved (Q-06) |
| Notification | Web + realtime + email stub, retry safe |
| Dashboard | KPI, overdue, top assets, AI suggestion stats |
| AI | Provider abstraction, category/priority/cost/solution suggestion, timeout + fallback |
| Audit | Log mọi mutation nghiệp vụ |
| Attachment | MinIO presigned URL, virus hook optional |
| Report | Export CSV cho danh sách WO/Incident (P1) |

## 3. Bảng truy vết yêu cầu (requirement → module → DB → API → UI → test)

Mã yêu cầu theo Doc02 (FR/DR/NFR), Doc03 (UC), Doc04 (Q), Doc06 (SCR), Doc07 (TC).

| ID | Mô tả | Module | DB (bảng) | API P1 | UI P1 | Test |
|---|---|---|---|---|---|---|
| FR-AUTH-01..03 | Login/logout/refresh, password policy, lockout | auth | users, sessions, login_attempts | POST /auth/login, /auth/refresh, /auth/logout | SCR-AUTH-01..04 | TC-AUTH-01..08 |
| FR-AUTH-04..05 | Forgot/reset password, audit | auth | password_reset_tokens, audit_logs | POST /auth/forgot, /auth/reset | SCR-AUTH-05 | TC-AUTH-09..11 |
| FR-ORG-01..04 | Org CRUD, deactivate | org | organizations | GET/POST/PATCH /organizations | SCR-ORG-01 | TC-ORG-01..03 |
| FR-IAM-01..10 | User/Role/Permission CRUD, scope, deactivate, separation of duties | iam | users, roles, permissions, role_permissions, user_roles, role_scopes | CRUD /users, /roles, /permissions, /scope | SCR-IAM-01..06 | TC-RBAC-01..20 |
| FR-LOC-01..03 | Location tree CRUD, scope cha-bao-con (Q-07) | location | locations | CRUD /locations | SCR-LOC-01 | TC-LOC-01..05 |
| FR-ASSET-01..06 | Asset CRUD, status, location, QR | asset | assets, asset_attachments, asset_documents | CRUD /assets, /assets/{id}/qr | SCR-ASSET-01..05 | TC-ASSET-01..10 |
| FR-INC-01..07 | Incident lifecycle, AI suggest category/priority | incident | incidents, incident_attachments, incident_history | CRUD /incidents, /incidents/{id}/transition | SCR-INC-01..06 | TC-INC-01..12 |
| FR-WO-01..10 | WO lifecycle, assign, complete, hủy WO → Incident về Mới tạo + occurrence SCHEDULED (Q-01) | work-order | work_orders, work_order_tasks, work_order_history | CRUD /work-orders, /work-orders/{id}/transition | SCR-WO-01..07 | TC-WO-01..15 |
| FR-MNT-01..06 | Plan CRUD, recurrence FIXED, occurrence generation idempotent, lỡ → SKIPPED không trôi (Q-02) | maintenance | maintenance_plans, plan_occurrences, plan_generation_log | CRUD /maintenance-plans, /plans/{id}/occurrences | SCR-MNT-01..04 | TC-MNT-01..10 |
| FR-INV-01..07 | Part CRUD, ledger, issue/return, adjustment, concurrent safety | inventory | spare_parts, stock_tx, part_balances | CRUD /parts, /parts/{id}/issue, /parts/{id}/return, /parts/{id}/adjust | SCR-INV-01..05 | TC-INV-01..12 (TC-INV-CONCURRENCY) |
| FR-COST-01..05 | Cost entry, total, approval request | cost | cost_entries, cost_aggregates | CRUD /cost-entries, /work-orders/{id}/costs | SCR-COST-01..03 | TC-COST-01..06 |
| FR-APR-01..07 | Approval lifecycle, separation of duties, không vượt approved (Q-06) | approval | approval_requests, approval_steps, approval_history | CRUD /approvals, /approvals/{id}/decision | SCR-APR-01..04 | TC-APR-01..10 |
| FR-NOTIF-01..05 | Notification list, realtime, retry-safe | notification | notifications, notification_jobs | GET /notifications, WS /ws, POST /notifications/{id}/read | SCR-NOTIF-01..03 | TC-NOTIF-01..06 |
| FR-DASH-01..03 | KPI dashboard | dashboard | (view/materialized optional) | GET /dashboard/kpis, /dashboard/overdue | SCR-DASH-01..02 | TC-DASH-01..04 |
| FR-AI-01..05 | AI suggest category/priority/cost/solution, propose plan, fallback | ai | ai_suggestions, ai_jobs | POST /ai/suggest/category, /ai/suggest/priority, /ai/suggest/solution, /ai/propose-plan | SCR-AI-01..02 | TC-AI-01..08 |
| FR-ATT-01..03 | Attachment presigned URL | attachment | attachments | POST /attachments/presign, /attachments/{id} | n/a (modal) | TC-ATT-01..03 |
| FR-AUDIT-01..02 | Audit log viewer | audit | audit_logs | GET /audit-logs | SCR-AUDIT-01 | TC-AUDIT-01..04 |
| FR-RPT-01..02 | CSV export | report | (read-only) | GET /reports/work-orders.csv, /reports/incidents.csv | SCR-RPT-01 | TC-RPT-01..02 |
| FR-REPORT-REAL-TIME | Socket events | realtime | (events) | WS /ws | embedded | TC-RT-01..03 |
| NFR-SEC-01..07 | Bảo mật: JWT, bcrypt, CORS, helmet, rate limit | cross | — | middleware | — | TC-SEC-01..05 |
| NFR-PERF-01..03 | Phân trang, filter, sort | cross | indexes | query params | — | TC-PERF-01..04 |
| NFR-USAB-01..05 | UI states, accessibility | frontend | — | — | design tokens | TC-UX-01..05 |
| NFR-MNT-01..04 | Migration, seed, log, error | cross | migrations | CLI | — | TC-MNT-01..03 |
| NFR-AI-01..04 | AI safety, allowlist, timeout, fallback | ai | — | middleware | — | TC-AI-FAIL-01..04 |

## 4. State machines (đã chốt với bạn)

### Incident
```
Mới tạo → AI_suggested → Assigned → In_progress → Resolved → Closed
Mới tạo → Cancelled (chỉ Manager/Admin)
In_progress → Waiting_parts (auto khi issue pending)
Resolved → Reopened (chỉ Manager)
Hủy WO → Mới tạo (Q-01)
```

### Work Order
```
Draft → Assigned → In_progress → Waiting_approval → Completed
                → Waiting_parts → In_progress
                → Paused → In_progress (chỉ Manager)
                → Cancelled (chỉ Manager)
Hủy WO → Incident về Mới tạo + occurrence SCHEDULED (Q-01)
```

### Approval
```
Pending → Approved | Rejected | Cancelled
Approved → vượt approved → phải tạo approval mới (Q-06)
```

### Maintenance Plan
```
Active → Paused → Active
Active → Archived
Recurrence: FIXED — kỳ lỡ = SKIPPED, không trôi lịch (Q-02)
```

### Asset
```
Active → Maintenance → Active
Active → Retired (chỉ Admin, soft delete)
```

## 5. Transaction boundary & concurrency

| Nghiệp vụ | Boundary | Rủi ro | Cơ chế |
|---|---|---|---|
| Issue parts | stock_tx insert + part_balances UPDATE + WO cost_entry + audit | Race trừ kho → âm | `SELECT ... FOR UPDATE` trên part_balances + check `on_hand >= qty` trong transaction |
| Return parts | RETURN stock_tx + part_balances UPDATE + CREDIT cost_entry | RETURN vượt issue gốc | Check `SUM(issue) - SUM(return) >= qty_return` trong tx (Q-03) |
| Adjustment | ADJUST stock_tx + UPDATE balance | Cần lý do + role | Role ADMIN/MANAGER, bắt buộc reason |
| Complete WO | Update WO + sum cost + close incident/occurrence + notification + audit | Update trùng → mất cost | Optimistic version + idempotency-key |
| Approval decision | Update approval + cost_entry status + audit | Self-approval | Reject nếu `requester_id == approver_id` |
| PM occurrence generation | Insert nhiều occurrence + audit | Scheduler chạy 2 lần sinh trùng | `UNIQUE(plan_id, scheduled_date)` + scheduler log |
| Incident AI suggestion | Insert ai_suggestion + update incident | Lỗi provider | Timeout 8s, retry 2, circuit breaker, fallback allowlist |
| Login | Update login_attempts + sessions + audit | Brute force | Rate limit + lockout 15p sau 5 lần |

## 6. Mâu thuẫn / thiếu sót / rủi ro (đã xử lý)

| # | Mâu thuẫn/thiếu | Trạng thái | Giải pháp áp dụng |
|---|---|---|---|
| Q-01 | Hủy WO → Incident/Occurrence/Approval | ✅ đã chốt | Incident về Mới tạo; occurrence SCHEDULED chờ sinh lại; approval WAITING → CANCELLED |
| Q-02 | Tính kỳ bảo trì | ✅ đã chốt | FIXED, lỡ → SKIPPED, không trôi |
| Q-03 | Inventory mô hình & RETURN | ✅ đã chốt | 1 kho + RETURN có giới hạn (cùng WO, trước khi complete) |
| Q-04 | SLA khi WAITING_APPROVAL | ✅ đã chốt | Không tính thời gian chờ duyệt; hiển thị riêng |
| Q-05 | Q-05 trong Doc04 đã được resolve bằng Doc03 RBAC | ✅ | Theo Doc03 |
| Q-06 | Vượt phương án duyệt | ✅ đã chốt | Không vượt — issue > approved → từ chối; tạo approval mới |
| Q-07 | LOCATION scope cha-con | ✅ đã chốt | Cha bao gồm cả con |
| UX-D01..06 | Decision UI cần chốt với designer | ⏳ | Áp dụng mặc định hợp lý, ghi TODO nếu thực sự cần |
| Tech risk | OpenAI key trong demo | ✅ đã chốt | Mock + OpenAI key optional qua env |
| Tech risk | Realtime có thể không chạy nếu proxy | ⚠️ | Fallback polling 10s cho notification |
| Tech risk | MinIO local vs S3 prod | ⚠️ | Interface `StorageProvider`; 2 impl |
| Data risk | Seed không đủ | ⚠️ | Seed đầy đủ: 2 org, 8 user (đủ role), 5 location, 12 asset, 20 part, 3 plan, 5 incident, 10 WO |

## 7. Kế hoạch milestone (vertical slice)

Mỗi milestone = DB → backend → API → frontend → test → self-review.

| M# | Tên | Phụ thuộc | Deliverable |
|---|---|---|---|
| **M1** | Foundation & DB | — | Monorepo, Docker Compose, Prisma init + 33 bảng + migration + seed skeleton, ESLint/TS strict, Jest/Vitest config, healthcheck |
| **M2** | Auth & RBAC | M1 | User/Role/Permission, login/refresh/logout, PolicyGuard, ScopeGuard, audit, login_attempts, RBAC matrix test |
| **M3** | Master data + Location + Asset + QR | M2 | Org, Location tree, Asset CRUD, QR endpoint + mobile scan, attachment presign |
| **M4** | Incident | M3 | Incident CRUD + state machine + AI suggest category/priority (mock) + UI |
| **M5** | Work Order | M4 | WO CRUD + state machine + assign + UI |
| **M6** | Maintenance Plan | M5 | Plan CRUD + recurrence + idempotent scheduler (BullMQ) + UI |
| **M7** | Inventory & Spare parts | M5 | Part CRUD + ledger + issue/return/adjust + concurrency test + UI |
| **M8** | Cost & Approval | M5, M7 | Cost entry + Approval state machine + separation of duties + UI |
| **M9** | Notification & Realtime | M2..M8 | Notification list + WS + retry-safe job |
| **M10** | Dashboard & Report | M5, M8 | KPI + overdue + CSV export |
| **M11** | AI modules | M4, M5, M8 | Suggest solution, propose plan; OpenAI + mock; circuit breaker |
| **M12** | Testing, Docker, Deployment | all | Full test suite, prod build, docker-compose prod, README demo script |

**Tiêu chí dừng & xin phê duyệt**: bất kỳ điểm nào ở §6 tôi xử lý khác với quyết định đã chốt, hoặc phát sinh mâu thuẫn mới — tôi dừng và hỏi trước khi code.

## 8. Quy ước code (rút gọn từ Doc05)

- TypeScript strict, không `any`, không `@ts-ignore`. Lint: eslint + @typescript-eslint, prettier.
- Module NestJS: controller (HTTP) → service (use case) → repository (Prisma) → domain (entity/policy).
- DTO riêng (`zCreateIncidentDto`, `IncidentResponse`), không trả Prisma model thẳng ra response.
- Mọi status/role/permission/enum → constant từ `@equipcare/shared/enums`.
- Error: `AppError` extends `Error`, Nest filter map sang RFC 9457 Problem Details có `code`, `requestId`, `traceId`.
- Mỗi module có `*.spec.ts` cho domain policy + `*.e2e-spec.ts` cho API critical.
- Tất cả query phải nhận `organizationId` từ session, không từ client.
