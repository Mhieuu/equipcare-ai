#!/usr/bin/env bash
# MinIO init script — M0 placeholder.
# Trong Compose, dùng service `minio-init` (image minio/mc) để tạo bucket
# ở chế độ private. Script này chỉ dùng khi chạy thủ công.
set -euo pipefail

ALIAS="${ALIAS:-local}"
ENDPOINT="${ENDPOINT:-http://localhost:9000}"
ACCESS="${ACCESS:-${S3_ACCESS_KEY:-minioadmin}}"
SECRET="${SECRET:-${S3_SECRET_KEY:-minioadmin}}"
BUCKET="${BUCKET:-${S3_BUCKET:-equipcare-files}}"

mc alias set "$ALIAS" "$ENDPOINT" "$ACCESS" "$SECRET"
mc mb --ignore-existing -p "${ALIAS}/${BUCKET}"
echo "MinIO bucket ${BUCKET} ready (private)"
