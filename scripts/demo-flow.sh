#!/usr/bin/env bash
# Demo E2E flow — placeholder cho M0; sẽ đầy đủ ở M7.
# Thứ tự: Reporter tạo incident → Manager assign → KTV lập đề xuất →
#          Manager approve → KTV issue parts → KTV complete → Manager close → CSV report.
set -euo pipefail

cd "$(dirname "$0")/.."

API="${API:-http://localhost:3001}"
echo "[demo-flow] (M0 stub) would call API at $API"
echo "[demo-flow] will be implemented end-to-end in M7 (Inventory + Approval)."
