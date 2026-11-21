# Đóng gói dự án (fallback cho Windows khi không có lệnh `zip`).
#
# Được gọi tự động bởi tools/package-handover.sh.
# Biến môi trường cần có:
#   PS_ROOT      - thư mục gốc dự án
#   PS_OUT       - đường dẫn file zip đầu ra
#   PS_INCLUDES  - danh sách đường dẫn cần đóng gói, phân tách bằng ';'
#
param(
  [string]$Root,
  [string]$Out,
  # File danh sách đường dẫn (mỗi dòng một path) — tránh vấn đề ký tự phân
  # tách bị shell "ăn" mất khi truyền qua -File.
  [string]$IncludeList
)

$ErrorActionPreference = 'Stop'

$root = $Root
$out = $Out
$includes = @()
if ($IncludeList -and (Test-Path -LiteralPath $IncludeList)) {
  $includes = Get-Content -LiteralPath $IncludeList | Where-Object { $_ -ne '' }
}

# Các thư mục/file loại trừ (artifact build + secret).
$excludeDirs = @(
  'node_modules', '.next', 'dist', '.turbo', 'coverage',
  'test-results', 'screenshots', '.git'
)
$excludeFiles = @('.env', '.env.local', '*.tsbuildinfo')

$staging = Join-Path $env:TEMP ("equipcare-pkg-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
  foreach ($item in $includes) {
    $src = Join-Path $root $item
    if (-not (Test-Path -LiteralPath $src)) {
      Write-Output "   skip (khong ton tai): $item"
      continue
    }
    # File đơn lẻ: copy trực tiếp. Thư mục: dùng robocopy để bỏ qua
    # junction/symlink (dist/cjs trong packages/shared) — Compress-Archive sẽ
    # lỗi trên các thư mục này.
    $srcItem = Get-Item -LiteralPath $src -Force
    if ($srcItem.PSIsContainer) {
      $dest = Join-Path $staging $item
      & robocopy $src $dest /E /NFL /NDL /NJH /NJS /NP /R:1 /W:1 /XD node_modules .next .git /XF .env '*.tsbuildinfo' | Out-Null
      if ($LASTEXITCODE -ge 8) {
        Write-Output "   !! robocopy loi (code $LASTEXITCODE) tai: $item"
      }
    } else {
      Copy-Item -LiteralPath $src -Destination $staging -Force
    }
  }

  # Dọn artifact + secret khỏi thư mục staging.
  Get-ChildItem -LiteralPath $staging -Recurse -Force -Directory |
    Where-Object { $excludeDirs -contains $_.Name } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

  Get-ChildItem -LiteralPath $staging -Recurse -Force -File |
    Where-Object {
      $excludeFiles -contains $_.Name -or $_.Name -like '*.tsbuildinfo' -or $_.Name -like '.env.*.local'
    } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue }

  New-Item -ItemType Directory -Path (Split-Path -Parent $out) -Force | Out-Null
  if (Test-Path -LiteralPath $out) { Remove-Item -LiteralPath $out -Force }
  Write-Output "   staging: $((Get-ChildItem $staging | Measure-Object).Count) muc"
  Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $out -Force
  Write-Output "   compressed -> $out (exists: $(Test-Path -LiteralPath $out))"
}
finally {
  Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "   -> $out"
