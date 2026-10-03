# 🧪 EquipCare AI — Bộ Test Case Toàn Diện

> **Phiên bản:** v0.1 (M4 + M6 AI Triage)
> **Ngày tạo:** 2026-10-04
> **Phạm vi:** Toàn bộ ứng dụng — Backend API (NestJS) + Frontend Web (Next.js 14)
> **Tài khoản demo:**

| Login | Password | Role | Quyền chính |
|-------|----------|------|-------------|
| `admin.bootstrap` | `ChangeMe@2026` | ADMIN | Toàn quyền |
| `demo.manager1` | `ChangeMe@2026` | MANAGER | Duyệt, tạo WO, xem KPI |
| `demo.tech1` | `ChangeMe@2026` | TECHNICIAN | Thực thi WO, ghi nhận chi phí |
| `demo.reporter1` | `ChangeMe@2026` | USER | Tạo incident, xem WO của mình |

**Môi trường:**
- Web UI: http://localhost:3000
- API: http://localhost:3001
- API Docs: http://localhost:3001/api/docs
- Health: http://localhost:3001/healthz

---

## 📑 Mục lục

1. [Quy ước & tiêu chí đánh giá](#1-quy-ước--tiêu-chí-đánh-giá)
2. [Smoke Test](#2-smoke-test)
3. [Auth & IAM](#3-auth--iam)
5. [Incidents](#5-incidents)
6. [Work Orders](#6-work-orders)
7. [Approvals](#7-approvals)
8. [Assets](#8-assets)
9. [Inventory (Parts)](#9-inventory-parts)
10. [Maintenance Plans](#10-maintenance-plans)
11. [Notifications](#11-notifications)
12. [Dashboard & Reports](#12-dashboard--reports)
13. [AI Triage](#13-ai-triage-m6)
14. [Attachments](#14-attachments)
15. [Organization](#15-organization)
16. [Realtime (Socket.IO)](#16-realtime-socketio)
17. [System Config & Health](#17-system-config--health)
18. [Frontend UI](#18-frontend-ui)
19. [Bảo mật & Phân quyền](#19-bảo-mật--phân-quyền)
20. [Performance & Edge cases](#20-performance--edge-cases)

---

## 1. Quy ước & tiêu chí đánh giá

### Ký hiệu trạng thái
- ✅ **PASS** — Đáp ứng đúng kỳ vọng
- ❌ **FAIL** — Không đáp ứng
- ⚠️ **PARTIAL** — Đáp ứng một phần
- 🟡 **BLOCKED** — Không thể test do môi trường

### Mức độ ưu tiên
- 🔴 **P0** — Critical, phải pass trước khi release
- 🟠 **P1** — Quan trọng, nên pass
- 🟡 **P2** — Có thể delay

### Tiêu chí Pass/Fail
- **API**: Status code đúng + Schema response khớp + Side-effect (audit log, notification) xảy ra
- **UI**: Hiển thị đúng + không crash + flow nghiệp vụ hoàn chỉnh

### Setup trước khi test
```bash
# Terminal 1 — API
cd apps/api && npm run build && node dist/main.js

# Terminal 2 — Web
cd apps/web && npm run build && npm start  # hoặc: npm run dev

# Health check
curl http://localhost:3001/healthz/live   # 200 "ok"
curl http://localhost:3000/login          # 200, HTML
```

---

## 2. Smoke Test

> Mục đích: Xác nhận toàn bộ hệ thống boot được và phản hồi.

| ID | Test case | Bước thực hiện | Kỳ vọng | Ưu tiên |
|----|-----------|------------------|----------|---------|
| SM-01 | API liveness | `GET /healthz/live` | 200, `{ "status": "ok" }` | 🔴 P0 |
| SM-02 | API readiness | `GET /healthz/ready` | 200, `{ "status": "ok", "db": "ok" }` | 🔴 P0 |
| SM-03 | API info | `GET /healthz` | 200, trả thông tin app + uptime | 🟠 P1 |
| SM-04 | API docs | Mở `/api/docs` | Swagger UI load được | 🟡 P2 |
| SM-05 | Web login page | Mở `http://localhost:3000/login` | 200, render form đăng nhập tiếng Việt | 🔴 P0 |
| SM-06 | Web root redirect | Mở `http://localhost:3000/` (chưa login) | Redirect đến `/login` | 🟠 P1 |
| SM-07 | Web static routes | Mở `/dashboard`, `/workspace`, `/approvals`, … | Tất cả 200, render shell | 🔴 P0 |
| SM-08 | Web 404 page | Mở `/abc-xyz-not-exist` | 404, hiển thị trang not-found tiếng Việt | 🟡 P2 |
| SM-09 | Web 500 page | Tạm thời không khả thi; chỉ kiểm tra render tồn tại | error.tsx tồn tại | 🟡 P2 |
| SM-10 | CORS + cookies | Từ web gọi API có `credentials: include` | Không bị CORS block | 🟠 P1 |

---

## 3. Auth & IAM

### 3.1 Login / Logout / Refresh

| ID | Test case | Bước thực hiện | Kỳ vọng | Ưu tiên |
|----|-----------|------------------|----------|---------|
| AUTH-01 | Login admin thành công | `POST /auth/login` `{ loginName, password }` | 200, `{ accessToken, refreshToken }` | 🔴 P0 |
| AUTH-02 | Login sai password | Login admin sai password | 401, `AUTH_INVALID_CREDENTIALS` | 🔴 P0 |
| AUTH-03 | Login user không tồn tại | `demo.nobody` / random | 401, `AUTH_INVALID_CREDENTIALS` | 🟠 P1 |
| AUTH-04 | Login thiếu field | Body thiếu `password` | 400, validation error | 🟠 P1 |
| AUTH-05 | Login user bị locked | Lock user rồi login | 401, `AUTH_USER_LOCKED` | 🔴 P0 |
| AUTH-06 | Login mustChangePassword | User có flag đó login lần đầu | 200 + flag trong response | 🟠 P1 |
| AUTH-07 | Refresh token | `POST /auth/refresh` với refreshToken hợp lệ | 200, accessToken mới | 🔴 P0 |
| AUTH-08 | Refresh với token hết hạn | Refresh token cũ hơn TTL | 401, `AUTH_REFRESH_EXPIRED` | 🟠 P1 |
| AUTH-09 | Logout | `POST /auth/logout` | 200; refreshToken bị invalidate | 🟠 P1 |
| AUTH-10 | Change password | `POST /auth/change-password` `{ oldPassword, newPassword }` | 200; lần sau login bằng new password | 🔴 P0 |
| AUTH-11 | Đổi password yếu | newPassword = "123" | 400, validation (min length) | 🟠 P1 |
| AUTH-12 | Đổi sai oldPassword | oldPassword sai | 400, `AUTH_PASSWORD_MISMATCH` | 🟠 P1 |
| AUTH-13 | Me endpoint | `GET /iam/me/permissions` với Bearer token | 200, trả `{ user, roles, permissions, … }` | 🔴 P0 |
| AUTH-14 | Me không có token | `GET /iam/me/permissions` không auth | 401 | 🔴 P0 |
| AUTH-15 | Me token hết hạn | Đợi accessToken hết hạn | 401; auto-refresh; retry thành công | 🟠 P1 |

### 3.2 IAM — Users

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| IAM-U-01 | List users | `GET /iam/users?limit=20` | 200, items[] có `id, loginName, fullName, isActive, roles[]` | 🔴 P0 |
| IAM-U-02 | List users search | `?search=tech` | Chỉ trả user có login/full/email match | 🟠 P1 |
| IAM-U-03 | List users filter isActive=true | `?isActive=true` | Chỉ trả user không bị lock | 🟠 P1 |
| IAM-U-04 | List users pagination | `?limit=2&offset=0` rồi `offset=2` | total cố định, items phân trang | 🟠 P1 |
| IAM-U-05 | List users RBAC | USER role gọi `/iam/users` | 403 (chỉ ADMIN/MANAGER) | 🔴 P0 |
| IAM-U-06 | Get user by id | `GET /iam/users/{id}` | 200, đầy đủ roles + isActive | 🔴 P0 |
| IAM-U-07 | Get user not exist | `GET /iam/users/00000000-0000-0000-0000-000000000000` | 404, `IAM_USER_NOT_FOUND` | 🟠 P1 |
| IAM-U-08 | Create user | `POST /iam/users` admin | 201; user mới với password random | 🔴 P0 |
| IAM-U-09 | Create user conflict loginName | Trùng loginName | 409, `IAM_USER_EXISTS` | 🟠 P1 |
| IAM-U-10 | Create user validate | Thiếu `fullName` | 400 | 🟠 P1 |
| IAM-U-11 | Update user | `PATCH /iam/users/{id}` | 200; thay đổi `fullName`, `email`, `departmentId` | 🟠 P1 |
| IAM-U-12 | Reset password | `POST /iam/users/{id}/reset-password` | 200; trả `temporaryPassword` (chỉ hiện 1 lần) | 🔴 P0 |
| IAM-U-13 | Lock user | `POST /iam/users/{id}/lock` | 200; `isLocked=true` | 🟠 P1 |
| IAM-U-14 | Unlock user | `POST /iam/users/{id}/unlock` | 200; `isLocked=false` | 🟠 P1 |
| IAM-U-15 | Lock self | Admin tự khóa mình | 400, `IAM_LOCK_SELF` | 🟠 P1 |
| IAM-U-16 | Grant role | `POST /iam/users/{id}/roles {roleCode}` | 201 | 🔴 P0 |
| IAM-U-17 | Grant duplicate role | Grant role đã có | 409, `IAM_ROLE_ALREADY_GRANTED` | 🟠 P1 |
| IAM-U-18 | Revoke role | `DELETE /iam/users/{id}/roles/{userRoleId}` | 204 | 🟠 P1 |
| IAM-U-19 | Revoke role cuối cùng | Revoke role ADMIN cuối cùng | 400, `IAM_LAST_ADMIN` | 🟠 P1 |

### 3.3 IAM — Roles & Permissions

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| IAM-R-01 | List roles | `GET /iam/roles` | 200, `[{ code, name, description }]` | 🔴 P0 |
| IAM-R-02 | List permissions | `GET /iam/permissions` | 200, string[] các permission code | 🟠 P1 |
| IAM-R-03 | Permission guard | Gọi API yêu cầu `incident:create` mà role thiếu | 403 | 🔴 P0 |

### 3.4 Audit Logs

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| AUDIT-01 | List audit logs | `GET /iam/audit-logs` admin | 200, phân trang | 🟠 P1 |
| AUDIT-02 | Filter theo actor | `?actorId=…` | Lọc đúng | 🟡 P2 |
| AUDIT-03 | Filter theo action | `?action=incident.create` | Lọc đúng | 🟡 P2 |
| AUDIT-04 | Date range | `?from=2026-05-01&to=2026-05-31` | Lọc đúng | 🟡 P2 |
| AUDIT-05 | RBAC | USER gọi audit-logs | 403, `audit:read:all` | 🟠 P1 |
| AUDIT-06 | Audit integrity | Thực hiện transition incident | Có audit entry `incident.transition` | 🟠 P1 |

---

## 5. Incidents

> Module lõi của hệ thống. Workflow: NEW → AWAITING_INFO / IN_PROGRESS → RESOLVED → CLOSED (hoặc CANCELLED).

### 5.1 CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| INC-C-01 | List incidents | `GET /incidents` | 200, items[] + total | 🔴 P0 |
| INC-C-02 | List incidents phân trang | `?limit=5&offset=0` rồi `offset=5` | Đúng | 🟠 P1 |
| INC-C-03 | Filter status | `?status=NEW` | Lọc đúng | 🟠 P1 |
| INC-C-04 | Filter priority | `?priority=CRITICAL` | Lọc đúng | 🟠 P1 |
| INC-C-05 | Filter date range | `?fromDate=&toDate=` | Lọc đúng | 🟡 P2 |
| INC-C-06 | Search text | `?search=motor` | Match title/description | 🟡 P2 |
| INC-C-07 | Sort | `?sort=createdAt:desc` | Order đúng | 🟡 P2 |
| INC-C-08 | Get by id | `GET /incidents/{id}` | 200, full detail + messages[] | 🔴 P0 |
| INC-C-09 | Get not exist | Invalid UUID | 404 | 🟠 P1 |
| INC-C-10 | Create incident | `POST /incidents` user/reporter | 201; status=NEW; priority mặc định MEDIUM | 🔴 P0 |
| INC-C-11 | Create với AI triage | Pass `aiTriage: true` | 201 + AI request được queue | 🟠 P1 |
| INC-C-12 | Create thiếu asset | Không gửi `assetId` | 400 | 🟠 P1 |
| INC-C-13 | Create với asset không tồn tại | Random UUID | 404 | 🟠 P1 |

### 5.2 State Machine

| ID | From | To | Kỳ vọng | Ưu tiên |
|----|------|----|---------|---------|
| INC-S-01 | NEW | IN_PROGRESS | ✅ Cho phép | 🔴 P0 |
| INC-S-02 | NEW | AWAITING_INFO | ✅ Cho phép | 🔴 P0 |
| INC-S-03 | NEW | CANCELLED | ✅ Cho phép (cần `cancelReason`) | 🔴 P0 |
| INC-S-04 | NEW | RESOLVED | ❌ Phải qua IN_PROGRESS trước | 🟠 P1 |
| INC-S-05 | AWAITING_INFO | IN_PROGRESS | ✅ Auto khi staff reply | 🔴 P0 |
| INC-S-06 | AWAITING_INFO | CANCELLED | ✅ Cho phép | 🟠 P1 |
| INC-S-07 | IN_PROGRESS | RESOLVED | ✅ Cho phép | 🔴 P0 |
| INC-S-08 | IN_PROGRESS | AWAITING_INFO | ✅ Cho phép | 🟠 P1 |
| INC-S-09 | IN_PROGRESS | CANCELLED | ✅ Cho phép | 🟠 P1 |
| INC-S-10 | RESOLVED | CLOSED | ✅ Cho phép | 🔴 P0 |
| INC-S-11 | RESOLVED | IN_PROGRESS | ❌ Không cho phép | 🟠 P1 |
| INC-S-12 | CLOSED | bất kỳ | ❌ Terminal | 🔴 P0 |
| INC-S-13 | CANCELLED | bất kỳ | ❌ Terminal | 🔴 P0 |

### 5.3 Messages

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| INC-M-01 | Post REPORTER message | `POST /incidents/{id}/messages { type: REPORTER, content }` | 201 | 🟠 P1 |
| INC-M-02 | Post STAFF message | STAFF trong AWAITING_INFO | 201 + auto-transition → IN_PROGRESS | 🔴 P0 |
| INC-M-03 | Post AI message | STAFF/manager add AI snapshot | 201, type=AI | 🟠 P1 |
| INC-M-04 | Post SYSTEM message | Không cho phép manual | 400 | 🟠 P1 |
| INC-M-05 | Empty content | content="" | 400 | 🟠 P1 |
| INC-M-06 | List messages | `GET /incidents/{id}` | Trả `messages[]` ordered by createdAt | 🔴 P0 |

---

## 6. Work Orders

> Lifecycle: NEW → ASSIGNED → IN_PROGRESS → (PAUSED/RESUMED events) → COMPLETED | CANCELLED. WAITING_APPROVAL là state riêng (M6).

### 6.1 CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| WO-C-01 | List work-orders | `GET /work-orders` | 200 | 🔴 P0 |
| WO-C-02 | List filter status | `?status=IN_PROGRESS` | Lọc đúng | 🟠 P1 |
| WO-C-03 | List filter assignee | `?assigneeId=…` | Lọc đúng | 🟠 P1 |
| WO-C-04 | List "my WOs" | `?myAssigned=true` (technician) | Chỉ WO assign cho mình | 🟠 P1 |
| WO-C-05 | Get WO detail | `GET /work-orders/{id}` | 200, đầy đủ cost entries, parts planned, history | 🔴 P0 |
| WO-C-06 | Create WO manual | `POST /work-orders { creationMode: MANUAL, assetId, title, … }` | 201, status=NEW hoặc ASSIGNED | 🔴 P0 |
| WO-C-07 | Create WO from incident | `{ creationMode: FROM_INCIDENT, incidentId, … }` | 201; link incident | 🔴 P |
| WO-C-08 | Create WO from maintenance | `{ creationMode: FROM_MAINTENANCE, planId, … }` | 201; link plan | 🟠 P1 |
| WO-C-09 | Create WO validate | Thiếu `title` | 400 | 🟠 P1 |
| WO-C-10 | Create với priority không hợp lệ | priority=URGENT (không có trong enum) | 400 | 🟠 P1 |
| WO-C-11 | SLA status | `GET /work-orders/{id}/sla-status` | 200, trả `state`, `dueAt`, `breached`, `isAtRisk` | 🟠 P1 |

### 6.2 State Machine

| ID | From | To | Kỳvọng | Ưu tiên |
|----|------|----|---------|---------|
| WO-S-01 | NEW | ASSIGNED | Qua `PATCH /assign` hoặc `transition` | 🔴 P0 |
| WO-S-02 | NEW | CANCELLED | ✅ (cần cancel reason) | 🔴 P0 |
| WO-S-03 | ASSIGNED | IN_PROGRESS | ✅ | 🔴 P0 |
| WO-S-04 | ASSIGNED | CANCELLED | ✅ | 🟠 P1 |
| WO-S-05 | ASSIGNED | COMPLETED | ❌ Phải qua IN_PROGRESS | 🟠 P1 |
| WO-S-06 | IN_PROGRESS | WAITING_APPROVAL | ✅ (M6: cost vượt budget) | 🔴 P0 |
| WO-S-07 | WAITING_APPROVAL | IN_PROGRESS | ✅ Sau approval APPROVED | 🔴 P0 |
| WO-S-08 | WAITING_APPROVAL | CANCELLED | ✅ | 🟠 P1 |
| WO-S-09 | IN_PROGRESS | COMPLETED | ✅ Qua `/complete` endpoint | 🔴 P0 |
| WO-S-10 | IN_PROGRESS | CANCELLED | ✅ | 🟠 P1 |
| WO-S-11 | COMPLETED | bất kỳ | ❌ Terminal | 🔴 P0 |
| WO-S-12 | CANCELLED | bất kỳ | ❌ Terminal | 🔴 P0 |
| WO-S-13 | Bất kỳ state trừ IN_PROGRESS | COMPLETED qua `/complete` | ❌ Auto-transition nếu chưa IN_PROGRESS | 🟠 P1 |

### 6.3 Assignment & Notes

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| WO-A-01 | Assign technician | `PATCH /work-orders/{id}/assign { assigneeId }` | 200, status=ASSIGNED | 🔴 P0 |
| WO-A-02 | Reassign | Assign lại user khác | 200, history ghi reassignment | 🟠 P1 |
| WO-A-03 | Assign WO ở state không hợp lệ | COMPLETED → assign | 400, `WO_INVALID_ASSIGN_STATE` | 🟠 P1 |
| WO-A-04 | Add PROGRESS note | `POST /work-orders/{id}/notes { type: PROGRESS, content }` | 201 | 🟠 P1 |
| WO-A-05 | Pause WO | `{ type: PAUSE_START, pauseReason: WAITING_PART, content }` | 201; pause reason ghi vào history | 🟠 P1 |
| WO-A-06 | Pause thiếu reason | pauseReason rỗng | 400 | 🟠 P1 |
| WO-A-07 | Resume WO | `{ type: PAUSE_END, content }` | 201; resumed event | 🟠 P1 |
| WO-A-08 | Notes history | GET WO detail | Trả `notes[]` ordered | 🟠 P1 |

### 6.4 Planned Parts

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| WO-P-01 | List planned parts | `GET /work-orders/{id}/parts/planned` | 200, items[] | 🟠 P1 |
| WO-P-02 | Add planned part | `POST …/parts/planned { partId, quantity }` | 201 | 🟠 P1 |
| WO-P-03 | Quantity âm | quantity=-1 | 400 | 🟠 P1 |
| WO-P-04 | Part không tồn tại | Random UUID | 404 | 🟠 P1 |

### 6.5 Cost Entries

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| WO-CT-01 | List cost entries | `GET /work-orders/{woId}/cost-entries` | 200 | 🟠 P1 |
| WO-CT-02 | Add PART cost | `{ category: PART, amount, currency }` | 201 | 🟠 P1 |
| WO-CT-03 | Add LABOR cost | `{ category: LABOR, hours, hourlyRate }` | 201; amount = hours * rate | 🟠 P1 |
| WO-CT-04 | Add OTHER cost | `{ category: OTHER, amount, description }` | 201 | 🟠 P1 |
| WO-CT-05 | Direction CREDIT | direction=CREDIT | 201; ghi giảm chi phí | 🟠 P1 |
| WO-CT-06 | Amount âm | amount=-100 | 400 | 🟠 P1 |

### 6.6 Stock Issue / Return

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| WO-ST-01 | Issue part to WO | `POST /work-orders/{woId}/parts/issue { partId, quantity }` | 201; stock giảm | 🟠 P1 |
| WO-ST-02 | Issue vượt stock | quantity > available | 400 | 🟠 P1 |
| WO-ST-03 | Return part | `POST /work-orders/{woId}/parts/return { partId, quantity }` | 201; stock tăng | 🟠 P1 |
| WO-ST-04 | Return vượt lượng đã issue | quantity > issued | 400 | 🟠 P1 |

---

## 7. Approvals

> Approval cho cost-budget overrun (M6). Lifecycle: DRAFT → SUBMITTED → INFO_REQUESTED/REJECTED/APPROVED → CANCELLED.

### 7.1 CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| APR-C-01 | List approvals | `GET /approvals` | 200 | 🔴 P0 |
| APR-C-02 | Filter status | `?status=PENDING` hoặc `?status=SUBMITTED` | Lọc đúng | 🟠 P1 |
| APR-C-03 | Filter type | `?type=WO_BUDGET` | Lọc đúng | 🟡 P2 |
| APR-C-04 | Get approval detail | `GET /approvals/{id}` | 200; trả revisions[] + current + history | 🔴 P0 |
| APR-C-05 | Create approval | `POST /approvals { workOrderId, type, requestedAmount, reason }` | 201, status=DRAFT | 🔴 P0 |
| APR-C-06 | Update draft | `PATCH /approvals/{id}/draft` | 200 | 🟠 P1 |
| APR-C-07 | Update non-draft | Update approval SUBMITTED | 400, `APR_NOT_DRAFT` | 🟠 P1 |
| APR-C-08 | Create với amount âm | amount=-100 | 400 | 🟠 P1 |
| APR-C-09 | Auto trigger from WO | WO COMPLETED vượt budget | Approval auto-create + notification | 🔴 P0 |

### 7.2 Revision Flow

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| APR-R-01 | Submit draft | `PATCH /approvals/{id}` `{ action: SUBMIT }` | 200, status=SUBMITTED | 🔴 P0 |
| APR-R-02 | Submit non-draft | SUBMITTED → submit lại | 400 | 🟠 P1 |
| APR-R-03 | Approve | `{ action: APPROVED, note }` | 200, status=APPROVED | 🔴 P0 |
| APR-R-04 | Approve không có quyền | TECHNICIAN approve | 403, `approval:decide` | 🔴 P0 |
| APR-R-05 | Reject | `{ action: REJECTED, note }` | 200, status=REJECTED | 🔴 P0 |
| APR-R-06 | Info request | `{ action: INFO_REQUESTED, note }` | 200, status=INFO_REQUESTED | 🔴 P0 |
| APR-R-07 | Create new revision | `POST /approvals/{id}/revisions` khi REJECTED/INFO_REQUESTED | 201, new revisionNo | 🔴 P0 |
| APR-R-08 | Create revision terminal | APPROVED → new revision | 400, `APR_TERMINAL` | 🟠 P1 |
| APR-R-09 | Cancel by proposer | `{ action: CANCELLED }` | 200, status=CANCELLED | 🟠 P1 |
| APR-R-10 | Cancel by non-proposer | TECHNICIAN cancel approval của manager | 403 | 🟠 P1 |

### 7.3 Decision Audit

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| APR-A-01 | Audit log on approve | Approve 1 approval | Audit `approval.approve` | 🟠 P1 |
| APR-A-02 | Decision note required | Info request không có note | 400, `APR_NOTE_REQUIRED` | 🟠 P1 |
| APR-A-03 | Revision history | GET approval detail | `revisions[]` sorted by revisionNo | 🟠 P1 |

---

## 8. Assets

### 8.1 CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| AST-C-01 | List assets | `GET /assets` | 200, items[] + total | 🔴 P0 |
| AST-C-02 | Search | `?search=motor` | Lọc đúng | 🟠 P1 |
| AST-C-03 | Filter locationId | `?locationId=…` | Lọc đúng | 🟠 P1 |
| AST-C-04 | Filter assetTypeId | `?assetTypeId=…` | Lọc đúng | 🟠 P1 |
| AST-C-05 | Pagination | `?limit=10&offset=0` | Đúng | 🟠 P1 |
| AST-C-06 | Get by id | `GET /assets/{id}` | 200, full detail + recent WOs | 🔴 P0 |
| AST-C-07 | Get QR data | `GET /assets/{id}/qr` | 200, trả QR payload | 🟠 P1 |
| AST-C-08 | Create asset | `POST /assets` | 201 | 🔴 P0 |
| AST-C-09 | Create với code trùng | Duplicate `code` | 409 | 🟠 P1 |
| AST-C-10 | Update asset | `PATCH /assets/{id}` | 200 | 🟠 P1 |
| AST-C-11 | Update thiếu field bắt buộc | clear `code` | 400 | 🟠 P1 |
| AST-C-12 | Validation `code` format | code có space/special | 400 | 🟡 P2 |

### 8.2 Lifecycle (manual_state)

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| AST-L-01 | Transition NORMAL → SUSPENDED | `POST /assets/{id}/lifecycle { to: SUSPENDED, reason }` | 200 | 🔴 P0 |
| AST-L-02 | Transition SUSPENDED → NORMAL | Normal lại | 200 | 🟠 P1 |
| AST-L-03 | Transition → RETIRED | `to: RETIRED` | 200 | 🔴 P0 |
| AST-L-04 | Create WO trên RETIRED asset | RETIRED → tạo WO | 400, `ASSET_RETIRED_NO_WO` | 🔴 P0 |
| AST-L-05 | Transition thiếu reason | RETIRED không reason | 400 | 🟠 P1 |
| AST-L-06 | Lifecycle invalid transition | NORMAL → RETIRED nhảy cóc | 400 | 🟠 P1 |
| AST-L-07 | Lifecycle chỉ MANUAL | Tech lead vs reporter | RBAC đúng | 🟠 P1 |

### 8.3 QR Code

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| AST-QR-01 | Tạo QR cho asset | Tạo QR | 200, asset code + URL | 🟠 P1 |
| AST-QR-02 | QR scan → asset page | Truy cập URL QR | Render asset detail | 🟠 P1 |

---

## 9. Inventory (Parts)

### 9.1 Parts CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| PRT-C-01 | List parts | `GET /parts` | 200 | 🔴 P0 |
| PRT-C-02 | Search parts | `?search=bearing` | Lọc đúng | 🟠 P1 |
| PRT-C-03 | Filter lowStock | `?lowStock=true` | Chỉ parts có stock < minStock | 🟠 P1 |
| PRT-C-04 | Get part detail | `GET /parts/{id}` | 200, full + stock transactions | 🟠 P1 |
| PRT-C-05 | Create part | `POST /parts` | 201 | 🔴 P0 |
| PRT-C-06 | Create trùng code | Duplicate code | 409 | 🟠 P1 |
| PRT-C-07 | Update part | `PATCH /parts/{id}` | 200 | 🟠 P1 |
| PRT-C-08 | Validate unit | unit="" | 400 | 🟠 P1 |
| PRT-C-09 | Validate price âm | unitPrice=-100 | 400 | 🟠 P1 |

### 9.2 Stock Transactions

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| STK-T-01 | Receipt (nhập kho) | `POST /stock-transactions/receipt { partId, quantity, unitCost }` | 201; stock tăng | 🔴 P0 |
| STK-T-02 | Adjust + | `{ type: ADJUST, delta: +10, reason }` | 201 | 🟠 P1 |
| STK-T-03 | Adjust - vượt stock | delta=-999 | 400 | 🟠 P1 |
| STK-T-04 | List transactions | `GET /stock-transactions` | 200, items[] | 🟠 P1 |
| STK-T-05 | Adjust thiếu reason | reason="" | 400 | 🟠 P1 |

### 9.3 Adjust via parts endpoint

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| PRT-A-01 | Adjust stock | `POST /parts/{id}/adjust { delta, reason }` | 200; stock mới | 🟠 P1 |
| PRT-A-02 | Adjust vượt | part stock=5, adjust=-10 | 400 | 🟠 P1 |

---

## 10. Maintenance Plans

### 10.1 Plan CRUD

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| MP-C-01 | List plans | `GET /maintenance-plans` | 200 | 🔴 P0 |
| MP-C-02 | Filter asset | `?assetId=…` | Lọc đúng | 🟠 P1 |
| MP-C-03 | Filter active | `?active=true` | Lọc đúng | 🟠 P1 |
| MP-C-04 | Get plan detail | `GET /maintenance-plans/{id}` | 200, occurrences + tasks | 🔴 P0 |
| MP-C-05 | Create plan | `POST /maintenance-plans { assetId, name, cron }` | 201 | 🔴 P0 |
| MP-C-06 | Update plan | `PATCH /maintenance-plans/{id}` | 200 | 🟠 P1 |
| MP-C-07 | Update cron invalid | cron=`*-*-*` | 400 | 🟠 P1 |

### 10.2 Lifecycle

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| MP-L-01 | Pause plan | `POST /maintenance-plans/{id}/pause { reason }` | 200, status=PAUSED | 🟠 P1 |
| MP-L-02 | Resume plan | `POST …/resume` | 200, status=ACTIVE | 🟠 P1 |
| MP-L-03 | Pause thiếu reason | reason="" | 400 | 🟠 P1 |
| MP-L-04 | List occurrences | `GET /maintenance-plans/{id}/occurrences` | 200 | 🟠 P1 |

### 10.3 Occurrences

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| MP-O-01 | Get occurrence | `GET /maintenance-occurrences/{id}` | 200 | 🟠 P1 |
| MP-O-02 | Skip occurrence | `POST …/{id}/skip { reason }` | 200, status=SKIPPED | 🟠 P1 |
| MP-O-03 | Generate WO now | `POST …/{id}/generate-now` | 201, WO mới từ occurrence | 🟠 P1 |
| MP-O-04 | Skip sau khi COMPLETED | COMPLETED → skip | 400 | 🟠 P1 |
| MP-O-05 | Tick cron manually | `POST /maintenance-plans/tick` | 200; scheduler chạy | 🟠 P1 |

---

## 11. Notifications

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| NTF-01 | List notifications | `GET /notifications` | 200, items[] | 🔴 P0 |
| NTF-02 | Filter unread | `?unread=true` | Lọc đúng | 🟠 P1 |
| NTF-03 | Unread count | `GET /notifications/unread-count` | 200, `{ count }` | 🔴 P0 |
| NTF-04 | Mark one as read | `PATCH /notifications/{id}/read` | 200, read=true | 🟠 P1 |
| NTF-05 | Mark all as read | `PATCH /notifications/read-all` | 200; count=0 | 🟠 P1 |
| NTF-06 | Auto-create on incident assign | Assign incident | User nhận notification | 🔴 P0 |
| NTF-07 | Auto-create on WO complete | Complete WO của user | Reporter nhận notification | 🟠 P1 |
| NTF-08 | Auto-create on approval decision | Approve 1 approval | Proposer nhận notification | 🔴 P0 |
| NTF-09 | Notification RBAC | Chỉ xem notification của mình | Không thấy của user khác | 🔴 P0 |

---

## 12. Dashboard & Reports

### 12.1 Dashboard

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| DB-01 | KPIs | `GET /dashboard/kpis` | 200, trả `totalIncidents, openIncidents, …` | 🔴 P0 |
| DB-02 | Overdue WOs | `GET /dashboard/overdue` | 200, list WO quá hạn | 🟠 P1 |
| DB-03 | Technician load | `GET /dashboard/technician-load` | 200, list tech + count | 🟠 P1 |
| DB-04 | Asset critical | `GET /dashboard/asset-critical` | 200, list asset có nhiều incident | 🟠 P1 |
| DB-05 | Cost trend | `GET /dashboard/cost-trend?from=&to=&bucket=month` | 200, series data | 🟡 P2 |
| DB-06 | Action items | `GET /dashboard/action-items` | 200, các action cần làm | 🟠 P1 |
| DB-07 | Dashboard refresh | Refresh sau khi tạo incident | KPIs update | 🟠 P1 |
| DB-08 | Dashboard RBAC | USER gọi dashboard | 200 (cho KPIs), 403 cho audit-style endpoints | 🟠 P1 |

### 12.2 Reports

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| RPT-01 | List report types | Mở `/reports` | Hiển thị các loại | 🟠 P1 |
| RPT-02 | Report incidents | `GET /reports/incidents?from=&to=` | 200, file/JSON export | 🟠 P1 |
| RPT-03 | Report cost | `GET /reports/cost?from=&to=` | 200 | 🟠 P1 |
| RPT-04 | Report export Excel/CSV | Click "Export" | Tải file | 🟡 P2 |
| RPT-05 | Report RBAC | USER role | 403, `report:export` | 🟠 P1 |
| RPT-06 | Report empty range | No data | 200, items=[] | 🟡 P2 |

---

## 13. AI Triage (M6)

> Module AI mới (đã implement ở commit `e04c0df`). Provider mặc định: mock@v1.

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| AI-01 | Trigger analyze | `POST /ai/incidents/{id}/analyze` | 202, trả `{ requestId, status: QUEUED }` | 🔴 P0 |
| AI-02 | Poll request | `GET /ai/requests/{requestId}` ngay sau đó | 200, status=QUEUED hoặc RUNNING | 🔴 P0 |
| AI-03 | Poll after complete | Poll sau 2-4s | 200, status=SUCCEEDED, output có `category, priority, summary, actions` | 🔴 P0 |
| AI-04 | Output schema | Inspect response | Match `category ∈ enum, priority ∈ enum, confidence 0-1` | 🔴 P0 |
| AI-05 | Idempotency | Analyze 2 lần liên tiếp | Request thứ 2 trả cùng `requestId` (dedupe) | 🟠 P1 |
| AI-06 | Analyze incident không tồn tại | Random UUID | 404 | 🟠 P1 |
| AI-07 | Analyze incident CLOSED | 200 hoặc 400? | Spec cho phép (chỉ phân tích) | 🟠 P1 |
| AI-08 | AI request timeout | Đợi > TTL | status=TIMED_OUT | 🟠 P1 |
| AI-09 | Provider switch | Set env `AI_PROVIDER=openai` | Fallback mock nếu openai fail | 🟡 P2 |
| AI-10 | Output as incident message | Verify incident detail | Có message type=AI từ requestId | 🔴 P0 |
| AI-11 | Auto-create incident với AI | `POST /incidents { aiTriage: true }` | 202 + requestId; output applied sau khi ready | 🟠 P1 |
| AI-12 | RBAC | USER role trigger analyze | 403, `ai:triage:run` | 🟠 P1 |

---

## 14. Attachments

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| ATT-01 | Upload file | `POST /files` multipart, file ảnh | 201, trả `{ id, url }` | 🔴 P0 |
| ATT-02 | Upload quá size | file > max | 413, `FILE_TOO_LARGE` | 🟠 P1 |
| ATT-03 | Upload type không hỗi trợ | .exe | 415, `UNSUPPORTED_MEDIA` | 🟠 P1 |
| ATT-04 | Get metadata | `GET /files/{id}` | 200 | 🟠 P1 |
| ATT-05 | Download | `GET /files/{id}/download` | 200, stream file | 🔴 P0 |
| ATT-06 | Link to entity | `POST /files/{id}/link { entityType, entityId }` | 201 | 🟠 P1 |
| ATT-07 | Delete | `DELETE /files/{id}` | 204; không thể download | 🟠 P1 |
| ATT-08 | Delete file của user khác | delete attachment của user khác | 403 | 🟠 P1 |
| ATT-09 | Upload không auth | Không Bearer | 401 | 🔴 P0 |

---

## 15. Organization

### 15.1 Departments

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| ORG-D-01 | List departments | `GET /departments` | 200 | 🟠 P1 |
| ORG-D-02 | Get department | `GET /departments/{id}` | 200 | 🟠 P1 |
| ORG-D-03 | Create department | `POST /departments` | 201 | 🟠 P1 |
| ORG-D-04 | Update department | `PATCH /departments/{id}` | 200 | 🟠 P1 |

### 15.2 Locations

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| ORG-L-01 | List locations | `GET /locations` | 200 | 🟠 P1 |
| ORG-L-02 | Tree | `GET /locations/tree` | 200, hierarchical | 🟠 P1 |
| ORG-L-03 | Create location | `POST /locations { name, code, parentId? }` | 201 | 🟠 P1 |
| ORG-L-04 | Location có parent invalid | parentId random UUID | 404 | 🟠 P1 |
| ORG-L-05 | Circular reference | A → B → A | 400, `ORG_CIRCULAR` | 🟡 P2 |

### 15.3 Asset Types

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| ORG-AT-01 | List asset types | `GET /asset-types` | 200 | 🟠 P1 |
| ORG-AT-02 | Create asset type | `POST /asset-types` | 201 | 🟠 P1 |
| ORG-AT-03 | Update asset type | `PATCH /asset-types/{id}` | 200 | 🟠 P1 |

---

## 16. Realtime (Socket.IO)

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| RT-01 | Connect | `io('http://localhost:3001/ws', { auth: { token } })` | connected | 🔴 P0 |
| RT-02 | Connect không token | io() không auth | disconnect | 🟠 P1 |
| RT-03 | Notification event | Tạo incident assign cho other | receive `notification:new` | 🔴 P0 |
| RT-04 | Notification read event | Mark read | receive `notification:updated` | 🟠 P1 |
| RT-05 | Disconnect/reconnect | Tắt mạng, bật lại | Tự động reconnect với token mới | 🟠 P1 |
| RT-06 | Multi-tab sync | Mở 2 tab, action 1 tab | Cả 2 nhận event | 🟡 P2 |

---

## 17. System Config & Health

### 17.1 System Settings

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| CFG-01 | List settings | `GET /system-settings` | 200 | 🟠 P1 |
| CFG-02 | Get by key | `GET /system-settings/{key}` | 200 | 🟠 P1 |
| CFG-03 | Update setting | `PUT /system-settings/{key}` | 200 | 🟠 P1 |
| CFG-04 | Setting unknown | key="not_existed" | 404 | 🟠 P1 |
| CFG-05 | RBAC | USER update | 403 | 🟠 P1 |

### 17.2 Health

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| HLT-01 | Liveness | `GET /healthz/live` | 200, "ok" | 🔴 P0 |
| HLT-02 | Readiness check DB | `GET /healthz/ready` | 200, db connected | 🔴 P0 |
| HLT-03 | Health detail | `GET /healthz` | Trả uptime, version, deps | 🟡 P2 |

---

## 18. Frontend UI

### 18.1 Pages — Smoke

| ID | URL | Kỳvọng | Ưu tiên |
|----|-----|--------|---------|
| UI-01 | `/` | Redirect theo trạng thái auth | 🟠 P1 |
| UI-02 | `/login` | Form login tiếng Việt | 🔴 P0 |
| UI-03 | `/dashboard` | KPI cards + charts | 🟠 P1 |
| UI-04 | `/incidents` | Bảng incidents, filter, search | 🔴 P0 |
| UI-05 | `/incidents/[id]` | Detail + chat + AI panel | 🔴 P0 |
| UI-06 | `/incidents/new` | Form tạo incident | 🟠 P1 |
| UI-07 | `/work-orders` | Bảng WO | 🔴 P0 |
| UI-08 | `/work-orders/[id]` | Detail + actions | 🔴 P0 |
| UI-09 | `/work-orders/new` | Form tạo WO | 🟠 P1 |
| UI-10 | `/approvals` | Bảng approval | 🟠 P1 |
| UI-11 | `/approvals/[id]` | Detail + revision history | 🟠 P1 |
| UI-12 | `/assets` | Bảng assets | 🔴 P0 |
| UI-13 | `/assets/[id]` | Detail + recent WOs + QR | 🟠 P1 |
| UI-14 | `/assets/new` | Form tạo | 🟠 P1 |
| UI-15 | `/assets/[id]/qr` | QR page | 🟡 P2 |
| UI-16 | `/inventory/parts` | Bảng parts + stock | 🟠 P1 |
| UI-17 | `/maintenance/plans` | Bảng plans | 🟠 P1 |
| UI-18 | `/maintenance/plans/[id]` | Detail + occurrences | 🟠 P1 |
| UI-19 | `/notifications` | List notifications | 🟠 P1 |
| UI-20 | `/reports` | List report templates | 🟠 P1 |
| UI-21 | `/iam/users` | Bảng users + roles | 🟠 P1 |
| UI-22 | `/iam/users/[id]` | Detail + role management | 🟠 P1 |
| UI-23 | `/iam/audit-logs` | Audit log view | 🟡 P2 |

### 18.2 Components

| ID | Test case | Kỳvọng | Ưu tiên |
|----|-----------|--------|---------|
| UI-C-01 | AppShell render đầy đủ | Sidebar + main, hiển thị user info | 🔴 P0 |
| UI-C-02 | AppShellSkeleton | Khi user chưa load | 🟠 P1 |
| UI-C-03 | AuthGuard redirect | Chưa login → /login | 🔴 P0 |
| UI-C-04 | Sidebar nav theo role | Ẩn menu nếu không có permission | 🟠 P1 |
| UI-C-05 | Notification badge | Hiển thị unread count | 🟠 P1 |
| UI-C-06 | Toast notifications | success/error/info variants | 🟠 P1 |
| UI-C-07 | DataTable pagination | Hoạt động đúng | 🟠 P1 |
| UI-C-08 | DataTable refresh | Refetch data | 🟠 P1 |
| UI-C-09 | AI analyze panel | Hiển thị output, status badge | 🔴 P0 |
| UI-C-10 | Empty state | List rỗng → "Chưa có dữ liệu" | 🟠 P1 |
| UI-C-11 | Loading skeleton | Render skeleton khi đang fetch | 🟠 P1 |
| UI-C-12 | Error state | Render error message + retry | 🟠 P1 |
| UI-C-13 | Form errors | Hiển thị validation lỗi inline | 🟠 P1 |
| UI-C-14 | Modal | Open/close, backdrop click | 🟠 P1 |
| UI-C-15 | Confirm dialog | Trước action destructive | 🟡 P2 |

### 18.3 Theme & Layout

| ID | Test case | Kỳvọng | Ưu tiên |
|----|-----------|--------|---------|
| UI-L-01 | Responsive desktop ≥1280px | Full layout | 🔴 P0 |
| UI-L-02 | Responsive tablet 768-1279px | Layout adapt | 🟠 P1 |
| UI-L-03 | Responsive mobile <768px | Stack layout | 🟡 P2 |
| UI-L-04 | Brand color | Brand teal, slate sidebar | 🟡 P2 |
| UI-L-05 | Icon consistency | lucide-react đồng nhất | 🟡 P2 |
| UI-L-06 | Vietnamese labels | Tất cả UI tiếng Việt | 🟠 P1 |

### 18.4 Accessibility (basic)

| ID | Test case | Kỳvọng | Ưu tiên |
|----|-----------|--------|---------|
| UI-A-01 | Keyboard nav | Tab qua được mọi interactive | 🟠 P1 |
| UI-A-02 | Focus ring | Có outline khi focus | 🟠 P1 |
| UI-A-03 | Form labels | Mỗi input có label | 🟠 P1 |
| UI-A-04 | Alt text ảnh | Có alt attribute | 🟡 P2 |

---

## 19. Bảo mật & Phân quyền

| ID | Test case | Bước | Kỳvọng | Ưu tiên |
|----|-----------|------|--------|---------|
| SEC-01 | Endpoint public | `GET /healthz` | Không cần auth | 🔴 P0 |
| SEC-02 | Endpoint private | Hầu hết khác | Cần Bearer token | 🔴 P0 |
| SEC-03 | Token expired | Đợi accessToken hết hạn | Auto refresh | 🔴 P0 |
| SEC-04 | Refresh rotation | Refresh liên tục nhiều lần | OK | 🟠 P1 |
| SEC-05 | SQL injection | Inject `' OR 1=1 --` vào search | Không crash, trả [] | 🔴 P0 |
| SEC-06 | XSS trong description | Inject `<script>` vào description | Render escape | 🔴 P0 |
| SEC-07 | Permission guard coverage | Mỗi endpoint có @Permissions | Verify | 🔴 P0 |
| SEC-08 | Audit log mọi thay đổi | Tạo/update/delete | Có audit | 🟠 P1 |
| SEC-09 | Password complexity | Weak password | 400 | 🟠 P1 |
| SEC-10 | Rate limit (nếu có) | Spam login | Block sau N lần | 🟡 P2 |
| SEC-11 | Logout invalidates token | Logout → dùng token cũ | 401 | 🟠 P1 |
| SEC-12 | Last admin protection | Xóa admin cuối | 400, `IAM_LAST_ADMIN` | 🟠 P1 |
| SEC-13 | Self-lock protection | Admin tự khóa | 400, `IAM_LOCK_SELF` | 🟠 P1 |
| SEC-14 | CORS | Gọi từ domain khác | Block | 🔴 P0 |
| SEC-15 | CSRF | Action POST không có CSRF token | Reject (nếu áp dụng) | 🟡 P2 |

---

## 20. Performance & Edge cases

| ID | Test case | Kỳvọng | Ưu tiên |
|----|-----------|--------|---------|
| PERF-01 | Cold start API | < 3s | 🔴 P0 |
| PERF-02 | Cold start Web | < 1s (dev), < 500ms (prod cached) | 🟠 P1 |
| PERF-03 | List API p95 < 200ms | 100 users | 🟠 P1 |
| PERF-04 | Pagination 10000 records | < 500ms | 🟡 P2 |
| PERF-05 | Concurrent updates | 2 users update cùng asset | Optimistic locking hoặc last-write-wins rõ ràng | 🟠 P1 |
| PERF-06 | Large file upload | 50MB | Streaming, không OOM | 🟡 P2 |
| EDGE-01 | Empty database (fresh) | List rỗng → render empty state OK | 🟠 P1 |
| EDGE-02 | Unicode trong input | Tiếng Việt có dấu | Lưu/hiển thị đúng | 🔴 P0 |
| EDGE-03 | Emoji | 😀 trong comment | Lưu/hiển thị | 🟠 P1 |
| EDGE-04 | Null/undefined body | Gửi empty body | 400 | 🟠 P1 |
| EDGE-05 | Malformed JSON | Body sai JSON | 400 | 🟠 P1 |
| EDGE-06 | Date timezone | ISO với TZ | Lưu + hiển thị đúng | 🟠 P1 |
| EDGE-07 | DST boundary | Tạo WO trước/sau DST | Cron đúng | 🟡 P2 |
| EDGE-08 | Concurrent transitions | 2 users transition cùng incident | 1 thành công, 1 fail với INVALID_TRANSITION | 🟠 P1 |
| EDGE-09 | Network retry | Auto-refresh 1 lần | OK | 🟠 P1 |
| EDGE-10 | API down | API tắt, web thử gọi | Hiển thị error toast | 🟠 P1 |
| EDGE-11 | Long content | Description 10000 chars | Lưu + hiển thị | 🟠 P1 |
| EDGE-12 | Special chars trong code | `</script>` | Escape | 🔴 P0 |
| EDGE-13 | Negative number | amount = -1 | 400 | 🟠 P1 |
| EDGE-14 | Float precision | amount = 0.1 + 0.2 | Lưu đúng (DB decimal) | 🟡 P2 |

---

## 📊 Tổng hợp

| Nhóm | Số test case | P0 | P1 | P2 |
|------|--------------|----|----|----|
| Smoke | 10 | 4 | 4 | 2 |
| Auth & IAM | 35 | 12 | 21 | 2 |
| Incidents | 26 | 9 | 15 | 2 |
| Work Orders | 38 | 12 | 23 | 3 |
| Approvals | 22 | 8 | 13 | 1 |
| Assets | 18 | 5 | 11 | 2 |
| Inventory | 14 | 4 | 9 | 1 |
| Maintenance | 14 | 2 | 9 | 3 |
| Notifications | 9 | 4 | 5 | 0 |
| Dashboard & Reports | 14 | 2 | 9 | 3 |
| AI Triage | 12 | 5 | 6 | 1 |
| Attachments | 9 | 4 | 5 | 0 |
| Organization | 11 | 0 | 10 | 1 |
| Realtime | 6 | 2 | 3 | 1 |
| Config & Health | 8 | 3 | 3 | 2 |
| Frontend UI | 50 | 4 | 28 | 18 |
| Bảo mật | 15 | 5 | 8 | 2 |
| Performance | 14 | 1 | 9 | 4 |
| Edge cases | 14 | 2 | 8 | 4 |
| **Tổng** | **~338** | **~88** | **~196** | **~54** |

---

## 🧰 Hướng dẫn chạy test

### Quick API smoke (PowerShell)
```powershell
# Helper functions
function Login($user, $pw) {
    $r = Invoke-RestMethod -Uri 'http://localhost:3001/auth/login' -Method POST `
         -ContentType 'application/json' -Body "{`"loginName`":`"$user`",`"password`":`"$pw`"}"
    return $r.accessToken
}

$admin = Login 'admin.bootstrap' 'ChangeMe@2026'
$manager = Login 'demo.manager1' 'ChangeMe@2026'
$tech = Login 'demo.tech1' 'ChangeMe@2026'
$reporter = Login 'demo.reporter1' 'ChangeMe@2026'

# Test 1: List incidents (INC-C-01)
Invoke-RestMethod -Uri 'http://localhost:3001/incidents?limit=10' `
    -Headers @{ Authorization = "Bearer $admin" } | Format-List

# Test 2: Trigger AI (AI-01)
$inc = Invoke-RestMethod -Uri 'http://localhost:3001/incidents?limit=1' `
    -Headers @{ Authorization = "Bearer $admin" }
$req = Invoke-RestMethod -Uri "http://localhost:3001/ai/incidents/$($inc.items[0].id)/analyze" `
    -Method POST -Headers @{ Authorization = "Bearer $admin" }
$req | Format-List

# Test 3: Poll AI (AI-03)
Start-Sleep -Seconds 4
Invoke-RestMethod -Uri "http://localhost:3001/ai/requests/$($req.requestId)" `
    -Headers @{ Authorization = "Bearer $admin" } | Format-List
```

### Manual UI walkthrough
1. Mở http://localhost:3000 → tự redirect đến `/login`
2. Login `admin.bootstrap` / `ChangeMe@2026`
3. Sidebar hiển thị 12 menu items
4. Click `/dashboard` → 4 KPI cards + 2 charts
5. Click `/incidents` → bảng incidents, search, filter
6. Click vào 1 incident → detail page với chat + **AI panel**
7. Click "Phân tích AI" → status: QUEUED → RUNNING → SUCCEEDED
8. Verify output có `category`, `priority`, `summary`, `actions`
9. Check `/notifications` → unread count badge cập nhật
10. Check `/audit-logs` → có entry `incident.ai.analyze`

### Test report template

| Test ID | Mô tả | Trạng thái | Ghi chú | Screenshot |
|---------|-------|------------|---------|------------|
| AUTH-01 | Login admin | ✅ PASS | | |
| INC-S-01 | NEW → IN_PROGRESS | ❌ FAIL | "WO_INVALID_TRANSITION" | link |
| … | … | … | … | |

---

## ✅ Sign-off Checklist

- [ ] Tất cả **P0 (88 test)** PASS
- [ ] Không có bug Critical/Blocker
- [ ] Không có memory leak (chạy 30 phút)
- [ ] API p95 < 200ms cho list endpoints
- [ ] Web load time < 1s (production build)
- [ ] Audit log ghi đầy đủ các thao tác thay đổi
- [ ] RBAC enforce đúng (test với 4 roles)
- [ ] AI Triage output schema đúng
- [ ] Tất cả routes trả 200 (UI smoke 23 routes)
- [ ] Vietnamese UI đầy đủ, không có i18n key lộ

---

**Maintainer:** Ghi chú mọi bug tìm được vào issue mới với format `[Test-ID] Mô tả ngắn` để dễ trace.