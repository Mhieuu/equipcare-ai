# EquipCare AI — Hệ thống quản lý bảo trì thiết bị

**Tài liệu mô tả sản phẩm & vận hành chi tiết**
Phiên bản: 1.0 — Ngày phát hành: 13/09/2026

---

## Mục lục

1. [Tổng quan sản phẩm](#1-tổng-quan-sản-phẩm)
2. [Kiến trúc hệ thống](#2-kiến-trúc-hệ-thống)
3. [Công nghệ sử dụng](#3-công-nghệ-sử-dụng)
4. [Cấu trúc dự án](#4-cấu-trúc-dự-án)
5. [Mô hình dữ liệu](#5-mô-hình-dữ-liệu)
6. [Phân quyền & Vai trò](#6-phân-quyền--vai-trò)
7. [Hướng dẫn vận hành theo từng vai trò](#7-hướng-dẫn-vận-hành-theo-từng-vai-trò)
8. [Quy trình nghiệp vụ chính](#8-quy-trình-nghiệp-vụ-chính)
9. [State machine & Ràng buộc](#9-state-machine--ràng-buộc)
10. [AI Module](#10-ai-module)
11. [Báo cáo & Thống kê](#11-báo-cáo--thống-kê)
12. [Bảo mật](#12-bảo-mật)
13. [Triển khai](#13-triển-khai)
14. [Tài khoản demo](#14-tài-khoản-demo)
15. [Phụ lục](#15-phụ-lục)

---

## 1. Tổng quan sản phẩm

### 1.1. Giới thiệu

**EquipCare AI** là hệ thống quản lý bảo trì thiết bị toàn diện, được thiết kế theo mô hình Clean Architecture, hỗ trợ doanh nghiệp quản lý toàn bộ vòng đời thiết bị từ khi đưa vào vận hành đến khi ngừng sử dụng. Hệ thống tích hợp module AI để hỗ trợ phân loại sự cố và đề xuất hướng xử lý.

### 1.2. Vấn đề giải quyết

- Thiếu tập trung hóa trong quản lý danh mục thiết bị, vị trí, lịch sử bảo trì
- Phản ứng chậm với sự cố do quy trình thủ công, giấy tờ
- Khó kiểm soát chi phí bảo trì, không có dữ liệu để phân tích
- Phân công công việc cho kỹ thuật viên thiếu công bằng, không theo dõi được tiến độ
- Không có cơ chế cảnh báo sớm về hàng tồn kho, lịch bảo trì
- Thiếu audit trail, khó truy vết lịch sử thao tác

### 1.3. Tính năng chính

| Nhóm | Tính năng |
|---|---|
| **Quản lý thiết bị** | CRUD thiết bị, mã QR, lịch sử vòng đời, trạng thái vận hành |
| **Quản lý sự cố** | Báo cáo sự cố, phân loại, trao đổi (chat), chuyển trạng thái, tự động tạo WO |
| **Quản lý công việc (WO)** | Tạo WO thủ công / từ sự cố / từ bảo trì, Kanban, SLA, gán KTV |
| **Phê duyệt** | Đề xuất mua phụ tùng, phê duyệt/từ chối, lịch sử revision |
| **Quản lý kho** | Phụ tùng, nhập/xuất/chuyển/trả, cảnh báo tồn thấp |
| **Bảo trì định kỳ** | Kế hoạch theo tuần/tháng/quý/năm, tự sinh WO |
| **AI Hỗ trợ** | Phân loại sự cố, gợi ý mức độ ưu tiên |
| **Dashboard & Báo cáo** | KPI theo thời gian thực, xuất CSV |
| **IAM** | Quản lý người dùng, phân vai trò, scope dữ liệu |
| **Audit Log** | Ghi nhận mọi hành động quan trọng |
| **Realtime** | WebSocket đẩy thông báo tức thì |

### 1.4. Đối tượng sử dụng

- **Nhà máy sản xuất** (cơ khí, thực phẩm, hóa chất, dệt may)
- **Cơ sở hạ tầng** (trạm bơm, trạm điện, hệ thống HVAC)
- **Tòa nhà thương mại** (hệ thống kỹ thuật)
- **Bệnh viện** (thiết bị y tế có bảo trì)

---

## 2. Kiến trúc hệ thống

### 2.1. Sơ đồ tổng quan

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                              │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐         │
│   │   Web App    │   │   Mobile*    │   │  3rd Party   │         │
│   │  (Next.js)   │   │  (PWA)       │   │  Integration │         │
│   └──────┬───────┘   └──────┬───────┘   └──────┬───────┘         │
└──────────┼──────────────────┼──────────────────┼─────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                          API Gateway                              │
│              NestJS 10 — REST + WebSocket                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Modules: Auth, IAM, Asset, Incident, WO, Approval,       │  │
│  │           Inventory, Maintenance, Notification, AI, ...    │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────┬──────────────────┬──────────────────┬─────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────────┐  ┌──────────────┐  ┌─────────────────┐
│   PostgreSQL 17  │  │    Redis     │  │  AI Provider    │
│  (Prisma ORM)    │  │   (Queue)    │  │  (Mock/OpenAI)  │
└──────────────────┘  └──────────────┘  └─────────────────┘
           ▲                  ▲                  ▲
           │                  │                  │
┌──────────┴──────────────────┴──────────────────┴─────────────────┐
│                      Worker (BullMQ)                              │
│         Scheduler | AI Processor | Email | Notification          │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2. Clean Architecture (Backend)

Mỗi module NestJS được tổ chức 3 lớp:

```
modules/<feature>/
├── <feature>.controller.ts   ← Presentation: nhận request, validate
├── <feature>.service.ts      ← Application: orchestration, transactions
├── <feature>.repository.ts   ← Infrastructure: truy cập Prisma
└── dto/                      ← Input/Output contracts
```

**Nguyên tắc**:
- Controller không gọi Prisma trực tiếp
- Service chứa business logic, đảm bảo transaction boundary
- State machine tách riêng (`state-machine/`)
- Domain logic thuần (test được không cần DB) ở `packages/backend-core`

### 2.3. Frontend Architecture

```
apps/web/src/
├── app/                    ← Next.js App Router (route groups)
│   ├── (main)/             ← Layout chính (AuthGuard)
│   │   ├── dashboard/
│   │   ├── assets/
│   │   ├── incidents/
│   │   ├── work-orders/
│   │   ├── approvals/
│   │   ├── inventory/
│   │   ├── maintenance/
│   │   ├── notifications/
│   │   ├── reports/
│   │   └── iam/
│   ├── login/
│   └── layout.tsx
├── components/             ← Shared UI (DataTable, Modal, Badges...)
├── lib/
│   ├── api.ts              ← API client với auto refresh token
│   ├── auth.ts             ← Zustand store (persisted)
│   └── socket.ts           ← Socket.IO client
└── hooks/
```

**Nguyên tắc**:
- Tách presentation (jsx) và logic (hooks/functions)
- Dùng TanStack Query cho server state, Zustand cho client state
- Component nhận props rõ ràng, không fetch trực tiếp (trừ page-level)

---

## 3. Công nghệ sử dụng

### 3.1. Backend

| Công nghệ | Vai trò | Lý do chọn |
|---|---|---|
| **NestJS 10** | Framework chính | DI, module system, ecosystem mạnh |
| **TypeScript 5.5** | Ngôn ngữ | Type safety end-to-end |
| **Prisma 5** | ORM | Type-safe queries, migration |
| **PostgreSQL 17** | Database | ACID, JSON, triggers |
| **JWT** | Auth | Stateless, phù hợp SPA |
| **bcryptjs** | Hash password | Đơn giản, đủ tốt |
| **Joi** | Validation env | Schema validation |
| **class-validator** | Validation DTO | Tích hợp NestJS |
| **Socket.IO** | Realtime | Fallback, rooms |
| **BullMQ** | Job queue | Retry, schedule, dashboard |
| **Helmet** | Security headers | Best practice |
| **Passport.js** | Auth strategy | JWT strategy |

### 3.2. Frontend

| Công nghệ | Vai trò | Lý do chọn |
|---|---|---|
| **Next.js 14** | Framework | App Router, SSR/SSG |
| **React 18** | UI library | Concurrent features |
| **TypeScript 5.5** | Ngôn ngữ | Chia sẻ types với backend |
| **Tailwind CSS** | Styling | Utility-first, nhanh |
| **TanStack Query v5** | Server state | Cache, retry, optimistic |
| **Zustand** | Client state | Đơn giản hơn Redux |
| **react-hook-form** | Forms | Performance, validation |
| **Zod** | Schema validation | Type-safe runtime |
| **date-fns** | Date utils | Tree-shakeable |
| **lucide-react** | Icons | Nhẹ, đẹp |
| **socket.io-client** | Realtime | Đồng bộ với backend |

### 3.3. Shared Packages

| Package | Mô tả |
|---|---|
| `@equipcare/shared` | Enums (WorkOrderStatus, IncidentPriority...), labels tiếng Việt, constants |
| `@equipcare/backend-core` | State machines, domain logic, scheduler, audit helper, RBAC policy |

Cả hai hỗ trợ **dual ESM/CJS** để vừa dùng cho Next.js (ESM) vừa NestJS (CJS).

### 3.4. DevOps

- **Docker Compose**: PostgreSQL + Redis + MinIO (S3-compatible) cho local
- **pnpm workspaces**: Monorepo
- **ESLint + Prettier**: Code style
- **Jest + Supertest**: E2E tests
- **GitHub Actions** (planned): CI/CD

---

## 4. Cấu trúc dự án

```
equipcare-ai/
├── apps/
│   ├── api/                          ← NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/              ← env validation
│   │   │   ├── common/              ← decorators, guards, filters
│   │   │   ├── modules/             ← 18 nghiệp vụ modules
│   │   │   │   ├── auth/
│   │   │   │   ├── iam/
│   │   │   │   ├── asset/
│   │   │   │   ├── incident/
│   │   │   │   ├── work-order/
│   │   │   │   ├── approval/
│   │   │   │   ├── inventory/
│   │   │   │   ├── cost-entry/
│   │   │   │   ├── maintenance-plan/
│   │   │   │   ├── notification/
│   │   │   │   ├── ai/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── report/
│   │   │   │   ├── attachment/
│   │   │   │   ├── organization/
│   │   │   │   ├── realtime/
│   │   │   │   └── health/
│   │   │   └── state-machine/       ← state transitions
│   │   └── prisma/
│   │       ├── schema.prisma        ← 25+ models
│   │       ├── migrations/          ← versioned SQL
│   │       ├── seed.ts              ← bootstrap
│   │       └── demo-seed.ts         ← rich demo data
│   ├── web/                          ← Next.js 14 frontend
│   └── worker/                       ← BullMQ workers (scheduler, AI)
│
├── packages/
│   ├── shared/                       ← enums + labels (VI)
│   └── backend-core/                 ← state machines + scheduler + RBAC
│
├── docs/                             ← tài liệu dự án
├── docker-compose.yml                ← infra local
└── pnpm-workspace.yaml
```

---

## 5. Mô hình dữ liệu

### 5.1. Sơ đồ ER tổng quan

```
┌─────────────┐
│departments  │────────┐
└─────┬───────┘        │
      │                │
      │  ┌─────────────▼──────┐
      │  │ users               │
      │  │ (login_name UK,    │
      │  │  full_name,        │
      │  │  email,            │
      │  │  password_hash,    │
      │  │  auth_version)     │
      │  └─┬──────┬───────────┘
      │    │      │
      │    │      ▼
      │    │   ┌─────────────┐
      │    │   │ user_roles  │──┐
      │    │   └─────────────┘  │
      │    │                    ▼
      │    │   ┌──────────────────────┐
      │    │   │ access_scopes         │
      │    │   │ (GLOBAL|DEPT|        │
      │    │   │  LOCATION|ASSET|     │
      │    │   │  INCIDENT)           │
      │    │   └──────────────────────┘
      │    │
      │    ▼
      │  ┌──────────┐  ┌──────────────┐
      │  │ roles    │  │ permissions  │
      │  └────┬─────┘  └──────┬───────┘
      │       │               │
      │       └────┬──────────┘
      │            ▼
      │       role_permissions
      │
      ▼
┌──────────────────┐
│ assets           │ ← created_by
│ (qr_key UK,      │
│  manual_state,   │──┐
│  row_version)    │  │
└────┬──────┬──────┘  │
       │      │        │
       │      │        │
       ▼      ▼        ▼
┌────────┐ ┌──────────────┐ ┌──────────────┐
│incidents│ │work_orders  │ │maintenance_  │
│        │ │             │ │plans         │
└───┬────┘ └─┬──────┬────┘ └──────┬───────┘
    │        │      │             │
    │        │      ▼             ▼
    │        │   ┌─────────┐  maintenance_
    │        │   │ approvals│  occurrences
    │        │   └────┬────┘
    │        │        │
    ▼        ▼        ▼
  cost_entries  approval_revisions
                approval_events
                approval_revision_parts
                work_order_notes
                work_order_parts

┌──────────┐  ┌───────────────────┐  ┌─────────────────┐
│ parts    │  │ stock_transactions │  │ notifications   │
└────┬─────┘  └───────────────────┘  └─────────────────┘
     │
     └─────► part_asset_types

┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ audit_logs   │  │ ai_requests  │  │ system_      │
│              │  │              │  │ settings     │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 5.2. Các bảng chính

| Bảng | Mô tả | Số cột |
|---|---|---|
| `users` | Tài khoản người dùng | 13 |
| `roles` | Vai trò (ADMIN/MANAGER/TECHNICIAN/USER) | 6 |
| `permissions` | 48 quyền chi tiết | 5 |
| `role_permissions` | Ma trận vai trò ↔ quyền | 4 |
| `user_roles` | User được gán vai trò nào | 7 |
| `access_scopes` | Phạm vi dữ liệu user được thấy | 9 |
| `departments` / `locations` | Tổ chức | 8 |
| `asset_types` / `assets` | Danh mục thiết bị | 21 |
| `incidents` / `incident_messages` | Sự cố + chat | 19 + 7 |
| `work_orders` / `work_order_notes` | Công việc + ghi chú | 30 + 8 |
| `approvals` / `approval_revisions` / `approval_events` | Phê duyệt 3 lớp | 9 + 13 + 7 |
| `parts` / `stock_transactions` | Kho | 16 + 17 |
| `maintenance_plans` / `maintenance_occurrences` | Bảo trì định kỳ | 14 + 9 |
| `cost_entries` | Chi phí ghi nhận | 14 |
| `notifications` | Thông báo | 11 |
| `audit_logs` | Lịch sử thao tác | 13 |
| `ai_requests` | Yêu cầu xử lý AI | 17 |
| `system_settings` | Cấu hình hệ thống | 7 |

### 5.3. Quy ước

- **UUID v4** cho mọi primary key
- **snake_case** cho tên cột DB, **camelCase** trong Prisma client
- **`organization_id`** (department) cho mọi bảng nghiệp vụ (multi-tenant ready)
- **`created_at`, `updated_at`** luôn có, mặc định `now()`
- **`row_version`** cho optimistic locking (WO, approval, plan)
- **Soft delete**: trường `is_active` thay vì xóa thật
- **Money**: `numeric(18,2)` — không bao giờ dùng float
- **UTC**: mọi timestamp lưu UTC, frontend convert sang local

---

## 6. Phân quyền & Vai trò

### 6.1. Ma trận quyền

Hệ thống có **4 vai trò** chính và **48 quyền** (permission). Mỗi vai trò là một tập con các quyền.

#### Vai trò ADMIN (Quản trị hệ thống) — 48/48 quyền

```
✅ Toàn quyền trên hệ thống, bao gồm:
   • Quản lý user/role/permission
   • Cấu hình hệ thống (SLA, threshold, AI)
   • Xem tất cả audit log
   • Quản lý tài liệu kỹ thuật
   • Override mọi scope dữ liệu (GLOBAL scope)
```

#### Vai trò MANAGER (Quản lý) — 35 quyền

```
✅ Hầu hết quyền nghiệp vụ, NGOẠI TRỪ:
   ✗ asset:delete
   ✗ iam:* (quản lý user)
   ✗ audit:read:all
   ✗ threshold:manage
   ✗ inventory:adjust (chỉnh sửa tồn kho thủ công)
   ✗ inventory:transfer

✅ Có thể:
   • Phê duyệt đề xuất mua phụ tùng (approval:decide)
   • Phân công WO (work-order:assign)
   • Đóng sự cố (incident:close)
   • Xuất báo cáo (report:export)
   • Cấu hình threshold phê duyệt (system-config:update)
```

#### Vai trò TECHNICIAN (Kỹ thuật viên) — 18 quyền

```
✅ Tập trung vào xử lý sự cố & WO:
   • Tạo incident, thêm message
   • Tạo đề xuất phê duyệt (approval:create + submit)
   • Nhập/xuất kho (issue, return)
   • Chuyển trạng thái WO (transition, complete)
   • Ghi nhận chi phí (cost:create)
   • Upload tệp đính kèm

✗ KHÔNG có:
   • Phê duyệt (approval:decide) — tránh tự duyệt
   • Phân công WO (work-order:assign) — chờ manager
   • Quản lý user / hệ thống
   • Xóa asset
```

#### Vai trò USER (Người dùng / Người báo cáo sự cố) — 5 quyền

```
✅ Tối giản — chỉ để báo cáo sự cố:
   • Xem danh sách thiết bị (asset:read)
   • Tạo sự cố mới (incident:create)
   • Xem sự cố của mình (incident:read)
   • Upload tệp đính kèm

✗ KHÔNG xem WO, không tạo đề xuất, không xem chi phí
```

### 6.2. Bảng 48 quyền

| Nhóm | Quyền | Mô tả |
|---|---|---|
| **Asset** | `asset:read`, `asset:create`, `asset:update`, `asset:delete` | Quản lý thiết bị |
| **Incident** | `incident:create`, `incident:read`, `incident:transition`, `incident:message:create`, `incident:triage`, `incident:close`, `incident:reject` | Sự cố |
| **Work Order** | `work-order:create`, `work-order:read`, `work-order:assign`, `work-order:transition`, `work-order:complete`, `work-order:cancel`, `work-order:dispatch:read` | Công việc |
| **Approval** | `approval:create`, `approval:draft:update`, `approval:submit`, `approval:decide`, `approval:request-info`, `approval:cancel`, `approval:queue:read` | Phê duyệt |
| **Inventory** | `inventory:part:read`, `inventory:part:create`, `inventory:issue`, `inventory:receipt`, `inventory:transfer`, `inventory:adjust`, `inventory:return` | Kho |
| **Cost** | `cost:read`, `cost:create` | Chi phí |
| **Maintenance** | `maintenance:plan:read`, `maintenance:plan:manage` | Bảo trì |
| **Dashboard** | `dashboard:view` | Xem dashboard |
| **Report** | `report:export` | Xuất báo cáo |
| **IAM** | `iam:user:read`, `iam:user:manage`, `iam:role:read`, `iam:role:manage` | Quản lý người dùng |
| **Threshold** | `threshold:manage` | Ngưỡng phê duyệt |
| **Attachment** | `attachment:upload`, `attachment:read` | Tệp đính kèm |
| **Queue** | `incident:queue:read`, `approval:queue:read` | Hàng đợi |
| **Audit** | `audit:read:all` | Audit log |
| **System** | `system-config:update` | Cấu hình hệ thống |
| **Document** | `document:read` | Tài liệu kỹ thuật |

### 6.3. Access Scope (Phạm vi dữ liệu)

Ngoài permission, mỗi `user_role` còn có `access_scope` quyết định **user thấy dữ liệu nào**:

| Loại scope | Ý nghĩa |
|---|---|
| **GLOBAL** | Thấy tất cả (Admin) |
| **DEPARTMENT** | Chỉ thấy dữ liệu thuộc 1 phòng ban |
| **LOCATION** | Chỉ thấy thiết bị tại 1 vị trí |
| **ASSET** | Chỉ thấy 1 thiết bị cụ thể |
| **INCIDENT** | Chỉ thấy 1 sự cố (reporter) |

**Áp dụng**: Khi list asset/incident/WO, hệ thống tự động thêm filter theo scope của user hiện tại.

### 6.4. Kiểm tra quyền 2 lớp

```
Request → AuthGuard (JWT valid?)
       → @Permissions('xxx') (decorator on controller)
       → PermissionGuard (user có quyền?)
       → Service (kiểm tra ownership/scope)
```

---

## 7. Hướng dẫn vận hành theo từng vai trò

### 7.1. Quản trị viên (ADMIN)

**Mục tiêu**: Quản trị, cấu hình, giám sát toàn hệ thống.

#### Đăng nhập

```
URL: http://<host>:3000/login
Tài khoản: admin.bootstrap (mặc định)
Mật khẩu: ChangeMe@2026 (đổi ngay lần đầu)
```

#### Quản lý người dùng

1. Vào **IAM → Người dùng** (`/iam/users`)
2. Click **Tạo người dùng mới** → điền form:
   - Tên đăng nhập (duy nhất)
   - Họ và tên
   - Email
   - Đơn vị
3. Click chi tiết user → tab **Vai trò**:
   - Chọn vai trò (Admin/Manager/Technician/User)
   - Click **Cấp vai trò**
4. Cấu hình phạm vi dữ liệu (scope) nếu cần giới hạn

#### Cấu hình hệ thống

1. **SLA**: Vào `/system-settings` → chỉnh `sla.high_seconds` / `sla.medium_seconds` / `sla.low_seconds`
2. **Ngưỡng chi phí phê duyệt**: `approval.threshold_cost` (VND)
3. **AI timeout**: `ai.timeout_ms`, `ai.max_retries`
4. **File upload limit**: `file.size_limit_bytes`, `file.mime_allowlist`

#### Xem audit log

1. **IAM → Nhật ký** (`/iam/audit-logs`)
2. Lọc theo: hành động, đối tượng, người thực hiện, khoảng thời gian
3. Click 1 dòng để xem `old_value` / `new_value` (snapshot)

#### Giám sát

- Dashboard hiển thị tổng quan 24/7
- Có thể impersonate user khác để debug (chức năng nâng cao)

---

### 7.2. Quản lý (MANAGER)

**Mục tiêu**: Quản lý tổng thể, phê duyệt, phân công, theo dõi tiến độ.

#### Đăng nhập & điều hướng

```
URL: http://<host>:3000/login
Tài khoản: demo.manager1 / Demo@2026
```

Sidebar bao gồm: Dashboard, Thiết bị, Sự cố, WO, Phê duyệt, Kho, Bảo trì, Báo cáo.

#### Quản lý sự cố

**Phân loại sự cố**:
1. Vào **Sự cố** (`/incidents`) → chọn status `NEW` hoặc `AWAITING_INFO`
2. Click vào sự cố → xem chi tiết
3. Tab **Tin nhắn** xem chat giữa người báo cáo và KTV
4. Nếu cần thêm thông tin → click **Yêu cầu bổ sung** (trạng thái → `AWAITING_INFO`)
5. Khi đủ thông tin → click **Phân loại** (chọn mức độ ưu tiên LOW/MEDIUM/HIGH/CRITICAL + category)

**Đóng sự cố**:
1. Vào sự cố đã `RESOLVED`
2. Click **Đóng** → nhập lý do → xác nhận
3. Hệ thống tự cập nhật `closed_at` và `closed_by`

**Từ chối sự cố**:
1. Nếu sự cố không hợp lệ → click **Từ chối** → nhập lý do
2. Trạng thái → `CANCELLED`

#### Phân công Work Order

**Tạo WO từ sự cố**:
1. Vào sự cố đã phân loại → click **Tạo WO**
2. Form mở sẵn với asset, priority từ incident
3. Chọn loại WO: REPAIR / MAINTENANCE / INSPECTION
4. Click **Tạo** → WO được tạo với status `NEW`

**Phân công KTV**:
1. Vào WO ở trạng thái `NEW` → click **Gán KTV**
2. Chọn KTV từ danh sách (chỉ những user có role TECHNICIAN)
3. Click **Gán** → WO chuyển `ASSIGNED`

**Theo dõi**:
- Dashboard hiển thị WO quá hạn
- Tab **WO quá hạn** ở dashboard liệt kê chi tiết

#### Phê duyệt đề xuất

**Xem hộp thư phê duyệt**:
1. Vào **Phê duyệt** (`/approvals`) → tab **Chờ duyệt của tôi**
2. Mỗi approval hiển thị: WO liên quan, danh sách phụ tùng, tổng chi phí

**Phê duyệt**:
1. Click vào approval → xem chi tiết revision
2. Đọc lý do, action plan, các phụ tùng đề xuất
3. Nếu OK → click **Phê duyệt** → nhập ghi chú → xác nhận
4. Hệ thống kiểm tra: **không được tự duyệt đề xuất của chính mình**

**Từ chối**:
1. Click **Từ chối** → nhập lý do chi tiết
2. Approval → `REJECTED`, revision sau có thể tạo

**Yêu cầu bổ sung**:
1. Click **Yêu cầu thêm thông tin** → nhập câu hỏi
2. Proposer nhận notification, có thể tạo revision mới

#### Quản lý kho

**Xem tồn kho**:
1. Vào **Kho → Phụ tùng** (`/inventory/parts`)
2. Bật filter **Sắp hết hàng** → danh sách parts có `on_hand < minimum_stock`
3. Hệ thống tự tạo notification khi tồn thấp

**Nhập kho**:
1. Click **Nhập kho** trên dòng phụ tùng
2. Nhập số lượng, đơn giá, lý do → xác nhận
3. Hệ thống tạo `stock_transactions` type=RECEIPT, cập nhật `on_hand`

#### Xuất báo cáo

1. Vào **Báo cáo** (`/reports`)
2. Chọn loại:
   - **Báo cáo WO**: danh sách + trạng thái + thời gian
   - **Báo cáo Chi phí**: gộp theo WO / phòng ban / thời gian
   - **Báo cáo Tính quan trọng thiết bị**: incidents + costs → ranking
3. Click **Tải CSV** → file tải về

---

### 7.3. Kỹ thuật viên (TECHNICIAN)

**Mục tiêu**: Xử lý sự cố, hoàn thành WO, đề xuất mua phụ tùng.

#### Đăng nhập

```
URL: http://<host>:3000/login
Tài khoản: demo.tech1 / Demo@2026
```

#### Nhận & xử lý WO

**Xem WO được giao**:
1. Vào **WO** (`/work-orders`) → tab Kanban
2. Cột **Đang thực hiện** là WO của tôi
3. Click vào WO → xem chi tiết: mô tả, asset, SLA card

**Bắt đầu WO**:
1. Ở status `ASSIGNED` → click **Bắt đầu**
2. Hệ thống ghi `started_at`, chuyển `IN_PROGRESS`
3. SLA timer bắt đầu đếm

**Tạm dừng WO**:
1. Khi thiếu phụ tùng / chờ resource → click **Tạm dừng**
2. Chọn lý do: WAITING_PART / WAITING_RESOURCE / OTHER
3. Nhập ghi chú → SLA timer dừng

**Tiếp tục WO**:
1. Khi có phụ tùng → click **Tiếp tục**
2. SLA timer chạy tiếp

**Hoàn thành WO**:
1. Khi xong → click **Hoàn thành**
2. Điền form:
   - Nguyên nhân xác nhận (text)
   - Hành động đã thực hiện
   - Kết quả
   - Checklist (nếu có từ maintenance plan)
3. Click **Xác nhận** → status `COMPLETED`

**Đề xuất mua phụ tùng (nếu cần)**:
1. Trong WO detail → click **Tạo đề xuất**
2. Form: chọn phụ tùng, số lượng, lý do, action plan
3. Click **Gửi duyệt** → approval → `SUBMITTED`
4. Chờ Manager phê duyệt
5. Sau khi APPROVED → có thể xuất kho

**Xuất kho**:
1. Khi approval đã APPROVED → WO detail → tab **Phụ tùng**
2. Click **Xuất kho** trên phụ tùng
3. Nhập số lượng thực xuất, đơn giá
4. Hệ thống tạo `stock_transactions` type=ISSUE, `cost_entries` type=PART

**Ghi nhận chi phí nhân công**:
1. Trong WO → click **Ghi chi phí**
2. Chọn category: LABOR / OTHER
3. Nhập số giờ × đơn giá
4. Lưu

#### Xử lý sự cố (khi được phân loại)

1. Vào **Sự cố** → lọc status `TRIAGED` / `WO_CREATED`
2. Click vào sự cố → thêm message trao đổi với reporter
3. Nếu cần → tạo WO ngay từ sự cố

#### Xem thông báo

1. Click icon 🔔 ở sidebar → xem notification
2. Notification theo event:
   - `WORK_ORDER_ASSIGNED`: được gán WO mới
   - `APPROVAL_DECIDED`: đề xuất được duyệt/từ chối
   - `INVENTORY_LOW_STOCK` (cho Manager)
3. Realtime: socket tự push khi có event mới → toast hiển thị

---

### 7.4. Người dùng (USER / Reporter)

**Mục tiêu**: Báo cáo sự cố nhanh chóng khi phát hiện vấn đề.

#### Đăng nhập

```
URL: http://localhost:3000/login
Tài khoản: demo.reporter1 / Demo@2026
```

Sidebar tối giản: Dashboard, Thiết bị (chỉ xem), Sự cố.

#### Báo cáo sự cố

1. Vào **Sự cố** → click **Báo cáo sự cố mới**
2. Điền form:
   - **Thiết bị**: chọn từ dropdown (search theo mã hoặc tên)
   - **Mô tả**: chi tiết hiện tượng (tiếng kêu, rò rỉ, rung...)
   - **Tác động đến sản xuất**: ảnh hưởng bao nhiêu % công suất, có dừng chuyền không
   - **Tệp đính kèm**: ảnh/video clip (tối đa 25MB, định dạng cho phép)
3. Click **Gửi** → status `NEW`, chờ Manager phân loại
4. Hệ thống gửi notification cho Manager

#### Theo dõi sự cố của tôi

1. Vào **Sự cố** → mặc định filter "Của tôi"
2. Click vào sự cố → xem trạng thái hiện tại
3. Tab **Tin nhắn** xem phản hồi từ KTV/Manager
4. Nếu cần thêm thông tin → có thể reply

#### Xem thiết bị (read-only)

1. Vào **Thiết bị** → search theo tên/mã
2. Click để xem thông tin + lịch sử sự cố
3. Có thể in QR code dán lên thiết bị

#### Dashboard

- Xem KPI tổng quan (read-only)
- Số sự cố đang mở của tôi

---

## 8. Quy trình nghiệp vụ chính

### 8.1. Quy trình xử lý sự cố

```
┌─────────┐    Báo cáo     ┌────────────┐
│ Reporter├───────────────►│   NEW      │
└─────────┘                └──────┬─────┘
                                  │ Manager phân loại
                                  ▼
                            ┌────────────┐
                            │ TRIAGED    │
                            └──────┬─────┘
                                   │ Tạo WO
                                   ▼
                            ┌────────────┐
                            │ WO_CREATED │
                            └──────┬─────┘
                                   │ KTV xử lý xong
                                   ▼
                            ┌────────────┐
                            │ RESOLVED   │
                            └──────┬─────┘
                                   │ Manager đóng
                                   ▼
                            ┌────────────┐
                            │ CLOSED     │ (kết thúc)
                            └────────────┘

   Song song: có thể CANCELLED bất kỳ lúc nào (nếu sai/duplicate)
```

### 8.2. Quy trình Work Order

```
NEW ──gán KTV──► ASSIGNED ──bắt đầu──► IN_PROGRESS
                                              │
                                              ├──pause──► (pause_reason note)
                                              │              │
                                              │◄──resume────┤
                                              │
                                              ├──đề xuất mua PT──► WAITING_APPROVAL
                                              │                        │
                                              │                        │ (approval APPROVED)
                                              │◄───────────────────────┘
                                              │
                                              ▼
                                         COMPLETED
                                              │
                                              │ (sau khi đóng incident)
                                              ▼
                                       (có thể archive)

   Có thể CANCELLED ở bất kỳ trạng thái nào trước COMPLETED
```

### 8.3. Quy trình phê duyệt

```
DRAFT ──submit──► SUBMITTED ──┬──approve──► APPROVED ──► xuất kho được
                               │
                               ├──reject───► REJECTED ──► revision mới hoặc hủy
                               │
                               └──request_info─► INFO_REQUESTED ──► revision mới

   Quy tắc:
   • Không được tự duyệt (FR-APR-09, enforced by DB trigger)
   • Khi chi phí vượt threshold → bắt buộc phê duyệt
   • Mỗi lần revise → revision_no tăng, lưu snapshot policy
```

### 8.4. Quy trình bảo trì định kỳ

```
Scheduler (60s loop)
   │
   ├── 1. Active plan + FIXED recurrence
   │       → Sinh occurrence (PLANNED hoặc OVERDUE nếu quá hạn)
   │       → Advance next_due_on
   │
   ├── 2. Paused plan
   │       → Sinh occurrence SKIPPED
   │       → Advance next_due_on
   │
   ├── 3. Pending occurrence (PLANNED/OVERDUE) chưa có WO open
   │       → Tự tạo WO (kind=MAINTENANCE, mode=FROM_MAINTENANCE)
   │       → Snapshot checklist
   │
   └── 4. WO COMPLETED từ occurrence
           → Mark occurrence COMPLETED
```

### 8.5. Quy trình nhập/xuất kho

```
RECEIPT (nhập kho)        ISSUE (xuất cho WO)        RETURN (trả lại)
    │                          │                          │
    ▼                          ▼                          ▼
on_hand += qty           on_hand -= qty              on_hand += qty
cost_entries? No         cost_entries: PART DEBIT    cost_entries: PART CREDIT
                         (auto-created)
                                                          │
                                                          ▼
                                                  stock_tx_id trỏ về issue gốc
                                                  reverses_entry_id trong cost
```

**Đảm bảo tính nhất quán**:
- Mọi transaction kho đi trong transaction DB
- `operation_key` (UUID unique) chống double-spend
- Audit log mọi lần
- Phụ tùng `requires_approval` chỉ issue được khi approval APPROVED

---

## 9. State machine & Ràng buộc

### 9.1. Asset Manual State

```
NORMAL ──admin/system──► SUSPENDED ──admin──► RETIRED
   ▲                          │
   └────admin─────────────────┘ (mở lại vận hành)
```

- `state_reason` bắt buộc khi chuyển sang SUSPENDED/RETIRED
- Optimistic lock `row_version`

### 9.2. Incident Status

Xem sơ đồ 8.1.

### 9.3. Work Order Status

Xem sơ đồ 8.2. Lưu ý:
- `WAITING_APPROVAL` không phải state chính thức (chỉ là event note)
- Pause/Resume qua note `PAUSE_START`/`PAUSE_END`
- Optimistic lock `row_version`

### 9.4. Approval Status

Xem sơ đồ 8.3.

### 9.5. Maintenance Occurrence Status

```
PLANNED ──WO created──► IN_PROGRESS ──WO completed──► COMPLETED
   │
   │ (quá hạn nếu due_on < today)
   ▼
OVERDUE ──WO created──► IN_PROGRESS ...

   Hoặc
   SKIPPED (nếu plan PAUSED)
```

### 9.6. Ràng buộc quan trọng (Invariants)

| Ràng buộc | Cơ chế thực thi |
|---|---|
| WO chỉ complete được khi assignee khác null | Service layer |
| Không tự phê duyệt đề xuất của mình | DB trigger + service |
| Phụ tùng `requires_approval` không issue được khi chưa duyệt | Service layer |
| `on_hand >= 0` | Check constraint DB |
| Mỗi incident chỉ có 1 WO | Unique constraint `(incident_id)` |
| Mỗi user-role chỉ cấp 1 lần | Unique `(user_id, role_id)` |
| Audit log phải có actor + action + object | Service layer |
| Tất cả timestamp UTC | Application + DB default |
| `auth_version` increment khi đổi password → invalidate tất cả session | Service layer |
| Optimistic lock WO/Approval/Plan | `row_version` + WHERE clause |

---

## 10. AI Module

### 10.1. Kiến trúc

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Client gửi      │     │  POST /ai/triage │     │  AI Provider │
│  incident        │────►│  (HTTP 202)      │────►│  (Mock/OpenAI│
└──────────────────┘     └──────────┬───────┘     │   / Claude)  │
                                    │             └──────┬───────┘
                                    │                    │
                                    ▼                    ▼
                              ┌──────────┐        ┌────────────┐
                              │ai_requests│◄──────│  Result    │
                              │  QUEUED   │       │  structured│
                              └─────┬────┘        └────────────┘
                                    │
                                    ▼
                              GET /ai/requests/:id (poll)
                              → status COMPLETED + output_payload
```

### 10.2. Provider Abstraction

```typescript
interface AiProvider {
  analyze(input: AiInput): Promise<AiOutput>;
}
```

- **MockAiProvider** (mặc định local): trả kết quả ngẫu nhiên có kiểm soát
- **OpenAiProvider** (production): gọi GPT-4 với prompt template version

Factory chọn provider theo env `AI_PROVIDER`.

### 10.3. Output Validation

Mọi output AI phải qua Zod schema trước khi lưu DB. Nếu không hợp lệ → status `FAILED`, error_code = `INVALID_OUTPUT`.

### 10.4. Tính năng

#### INCIDENT_TRIAGE (FR-AI-01)
- **Input**: description, impact_description, asset_type
- **Output**:
  ```json
  {
    "severity": "LOW|MEDIUM|HIGH|CRITICAL",
    "category": "MECHANICAL|ELECTRICAL|OPERATIONAL",
    "confidence": 0.0-1.0,
    "recommendation": "string (Vietnamese)"
  }
  ```
- **Timeout**: 45s (configurable)
- **Retry**: 2 lần (configurable)

### 10.5. Fallback

Nếu AI service down → mock provider vẫn chạy (cho phép hệ thống không bị block).

---

## 11. Báo cáo & Thống kê

### 11.1. Dashboard KPIs

| KPI | Ý nghĩa | Công thức |
|---|---|---|
| WO đang mở | Số WO chưa COMPLETED/CANCELLED | COUNT WHERE status IN (NEW, ASSIGNED, IN_PROGRESS, WAITING_APPROVAL) |
| WO quá hạn | WO đã quá `due_at` và chưa xong | COUNT WHERE due_at < now() AND status NOT IN (COMPLETED, CANCELLED) |
| Pending Approvals | Approval chờ tôi duyệt | COUNT WHERE status=SUBMITTED AND approver_scope chứa user |
| Low stock parts | Parts `on_hand < minimum_stock` | COUNT |
| Unread notifications | Notification chưa đọc | COUNT WHERE read_at IS NULL AND recipient_id=me |

### 11.2. Dashboard Sections

1. **WO quá hạn** (top 5): mã WO, asset, ưu tiên, số giờ trễ
2. **Tải KTV**: biểu đồ số WO active / completed theo tuần
3. **Hành động cần làm**:
   - WO chờ gán
   - Sự cố chờ phân loại
   - Approval chờ duyệt
   - Bảo trì đến hạn

### 11.3. CSV Reports

| Báo cáo | Endpoint | Cột |
|---|---|---|
| Work Orders | `GET /reports/work-orders.csv` | code, asset, kind, priority, status, assignee, dates |
| Cost Summary | `GET /reports/cost-summary.csv` | WO, department, total_cost, by_category |
| Asset Criticality | `GET /reports/asset-criticality.csv` | asset, incident_count, total_cost, downtime_hours |

Filter: `?from=YYYY-MM-DD&to=YYYY-MM-DD&departmentId=...`

---

## 12. Bảo mật

### 12.1. Authentication

- **JWT Access Token**: 15 phút, lưu memory (Zustand)
- **Refresh Token**: 7 ngày, HttpOnly cookie (chống XSS)
- **Auto refresh**: api.ts tự gọi `/auth/refresh` khi access hết hạn (1 lần retry)
- **Logout**: clear tokens + revoke refresh trong DB

### 12.2. Password

- Hash bằng **bcrypt** cost 10 (production nên chuyển argon2id)
- Phải đổi mật khẩu lần đầu (`must_change_password=true` cho bootstrap)
- Độ dài tối thiểu: 8 ký tự (validate ở DTO)
- Đổi pass → `auth_version++` → invalidate mọi session cũ

### 12.3. Authorization

- 2 lớp: `@Permissions()` decorator + PermissionGuard + service-level ownership check
- Access Scope áp dụng cho mọi query list
- Không cho truy cập resource không thuộc scope (403)

### 12.4. Input Validation

- **class-validator** cho DTO
- **Zod** cho AI output
- **Joi** cho env variables
- Reject mọi input không match schema trước khi vào service

### 12.5. Headers & Network

- **Helmet**: set security headers (CSP, HSTS, X-Frame-Options)
- **CORS**: whitelist origins
- **Cookie SameSite=Lax** + **Secure** ở production
- **Rate limiting** (planned via @nestjs/throttler)

### 12.6. Audit

- Mọi hành động quan trọng ghi `audit_logs`:
  - `object_type` + `object_key` (UUID của entity)
  - `old_value` / `new_value` (JSON snapshot)
  - `correlation_key` để trace qua nhiều bảng
  - `actor_id` + `actor_type` (USER / SYSTEM)

### 12.7. Error Handling

- Custom `HttpExceptionFilter` map mọi lỗi về RFC 9457 Problem Details:
  ```json
  {
    "code": "VALIDATION_ERROR",
    "message": "Human readable",
    "traceId": "uuid-for-logging",
    "details": [...]
  }
  ```
- Không bao giờ trả stack trace cho client
- Server log đầy đủ cho debug

---

## 13. Triển khai

### 13.1. Yêu cầu môi trường

- Node.js >= 20
- pnpm >= 9
- PostgreSQL >= 15
- Redis >= 6 (cho queue)
- Docker + Docker Compose (khuyến nghị)

### 13.2. Cài đặt

```bash
# 1. Clone
git clone https://github.com/Mhieuu/equipcare-ai.git
cd equipcare-ai

# 2. Install deps
pnpm install

# 3. Khởi động infra
docker-compose up -d postgres redis minio

# 4. Copy env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local

# 5. Migrate
pnpm --filter @equipcare/api db:migrate:deploy

# 6. Seed bootstrap (admin + roles + permissions)
pnpm --filter @equipcare/api db:seed

# 7. (Optional) Seed demo data phong phú
pnpm --filter @equipcare/api db:demo-seed

# 8. Chạy dev
pnpm dev   # chạy song song api + web + worker
```

### 13.3. Build production

```bash
pnpm build       # build tất cả
pnpm start       # chạy production
```

### 13.4. Biến môi trường quan trọng

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/equipcare

# JWT
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001/ws

# AI
AI_PROVIDER=mock|openai
OPENAI_API_KEY=...
AI_TIMEOUT_MS=45000

# Worker
SCHEDULER_INTERVAL_MS=60000
```

### 13.5. Docker

File `docker-compose.yml` định nghĩa:
- `postgres`: PostgreSQL 17
- `redis`: Redis 7
- `minio`: S3-compatible storage (cho attachment production)

Có thể chạy full stack: `docker-compose -f docker-compose.full.yml up`

---

## 14. Tài khoản demo

### Bootstrap (từ seed.ts)

| Login | Password | Role |
|---|---|---|
| `admin.bootstrap` | `ChangeMe@2026` | ADMIN |

### Demo (từ demo-seed.ts)

| Login | Password | Role |
|---|---|---|
| `demo.manager1` | `Demo@2026` | MANAGER |
| `demo.manager2` | `Demo@2026` | MANAGER |
| `demo.tech1` | `Demo@2026` | TECHNICIAN |
| `demo.tech2` | `Demo@2026` | TECHNICIAN |
| `demo.tech3` | `Demo@2026` | TECHNICIAN |
| `demo.tech4` | `Demo@2026` | TECHNICIAN |
| `demo.reporter1` | `Demo@2026` | USER |
| `demo.reporter2` | `Demo@2026` | USER |
| `demo.reporter3` | `Demo@2026` | USER |

⚠️ **Lưu ý**: Mật khẩu `Demo@2026` chỉ dùng cho môi trường demo/local. Production phải đổi và dùng secret manager.

---

## 15. Phụ lục

### 15.1. Glossary (Thuật ngữ)

| Tiếng Anh | Tiếng Việt | Ý nghĩa |
|---|---|---|
| Asset | Thiết bị | Máy móc, dây chuyền cần bảo trì |
| Incident | Sự cố | Bất thường xảy ra, cần xử lý |
| Work Order (WO) | Lệnh công việc | Phiếu giao việc cho KTV |
| Approval | Phê duyệt | Đề xuất cần được duyệt trước khi thực hiện |
| Part / Spare | Phụ tùng | Linh kiện thay thế |
| Stock transaction | Giao dịch kho | Nhập / xuất / chuyển / trả |
| Maintenance plan | Kế hoạch bảo trì | Lịch bảo trì định kỳ |
| Occurrence | Lần bảo trì | Một lần thực hiện theo plan |
| KPI | Chỉ số hiệu suất | Số liệu tổng quan |
| SLA | Thỏa thuận mức dịch vụ | Thời gian tối đa xử lý |
| Scope | Phạm vi dữ liệu | User được thấy dữ liệu nào |
| RBAC | Role-Based Access Control | Phân quyền theo vai trò |

### 15.2. Tech Stack Versions

```
Node: 20.x
pnpm: 9.x
PostgreSQL: 17
NestJS: 10.4
Prisma: 5.20
Next.js: 14.2
React: 18.3
TypeScript: 5.5
Redis: 7
```

### 15.3. Đường dẫn API chính

```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
POST   /auth/change-password
GET    /auth/me

GET    /iam/users
POST   /iam/users
GET    /iam/users/:id
PATCH  /iam/users/:id
POST   /iam/users/:id/grant-role
POST   /iam/users/:id/revoke-role
GET    /iam/audit-logs
GET    /iam/me/permissions

GET    /assets
POST   /assets
GET    /assets/:id
PATCH  /assets/:id
DELETE /assets/:id
POST   /assets/:id/transitions
GET    /assets/:id/qr

GET    /incidents
POST   /incidents
GET    /incidents/:id
PATCH  /incidents/:id
POST   /incidents/:id/transitions
GET    /incidents/:id/messages
POST   /incidents/:id/messages

GET    /work-orders
POST   /work-orders
GET    /work-orders/:id
PATCH  /work-orders/:id
POST   /work-orders/:id/transitions
POST   /work-orders/:id/notes

GET    /approvals
POST   /approvals
GET    /approvals/:id
POST   /approvals/:id/revisions
POST   /approvals/:id/submit
POST   /approvals/:id/decide

GET    /inventory/parts
POST   /inventory/parts/:id/receipt
POST   /inventory/parts/:id/issue
POST   /inventory/parts/:id/return
GET    /inventory/transactions

GET    /maintenance-plans
POST   /maintenance-plans
GET    /maintenance-plans/:id
POST   /maintenance-plans/:id/pause
POST   /maintenance-plans/:id/resume

GET    /notifications
PATCH  /notifications/:id/read
POST   /notifications/mark-all-read

GET    /dashboard/kpis
GET    /dashboard/overdue
GET    /dashboard/technician-load
GET    /dashboard/action-items

GET    /reports/work-orders.csv
GET    /reports/cost-summary.csv
GET    /reports/asset-criticality.csv

POST   /ai/triage
GET    /ai/requests/:id

WS     /ws (Socket.IO)
```

### 15.4. Liên hệ & Đóng góp

- **Repository**: https://github.com/Mhieuu/equipcare-ai
- **Tác giả**: Trịnh Minh Hiếu
- **Ngày phát hành**: 09/2026

---

© 2026 EquipCare AI — Bản quyền thuộc về tác giả.
