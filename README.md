# EquipCare AI

> AI-Powered Equipment Maintenance Management System — Đồ án tốt nghiệp (DATN).

Web monorepo (modular monolith) phục vụ quản lý thiết bị, sự cố, phiếu công việc, bảo trì định kỳ, kho linh kiện, chi phí, phê duyệt, dashboard và AI hỗ trợ — phạm vi một tổ chức.

## Cấu trúc thư mục

```
equipcare-ai/
├── apps/
│   ├── api/                  NestJS 10 — backend HTTP + Swagger
│   ├── web/                  Next.js 14 (App Router) — frontend
│   └── worker/               BullMQ worker — chạy RIÊNG với api
├── packages/
│   ├── shared/               types, enums, permission constants, OpenAPI client
│   └── backend-core/         PrismaService + domain logic (state machine, policy)
├── infra/
│   ├── docker-compose.infra.yml   postgres + redis + minio (chỉ hạ tầng)
│   ├── docker-compose.demo.yml    api + web + worker + infra (full stack)
│   └── minio/                init bucket script
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── baseline/            Doc01..07 đã đối chiếu baseline M0 (LOCKED v1.x)
├── .env.example
├── .nvmrc
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

## Stack đã pin (baseline M0)

| Thành phần | Phiên bản |
|---|---|
| Node.js | 22.x LTS |
| pnpm | 9.12+ (workspaces) |
| NestJS | 10.x |
| Prisma | 5.x |
| Next.js | 14.x (App Router) |
| React | 18.x |
| PostgreSQL | 16 |
| Redis | 7 |
| MinIO | RELEASE.2024-09-13T03-26-17Z |

> Mọi phiên bản chính xác nằm trong `pnpm-lock.yaml`. KHÔNG bump major sau khi đóng băng baseline.

## Yêu cầu môi trường

- Node 22.x (dùng `nvm install` & `nvm use` để theo `.nvmrc`)
- pnpm ≥ 9.12 (`npm i -g pnpm@9`)
- Docker Desktop (để chạy Postgres + Redis + MinIO)

## Khởi động nhanh

```powershell
# 1) Cài dependencies
pnpm install

# 2) Bật hạ tầng (Postgres / Redis / MinIO)
pnpm infra:up

# 3) Copy env
cp .env.example .env    # sửa secret nếu cần

# 4) Migrate + seed
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed

# 5) Chạy dev (api + web + worker)
pnpm dev
```

Truy cập:

- Web: <http://localhost:3000>
- API: <http://localhost:3001/api/docs> (Swagger)
- MinIO console: <http://localhost:9001> (`minioadmin` / `minioadmin`)

## Demo full stack (Docker Compose)

```powershell
pnpm demo:up
```

Khởi động api + web + worker + postgres + redis + minio, sẵn sàng cho báo cáo đồ án.

## Tài liệu

| File | Mô tả |
|---|---|
| `docs/IMPLEMENTATION_PLAN.md` | Kế hoạch triển khai (rev. 5, baseline đối chiếu Doc02..07) |
| `docs/baseline/` | Doc01..07 markdown đã trích, kèm header LOCKED v1.x |

## Tài khoản demo (seed)

| Email | Role | Mật khẩu |
|---|---|---|
| admin@demo.local | ADMIN | `Demo@123` |
| manager@demo.local | MANAGER | `Demo@123` |
| technician@demo.local | TECHNICIAN | `Demo@123` |
| requester@demo.local | REQUESTER | `Demo@123` |

> Đổi mật khẩu trước khi deploy public.

## Quy trình tự kiểm tra sau mỗi milestone

Xem `docs/IMPLEMENTATION_PLAN.md` §14.

## License

Đồ án học thuật — Khoa CNTT, Trường Đại học Thủy Lợi.
