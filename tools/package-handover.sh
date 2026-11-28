#!/usr/bin/env bash
#
# Đóng gói dự án để bàn giao / bảo vệ đồ án.
#
#   ./tools/package-handover.sh [version]
#
# Tạo ra dist/EquipCare-AI-v<version>.zip chứa toàn bộ mã nguồn,
# tài liệu và cấu hình hạ tầng — KHÔNG chứa .env, node_modules,
# .next hay dist (artifact build).
#
set -euo pipefail

VERSION="${1:-1.0.0}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"
ZIP_NAME="EquipCare-AI-v${VERSION}.zip"

cd "$ROOT_DIR"

echo "==> Đóng gói EquipCare AI v${VERSION}"

# --- 1. Kiểm tra working tree sạch (không bỏ sót thay đổi chưa commit) ---
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
  echo "!! Canh bao: working tree co thay doi chua commit:"
  git status --short
  echo "   (van tiep tuc dong goi — hay commit truoc khi ban giao chinh thuc)"
fi

# --- 2. Kiểm tra không có secret lọt vào gói ---
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "!! .env dang duoc track trong git — DUNG lai. Hay: git rm --cached .env"
  exit 1
fi

# --- 3. Loại trừ artifact build ---
EXCLUDES=(
  --exclude '*/node_modules/*'
  --exclude 'node_modules/*'
  --exclude '*/.next/*'
  --exclude '*/dist/*'
  --exclude '*/.turbo/*'
  --exclude '*/coverage/*'
  --exclude '*/.env'
  --exclude '*/.env.local'
  --exclude '*/.env.*.local'
  --exclude '*/test-results/*'
  --exclude '*/screenshots/*'
  --exclude '*.tsbuildinfo'
  --exclude '*/.git/*'
)

# --- 4. Tạo file nén ---
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR/$ZIP_NAME"

INCLUDES=(
  apps packages infra docs tools .github
  package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json
  README.md .env.example .env.production.example .nvmrc .gitignore
  TEST-REPORTS.md
)

if command -v zip >/dev/null 2>&1; then
  zip -r "$OUT_DIR/$ZIP_NAME" "${INCLUDES[@]}" "${EXCLUDES[@]}" -q
else
  # Fallback cho Windows (Git Bash khong co `zip`): goi script PowerShell rieng.
  # Danh sach path duoc ghi ra file tam roi PowerShell tu doc — tranh truong hop
  # shell "an" ky tu phan cach (bash coi ';' va '|' la ky tu dac biet).
  echo "--> Khong co lenh 'zip', dung tools/package-handover.ps1"

  INCLUDE_LIST_FILE="$OUT_DIR/.include-list.txt"
  : > "$INCLUDE_LIST_FILE"
  for item in "${INCLUDES[@]}"; do
    [ -e "$item" ] && echo "$item" >> "$INCLUDE_LIST_FILE"
  done

  # Git Bash Report la duong dan kieu /mnt/c/... — PowerShell can duong dan Windows.
  PS_ROOT_DIR="$ROOT_DIR"
  if command -v cygpath >/dev/null 2>&1; then
    PS_ROOT_DIR="$(cygpath -w "$ROOT_DIR")"
    PS_INCLUDE_LIST="$(cygpath -w "$INCLUDE_LIST_FILE")"
  elif command -v wslpath >/dev/null 2>&1; then
    PS_ROOT_DIR="$(wslpath -w "$ROOT_DIR")"
    PS_INCLUDE_LIST="$(wslpath -w "$INCLUDE_LIST_FILE")"
  else
    PS_INCLUDE_LIST="$INCLUDE_LIST_FILE"
  fi

  PS_OUT_FILE="$OUT_DIR/$ZIP_NAME"
  if command -v cygpath >/dev/null 2>&1; then
    PS_OUT_FILE="$(cygpath -w "$PS_OUT_FILE")"
  elif command -v wslpath >/dev/null 2>&1; then
    PS_OUT_FILE="$(wslpath -w "$PS_OUT_FILE")"
  fi

  powershell.exe -NoProfile -ExecutionPolicy Bypass \
    -File "$(dirname "${BASH_SOURCE[0]}")/package-handover.ps1" \
    -Root "$PS_ROOT_DIR" -Out "$PS_OUT_FILE" -IncludeList "$PS_INCLUDE_LIST"

  rm -f "$INCLUDE_LIST_FILE"
fi

# --- 5. Kiểm tra kết quả ---
echo ""
echo "==> Da tao: dist/$ZIP_NAME"

# Dung PowerShell de kiem tra (duong dan Windows luon dung ke ca khi
# bash dang chay voi root kieu /mnt/c/...).
CHECK_OUT="$PS_OUT_FILE"
[ -z "$CHECK_OUT" ] && CHECK_OUT="$OUT_DIR/$ZIP_NAME"
powershell.exe -NoProfile -Command "
  \$f = Get-Item -LiteralPath '$CHECK_OUT'
  '{0}  {1:N1} MB' -f \$f.Name, (\$f.Length / 1MB)
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  \$zip = [System.IO.Compression.ZipFile]::OpenRead(\$f.FullName)
  Write-Output ''
  Write-Output 'Noi dung (cap 2):'
  \$zip.Entries.FullName |
    Where-Object { \$_ -match '^[^/]+/[^/]+/' } |
    ForEach-Object { (\$_ -split '/')[0..1] -join '/' } |
    Sort-Object -Unique | Select-Object -First 30 | ForEach-Object { '  ' + \$_ }
  Write-Output ''
  \$secret = \$zip.Entries.FullName | Where-Object { \$_ -match '(^|/)\.env(\$|/)' }
  if (\$secret) {
    Write-Output '!! CANH BAO: goi van chua file .env:'
    \$secret | ForEach-Object { '   ' + \$_ }
  } else {
    Write-Output 'OK — khong co file .env trong goi.'
  }
  \$zip.Dispose()
"
