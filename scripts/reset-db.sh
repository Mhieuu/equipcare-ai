#!/usr/bin/env bash
# Reset database (drop volume + restart). CẢNH BÁO: mất toàn bộ data.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[reset-db] stopping demo services..."
docker compose -f infra/docker-compose.demo.yml --env-file .env down -v || true
docker compose -f infra/docker-compose.infra.yml --env-file .env down -v || true

echo "[reset-db] removing volumes..."
docker volume rm equipcare-ai_pg_data equipcare-ai_redis_data equipcare-ai_minio_data 2>/dev/null || true

echo "[reset-db] starting infra..."
docker compose -f infra/docker-compose.infra.yml --env-file .env up -d

echo "[reset-db] done. Now run: pnpm db:migrate:deploy && pnpm db:seed"
