# Doc05 — Kiến trúc hệ thống và đặc tả API

**Baseline Status : LOCKED v1.2** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document05_KienTruc_API_v1_2_Clean_Sync.docx` (phiên bản gốc 1.2, 08/09/2026, đồng bộ Doc04).
> File gốc lưu tại `~/Downloads/DATN/Document05_KienTruc_API_v1_2_Clean_Sync.docx` (ngoài repo).

## Kiến trúc tổng thể

```
┌────────────────────────────────────────────────────────────────────┐
│                          Frontend (Next.js 14)                     │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ REST (JWT + Cookies)
┌──────────────────────────────┴─────────────────────────────────────┐
│                       NestJS API (modular monolith)                │
│  modules: auth · iam · asset · incident · work-order ·              │
│           maintenance · inventory · cost · approval ·              │
│           dashboard · ai · health · scheduler                       │
│  common: filters, pipes, guards, AppError, RBAC chain              │
│  infra: prisma, mail (log-only)                                   │
│  scheduler: tự sinh kỳ bảo trì định kỳ (trong API, không BullMQ)│
│                                                                    │
│  shared: packages/backend-core (PrismaService + domain policy)    │
└──────────────────────────────┬─────────────────────────────────────┘
                               │
                               ▼
                      ┌──────────────────┐
                      │   PostgreSQL 17  │
                      └──────────────────┘
```

### Scheduler trong API, không Worker tách process

- `apps/api/src/modules/scheduler/` chịu trách nhiệm tự sinh kỳ bảo trì định kỳ (gọi hàm `generateOccurrences` định kỳ, ví dụ mỗi giờ).
- Backend-core chứa:
  - `PrismaService` (singleton; **không** HTTP)
  - Domain: `incident.state-machine`, `work-order.state-machine`, `approval.state-machine`
  - Policy: RBAC, scope check, self-approval check
  - SLA, Inventory domain (issue/return Q-06 logic)
- **Không có circular dependency**.

## API conventions

- Base path: `/api/v1` (sau W2 quyết định dùng `/v1` hay giữ Nest global prefix).
- Auth: Bearer access token + refresh rotation HttpOnly cookie.
- Pagination: cursor (ưu tiên), cho phép `page/pageSize` ≤ 100.
- Error: Problem Details `{type, title, status, code, detail, instance, requestId, errors[]}`.
- OpenAPI: sinh từ Nest, dùng để generate `packages/shared` types.

## Endpoints tổng hợp (xem Doc02/Doc06 đầy đủ)

| Module | Endpoints chính |
|---|---|
| Auth | `/auth/{login,logout,refresh,change-password,forgot-password,reset-password}` · `/me` · `/admin/users/{id}/reset-password` |
| IAM | `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/users/{id}/roles/{userRoleId}`, `/admin/users/{id}/roles/{userRoleId}/scopes` |
| Org/CFG | `GET /iam/departments`, `GET /iam/locations`, `GET /iam/asset-types` (read-only); `/thresholds` |
| Asset | `/assets`, `/assets/{id}`, `/assets/{id}/lifecycle`, `/assets/{id}/qr`, `/assets/{id}/qr-label` |
| Incident | `/incidents`, `/incidents/{id}`, `/incidents/{id}/transition`, `/incidents/{id}/messages`, `/incidents/{id}/ai-classify` |
| WO | `/work-orders`, `/work-orders/{id}`, `/work-orders/{id}/assign`, `/work-orders/{id}/transition`, `/work-orders/{id}/pause`, `/work-orders/{id}/resume`, `/work-orders/{id}/complete`, `/work-orders/{id}/cancel`, `/work-orders/{id}/cost-entries`, `/work-orders/{id}/parts/{issue,return}` |
| Maintenance | `/maintenance-plans`, `/maintenance-plans/{id}`, `/maintenance-plans/{id}/occurrences`, `.../pause`, `.../resume`, `/maintenance-occurrences`, `.../{id}/skip`, `.../{id}/generate-now` |
| Inventory | `/spare-parts`, `/spare-parts/{id}/adjust`, `/stock-transactions`, `/low-stock-alerts` |
| Approval | `/approvals`, `/approvals/{id}`, `/approvals/{id}/submit`, `/approvals/{id}/decision`, `/approvals/{id}/cancel`, `/approvals/{id}/revisions` |
| Cost | `/work-orders/{id}/cost-entries`, `/costs/summary`, `/costs/export` |
| Notification | <!-- Module Notification đã bị xóa; chỉ còn notification service ghi vào DB và hàm writeAudit(). Không có REST endpoint cho notification UI --> | <!-- N/A --> |
| AI | `POST /ai/suggest/{category,priority,solution}` · `POST /ai/propose-plan` · `GET /ai/requests/{id}` |
| Attachment | <!-- Module Attachment đã bị cắt hoàn toàn --> | <!-- N/A --> |
| Audit | <!-- Bảng audit_logs và hàm writeAudit() vẫn còn trong DB và code, nhưng endpoint GET /audit-logs đã bị xóa --> | <!-- N/A --> |
| Dashboard | `/dashboard/{kpis,overdue,workload,cost-trend,action-items}`, `/reports/{type}.csv` |

## State machine — Incident (không REOPENED)

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need info──> AWAITING_INFO ──resend──> IN_PROGRESS
 │                  │                    ├──> RESOLVED ──close──> CLOSED
 │                  │                    ├──> CANCELLED (Manager)
 │                  └──> CANCELLED (Manager)
 └──> CANCELLED (Manager)
```

## State machine — Work Order

```
NEW ──assign──> ASSIGNED ──start──> IN_PROGRESS ──need approval──> WAITING_APPROVAL
   │                  │                  │                            │
   │                  │                  ├──> COMPLETED              ├──approve/reject──> IN_PROGRESS
   │                  │                  ├──> CANCELLED (Manager)    └──cancel──> CANCELLED
   │                  └──> CANCELLED
   └──> CANCELLED
```

## State machine — Approval

```
DRAFT ──submit──> PENDING ──approve──> APPROVED
                   │            │
                   ├──> AWAITING_INFO ──resubmit──> PENDING
                   ├──> REJECTED (Manager, người duyệt ≠ người tạo — FR-APR-09)
                   └──> CANCELLED
```

## RBAC chain

```
Request → Authenticated
       → resolve active user_roles (valid_from <= now < valid_to AND status='ACTIVE')
       → chọn 1 userRoleId thỏa đồng thời:
            (a) user_roles → roles → role_permissions → permissions: có permission.action = required
            (b) user_role_scopes(UserRoleId): scope chứa target
       → 200 OK
       → Nếu 0 userRoleId thỏa → 403 (KHÔNG ghép quyền A với scope B)
```

## Attachment STAGED → READY

```
POST /files → lưu object + files(STAGED) → magic bytes check → MIME allowlist + size → trả fileId
   │
   ▼ khi link vào nghiệp vụ (transaction)
INSERT attachment_links + UPDATE files → READY
```

Magic bytes check: PNG `89 50 4E 47`, PDF `25 50 44 46`, JPEG `FF D8 FF`, XLSX `50 4B 03 04` …

## AI — 100% async

```
POST /ai/suggest/category  body { incidentId, description, assetType, symptoms, validCategories[] }
  → 202 { requestId }
POST /ai/suggest/priority  …
POST /ai/suggest/solution  …
POST /ai/propose-plan     …
GET /ai/requests/{id} → { status, suggestions[], error? }
```

Worker gọi provider ngoài HTTP; không giữ transaction ngầm.
Gửi **ngữ cảnh nghiệp vụ tối thiểu đã làm sạch**, không PII.

## Realtime

<!-- Socket.IO/Realtime module đã bị xóa hoàn toàn khỏi codebase. -->
<!-- Không có WebSocket endpoint trong hệ thống hiện tại. -->
<!-- Thông báo vẫn được ghi vào bảng notifications nhưng không có push realtime. -->

> Toàn bộ sequence diagram, request/response chi tiết, error codes xem file gốc `.docx`.
