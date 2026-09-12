# EquipCare AI — API Service

NestJS 10 REST API. Cổng vào cho toàn bộ hệ thống (frontend SPA, mobile, tích hợp ngoài).

## Tech stack

| Layer | Công nghệ | Lý do |
|---|---|---|
| HTTP | NestJS 10 (Express) | Cấu trúc module rõ ràng, DI mạnh |
| ORM | Prisma 5 | Type-safe, migration dễ |
| Auth | `@nestjs/jwt` + `passport-jwt` + bcrypt | Chuẩn JWT access + opaque refresh cookie |
| Validation | `class-validator` + `class-transformer` | DTO-based request validation |
| Docs | `@nestjs/swagger` | Tự sinh OpenAPI spec |
| Tests | `jest` + `supertest` | E2E thật qua HTTP |

## Cấu trúc thư mục

```
src/
├── main.ts                  Bootstrap (helmet, CORS, cookie-parser, Swagger, ValidationPipe)
├── app.module.ts            Root module: ConfigModule + PrismaModule + HealthModule + AuthModule + IamModule + OrganizationModule + SystemConfigModule
├── prisma/                  PrismaService singleton (re-export từ @equipcare/backend-core)
├── common/
│   ├── decorators/          @Public(), @CurrentUser(), @Permissions()
│   ├── guards/              PermissionGuard
│   ├── filters/             HttpExceptionFilter (map AppError + Prisma errors)
│   ├── types/               AuthenticatedUser (JWT payload + permissions + scopes)
│   └── utils/               crypto.util (SHA-256 hash cho refresh token)
├── modules/
│   ├── auth/                Login / refresh / logout / change-password
│   ├── iam/                 Users CRUD + roles grant/revoke + audit-logs reader
│   ├── organization/        Departments / locations (tree) / asset-types
│   ├── config/              system-settings (ngưỡng nghiệp vụ)
│   ├── asset/               Assets CRUD + lifecycle (manual_state) + QR (FR-ASSET-01..09)
│   ├── attachment/          Files STAGED→READY + magic bytes + per-doc RBAC
│   ├── technical-documents/ Tài liệu kỹ thuật + version + role access
│   └── health/              /healthz, /healthz/live, /healthz/ready
└── test/                    E2E specs (jest + supertest, skip khi DB không có)
```

## Module guide (đọc theo thứ tự này)

1. **[Health](src/modules/health)** — đơn giản nhất, làm pattern tham khảo.
2. **[Auth](src/modules/auth)** — JWT + bcrypt + cookie. Bắt buộc cho mọi module sau.
3. **[IAM](src/modules/iam)** — pattern CRUD + permission guard.
4. **[Organization](src/modules/organization)** — pattern tree (locations).
5. **[Config](src/modules/config)** — pattern key-value store + audit.
6. **[Asset](src/modules/asset)** — CRUD + state machine + QR PNG.
7. **[Attachment](src/modules/attachment)** — multipart upload + STAGED→READY + magic bytes.
8. **[TechnicalDocument](src/modules/technical-documents)** — version + per-doc RBAC.

## Chạy dev

```bash
# Yêu cầu: Postgres 16 đang chạy ở localhost:5432
pnpm dev              # tsx watch src/main.ts
pnpm test             # e2e (auto-skip khi DB không có)
pnpm lint             # eslint
pnpm typecheck        # tsc --noEmit
pnpm build            # tsc -p tsconfig.json
```

Mặc định chạy port 3001 (đổi qua `API_PORT`). Swagger UI ở `/docs`.

## Quy tắc chung (Doc02 §NFR)

| Quy tắc | Áp dụng |
|---|---|
| Mọi route đều CẦN Bearer token | JwtAuthGuard global; `@Public()` cho login/refresh/healthz |
| Permission check qua `@Permissions('xxx:yyy:zzz')` | PermissionGuard trên controller |
| Audit mọi write quan trọng | `writeAudit(...)` từ `@equipcare/backend-core` (best-effort) |
| Password ≥ 12 ký tự + complexity | class-validator `@Matches` regex chung |
| Idempotent grant role | re-grant cùng role = no-op; reactivate nếu đã revoke |
| Hash password cost 10 | bcrypt (auth.service.ts) |
| Refresh cookie HttpOnly + SameSite=Lax | secure khi prod |
| Transaction cho mọi multi-write | `prisma.$transaction(...)` (auth.change-password, iam.reset-password, ...) |

## Endpoints (M1 + M2 + M3)

Xem Swagger UI `/docs` để có spec đầy đủ. Tóm tắt:

| Prefix | Permission cần | Mục đích |
|---|---|---|
| `/healthz` | public | Healthcheck (liveness, readiness) |
| `/auth/*` | public + cookie | Login / refresh / logout / change-password |
| `/iam/*` | `iam:user:read` hoặc `iam:user:manage` hoặc `iam:role:manage` | Users + roles + audit |
| `/departments`, `/locations`, `/asset-types` | `iam:user:read` / `iam:user:manage` | Tổ chức & danh mục |
| `/system-settings` | public read, `system-config:update` write | Ngưỡng nghiệp vụ |
| `/assets`, `/assets/:id`, `/assets/:id/lifecycle`, `/assets/:id/qr` | `asset:read` / `asset:create` / `asset:update` | Thiết bị + QR |
| `/files` (POST multipart), `/files/:id`, `/files/:id/link`, `/files/:id/download`, DELETE `/files/:id` | `attachment:upload` / `attachment:read` | Upload + link + download |
| `/technical-documents`, `/technical-documents/:id`, `/technical-documents/:id/versions`, `/technical-documents/:id/roles` | `asset:read` / `asset:update` | Tài liệu kỹ thuật + version + RBAC |

## Permission codes

Xem `packages/shared/src/permissions/permission.constant.ts` để có danh sách đầy đủ.
Permission mặc định gán cho role có trong seed (`pnpm db:seed`).

## Audit log

- Bảng `audit_logs` (Doc04 §5.7).
- Ghi tự động qua `writeAudit(input, tx?)` — best-effort, KHÔNG fail request nếu ghi lỗi.
- Đọc qua `GET /iam/audit-logs` (admin).
