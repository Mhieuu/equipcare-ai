# EquipCare AI

AI-Powered Equipment Maintenance Management System — P1 MVP.

Xem chi tiết kiến trúc, bảng truy vết yêu cầu và kế hoạch milestone tại [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

## Stack

- **Backend**: NestJS 10, Prisma 5, PostgreSQL 16, Redis 7, BullMQ, Socket.IO
- **Frontend**: Next.js 14, React 18, TypeScript strict, Tailwind, shadcn/ui, TanStack Query, RHF + Zod
- **Storage**: MinIO (S3-compatible) local
- **AI**: Provider abstraction, OpenAI Responses API (optional), deterministic mock
- **Test**: Jest, Supertest, Playwright, Testcontainers

## Cấu trúc

```
apps/
  api/        NestJS backend
  web/        Next.js frontend
packages/
  shared/     Types, enums, RBAC policy, OpenAPI client
infra/
  docker-compose.yml   Postgres, Redis, MinIO
```

## Chạy local (sẽ cập nhật sau M1)

```bash
docker compose -f infra/docker-compose.yml up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Trạng thái

Hiện đang ở giai đoạn **lập kế hoạch**. Chờ phê duyệt kế hoạch trước khi viết code.
