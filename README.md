# EquipCare AI

AI-Powered Equipment Maintenance Management System — phạm vi P1 theo bộ tài liệu đính kèm (Spec + Document01..07).

> **Trạng thái**: đang chuẩn bị M0 (đóng băng baseline). Bắt đầu triển khai W1 (28/09/2026) sau khi đóng băng tài liệu theo [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) §0.

## Stack đã khóa

| Layer | Tech |
|---|---|
| Backend | **NestJS 10.x — baseline locked** · **Prisma 5.x — baseline locked** · PostgreSQL 16 · Redis 7 · BullMQ · Socket.IO |
| Worker | BullMQ — **app riêng** (`apps/worker`), chạy độc lập với API |
| Frontend | **Next.js 14.x — baseline locked** · **React 18.x — baseline locked** · TypeScript strict · Tailwind · shadcn/ui · TanStack Query · RHF + Zod |
| Storage | MinIO `RELEASE.2024-09-13T03-26-17Z` (S3-compatible, local) |
| AI | Provider abstraction · OpenAI Responses API (optional, smoke test only) · deterministic mock (default) |
| Test | Jest 29 (backend) · Vitest 1.x (frontend) · Supertest · Testcontainers · Playwright |
| Toolchain | **Node.js 22.x LTS — baseline locked** · pnpm 9 workspaces |

## Yêu cầu môi trường

- **Node.js**: 22.x LTS — baseline locked. **Không dùng Node 20** (đã EOL 2026-04).
- **pnpm**: 9.x — `npm i -g pnpm@9`
- **Docker Desktop** (Windows/Mac) hoặc Docker Engine + Compose v2
- **OS**: Windows 10/11 (PowerShell hoặc Git Bash/WSL), macOS 12+, Ubuntu 22.04+
- Ổ đĩa trống tối thiểu 5 GB cho Postgres + MinIO data

## Chạy nhanh (dev)

### Windows (PowerShell)

```powershell
# 0. Lấy source
git clone https://github.com/Mhieuu/equipcare-ai.git
cd equipcare-ai

# 1. Cài dependencies
pnpm install

# 2. Sao chép biến môi trường (KHÔNG commit .env)
Copy-Item .env.example .env

# 3. Khởi động hạ tầng (infra)
pnpm infra:up

# 4. Tạo schema + seed demo
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed

# 5. Chạy dev: API + Web + Worker (trên hạ tầng đã có)
pnpm dev
```

### Linux / macOS / Git Bash / WSL

```bash
git clone https://github.com/Mhieuu/equipcare-ai.git
cd equipcare-ai
pnpm install
cp .env.example .env
pnpm infra:up
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed
pnpm dev
```

### Chạy full stack bằng Docker (demo)

```bash
# Chạy toàn bộ hệ thống (API + Web + Worker + hạ tầng) trong Docker
pnpm demo:up

# Dừng
pnpm demo:down
```

> **Phân biệt `pnpm dev` vs `pnpm demo:up`**: `pnpm dev` chạy apps trên máy host, kết nối hạ tầng qua Docker. `pnpm demo:up` đóng gói toàn bộ (API + Web + Worker + infra) vào Docker containers. Không dùng cả hai cùng lúc — tránh trùng cổng và trùng worker.

> **Worker là app NestJS riêng** (`apps/worker`), chạy cùng lúc với API trong `pnpm dev`. Worker xử lý AI request (BullMQ), notification job, và PM scheduler. Không nhúng vào API để tránh block HTTP khi job nặng.

Sau khi chạy, truy cập:

| Dịch vụ | URL |
|---|---|
| Web (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| Swagger UI | http://localhost:3001/docs |
| MinIO Console | http://localhost:9001 (`minioadmin` / `minioadmin`) |

## Tài khoản demo (seed)

| Vai trò | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@123` |
| Manager (phòng SX) | `manager.sx` | `Manager@123` |
| Kỹ thuật viên | `ktv.sx01` | `Ktv@12345` |
| Người sử dụng | `reporter.sx01` | `Reporter@123` |

> ⚠️ Tài khoản chỉ dùng cho demo local. Đổi mật khẩu ngay nếu triển khai ngoài máy cá nhân.

## Scripts

| Lệnh | Mô tả |
|---|---|
| `pnpm dev` | Chạy API + Web + Worker (đồng thời) |
| `pnpm build` | Build production cho tất cả apps |
| `pnpm lint` | ESLint (root extends + TS) |
| `pnpm typecheck` | `tsc --noEmit` cho cả monorepo |
| `pnpm test` | Unit test (Jest backend + Vitest frontend) |
| `pnpm test:e2e` | E2E API (Supertest + Testcontainers) |
| `pnpm test:ux` | Playwright critical-path E2E |
| `pnpm db:migrate:dev` | Tạo migration mới khi sửa Prisma schema |
| `pnpm db:migrate:deploy` | Áp migration (production / CI) |
| `pnpm db:seed` | Seed dữ liệu demo (idempotent) |
| `pnpm db:reset` | Xóa + tạo lại DB + seed (cẩn thận, mất dữ liệu local) |
| `pnpm infra:up` | Chỉ bật hạ tầng: Postgres + Redis + MinIO |
| `pnpm infra:down` | Tắt hạ tầng Docker |
| `pnpm demo:up` | Full stack: API + Web + Worker + hạ tầng trong Docker |
| `pnpm demo:down` | Tắt full stack Docker |
| `bash scripts/demo-flow.sh` hoặc `pwsh scripts/demo-flow.ps1` | Demo E2E: Reporter tạo incident → Manager assign → KTV issue parts → Manager approve → KTV complete → Manager close → CSV report |

## Chế độ "demo đầy đủ" so với "development"

| Tính năng | Dev (mặc định) | Demo đầy đủ |
|---|---|---|
| AI provider | `mock` (deterministic) | `openai` (smoke test tùy chọn — cần `OPENAI_API_KEY`) |
| Email gửi | log-only stub | log-only stub (chưa gửi thật) |
| Storage | MinIO local | MinIO local |
| Realtime | Socket.IO (cùng host) | Socket.IO (cùng host); fallback polling 10s |

Bật AI thật: trong `.env` đặt `AI_PROVIDER=openai` và `OPENAI_API_KEY=sk-...`.

## Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                      NestJS backend (HTTP + Swagger)
│  ├─ web/                      Next.js frontend
│  └─ worker/                   BullMQ worker (AI, notification, scheduler)
├─ packages/
│  ├─ shared/                   types, enums, permission constants, OpenAPI client
│  └─ backend-core/             PrismaService, domain logic (state machine, RBAC policy,
│                                SLA, inventory) — KHÔNG chứa HTTP; được import bởi
│                                cả apps/api và apps/worker
├─ infra/
│  ├─ docker-compose.infra.yml   postgres, redis, minio (chỉ hạ tầng)
│  ├─ docker-compose.demo.yml    api, web, worker + infra (full stack)
│  └─ minio/                     init bucket script
├─ scripts/
│  ├─ reset-db.sh / .ps1
│  └─ demo-flow.sh / .ps1
├─ .env.example
├─ .nvmrc
├─ pnpm-workspace.yaml
├─ package.json
├─ IMPLEMENTATION_PLAN.md
└─ README.md
```

## Bảo mật

- Repo **không** chứa API key, mật khẩu thật, hay secret. Toàn bộ cấu hình qua `.env` (đã `.gitignore`).
- Mọi kiểm tra quyền (`PolicyGuard` + `ScopeGuard`) được thực hiện tại Backend — UI chỉ ẩn nút để giảm thao tác sai.
- RBAC policy + scope check nằm trong `packages/backend-core` (shared domain); `packages/shared` chỉ chứa types/enums/permission constants/OpenAPI client.
- Mật khẩu hash bằng bcrypt (cost ≥ 12).
- Tệp đính kèm đi qua chu trình STAGED → READY; quyền tải được kiểm tra lại tại thời điểm truy cập; kiểm tra magic bytes (file signature) ngoài MIME/extension.

## Đóng góp & quy trình

1. Tạo branch: `git checkout -b feat/<mã-milestone>-<mô-tả-ngắn>`
2. Commit theo conventional commits: `feat(scope):`, `fix(scope):`, `docs:`, `test:`, `chore:`
3. Trước khi push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` phải pass.
4. Push lên branch, mở PR nếu muốn review.
5. Mỗi milestone kết thúc có self-review theo `IMPLEMENTATION_PLAN.md §14`.

## Tham chiếu tài liệu

- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — kiến trúc, truy vết yêu cầu, state machine, transaction, Q-items, kế hoạch milestone 14 tuần
- Document01..07 (đính kèm từ folder DATN gốc)