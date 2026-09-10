# reset-db.ps1 — PowerShell mirror của reset-db.sh
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

Write-Output "[reset-db] stopping demo services..."
docker compose -f infra/docker-compose.demo.yml --env-file .env down -v 2>$null
docker compose -f infra/docker-compose.infra.yml --env-file .env down -v 2>$null

Write-Output "[reset-db] removing volumes..."
docker volume rm equipcare-ai_pg_data, equipcare-ai_redis_data, equipcare-ai_minio_data -ErrorAction SilentlyContinue

Write-Output "[reset-db] starting infra..."
docker compose -f infra/docker-compose.infra.yml --env-file .env up -d

Write-Output "[reset-db] done. Now run: pnpm db:migrate:deploy && pnpm db:seed"
