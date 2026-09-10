#!/usr/bin/env bash
# Freeze baseline marker — chạy khi khóa Doc02..07.
set -euo pipefail

cd "$(dirname "$0")/.."

TAG="${1:-v0.1.0-baseline}"
MSG="${2:-M0 baseline locked}"

echo "[freeze] creating git tag $TAG"
git tag -a "$TAG" -m "$MSG"
git push origin "$TAG" || true

echo "[freeze] done. Tag pushed: $TAG"
