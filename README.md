# EquipCare AI

AI-Powered Equipment Maintenance Management System — phạm vi P1 theo bộ tài liệu đính kèm (Spec + Document01..07).

> **Trạng thái**: đang triển khai theo [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md). Bản kế hoạch đã được rà soát lại sau vòng review và đối chiếu trực tiếp với Doc02–07.

## Stack đã khóa

| Layer | Tech |
|---|---|
| Backend | NestJS 10 · Prisma 5 · PostgreSQL 16 · Redis 7 · BullMQ · Socket.IO |
| Frontend | Next.js 14 (App Router) · React 18 · TypeScript strict · Tailwind · shadcn/ui · TanStack Query · RHF + Zod |
| Storage | MinIO (S3-compatible, local) |
| AI | Provider abstraction · OpenAI Responses API (optional) · deterministic mock |
| Test | Jest (backend) · Vitest (frontend) · Supertest · Testcontainers · Playwright |
| Toolchain | Node.js 20 LTS · pnpm 9 workspaces |

## Yêu cầu môi trường

- **Node.js**: 20.x LTS (≥ 20.10) — xem `.nvmrc`
- **pnpm**: 9.x — `npm i -g pnpm@9`
- **Docker Desktop** (Windows/Mac) hoặc Docker Engine + Compose v2
- **OS**: Windows 10/11, macOS 12+, Ubuntu 22.04+
- Ổ đĩa trống tối thiểu 5 GB cho Postgres + MinIO data

## Chạy nhanh (dev)

```bash
# 0. Lấy source
git clone https://github.com/Mhieuu/equipcare-ai.git
cd equipcare-ai

# 1. Cài dependencies
pnpm install

# 2. Sao chép biến môi trường (KHÔNG commit file .env)
cp .env.example .env

# 3. Khởi động Postgres + Redis + MinIO
docker compose -f infra/docker-compose.yml up -d

# 4. Tạo schema + seed demo (idempotent)
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed

# 5. Chạy dev (API + Web + Worker)
pnpm dev
```

Sau khi chạy, truy cập:

| Dịch vụ | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger UI | http://localhost:3001/docs |
| MinIO Console | http://localhost:9001 (`minioadmin` / `minioadmin`) |

## Tài khoản demo

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
| `bash scripts/demo-flow.sh` | Chạy kịch bản demo end-to-end (login → incident → WO → parts → complete → CSV) |

## Chế độ "demo đầy đủ" so với "development"

| Tính năng | Dev (mặc định) | Demo đầy đủ |
|---|---|---|
| AI provider | `mock` (deterministic) | `openai` (cần `OPENAI_API_KEY`) |
| Email gửi | log-only stub | log-only stub (chưa gửi thật) |
| Storage | MinIO local | MinIO local |
| Realtime | Socket.IO (cùng host) | Socket.IO (cùng host) |
| Audit retention | vô hạn | vô hạn |

Bật AI thật: trong `.env` đặt `AI_PROVIDER=openai` và `OPENAI_API_KEY=sk-...`.

## Cấu trúc thư mục

```
equipcare-ai/
├─ apps/
│  ├─ api/                  NestJS backend
│  └─ web/                  Next.js frontend
├─ packages/
│  └─ shared/               types, enums, RBAC policy, OpenAPI client
├─ infra/
│  └─ docker-compose.yml    postgres, redis, minio (dev)
├─ scripts/
│  ├─ reset-db.sh
│  └─ demo-flow.sh
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
- Mật khẩu hash bằng bcrypt (cost ≥ 12).
- Tệp đính kèm đi qua chu trình STAGED → READY; quyền tải được kiểm tra lại tại thời điểm truy cập.

## Đóng góp & quy trình

1. Tạo branch: `git checkout -b feat/<mã-milestone>-<mô-tả-ngắn>`
2. Commit theo conventional commits: `feat(scope):`, `fix(scope):`, `docs:`, `test:`, `chore:`
3. Trước khi push: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` phải pass.
4. Push lên branch, mở PR nếu muốn review.
5. Mỗi milestone kết thúc có self-review theo `IMPLEMENTATION_PLAN.md §13`.

## Tham chiếu tài liệu

- [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — kiến trúc, truy vết yêu cầu, state machine, transaction, Q-items, kế hoạch milestone 14 tuần
- Document01..07 (đính kèm từ folder DATN gốc)