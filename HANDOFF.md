# EquipCare AI — Handoff Notes (2026-09-10)

## Trạng thái hiện tại

### ✅ Đã hoạt động

| Service | Endpoint | Container |
|---------|----------|-----------|
| Postgres 16-alpine | `localhost:5432` | `equipcare-postgres` |
| Redis 7-alpine | `localhost:6379` | `equipcare-redis` |
| MinIO | API `:9000` / Console `:9001` | `equipcare-minio` |

Credentials mặc định:
- Postgres: `equipcare` / `equipcare_pwd` / db `equipcare`
- MinIO: `minioadmin` / `minioadmin`

### ⏸️ Chưa sẵn sàng

- `apps/api`, `apps/web`, `apps/worker` — code chưa có (đang đợi thiết kế Figma + skeleton)
- `packages/shared`, `packages/backend-core` — rỗng

## Image tags đã sửa

Trong `infra/docker-compose.infra.yml` và `infra/docker-compose.demo.yml`:
- `postgres:16.4-alpine` → `postgres:16-alpine`
- `redis:7.4-alpine` → `redis:7-alpine`
- `minio/minio:RELEASE.2024-09-16T17-43-14Z` → `minio/minio:latest`
- `minio/mc:RELEASE.2024-09-16T17-43-14Z` → `minio/mc:latest`

(Tag cũ không tồn tại trên Docker Hub registry; dùng `:latest` cho dev. Khi release nên pin tag cụ thể.)

## Stack

- Windows 11 24H2 build 26100 + WSL2 + Docker Desktop 4.90
- Node 22.11.0-alpine + pnpm 9.12.0 (đã pinned trong Dockerfile)
- pnpm workspace: `apps/*` + `packages/*`

## Khi quay lại build demo

1. Pull images nếu cần:
   ```bash
   docker compose -f infra/docker-compose.infra.yml up -d
   ```
2. Sau khi code xong:
   ```bash
   docker compose -f infra/docker-compose.demo.yml up -d --build
   ```
3. MinIO console: http://localhost:9001 (đăng nhập `minioadmin` / `minioadmin`)
4. Postgres debug:
   ```bash
   docker exec -it equipcare-postgres psql -U equipcare -d equipcare
   ```

## Decisions đang chờ Figma

- API port 3001, Web port 3000 (đã set trong compose)
- AI_PROVIDER mặc định: `mock`
- MinIO bucket: `equipcare-files`
