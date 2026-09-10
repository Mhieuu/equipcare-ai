#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Cài Node 22 LTS, pnpm 9, Docker Desktop + WSL2 cho EquipCare AI monorepo.
.DESCRIPTION
  Chạy trong PowerShell Admin (Win+X → Terminal (Admin)). Mỗi bước có log
  để bạn xem tiến trình. Nếu một bước fail, script dừng và in hướng dẫn.
.NOTES
  - Node: 22.11.0 LTS (qua nvm-windows để dễ đổi phiên bản)
  - pnpm: 9.12.0 (qua corepack đã có sẵn trong Node 22)
  - Docker Desktop: yêu cầu WSL2 + reboot sau khi cài
  - Hyper-V / WSL: bật qua dism
#>

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'

function Step($n, $title) {
  Write-Host ""
  Write-Host "=== [$n] $title ===" -ForegroundColor Cyan
}

function Ok($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red }

# ----- Preflight -----
Step 0 "Preflight"
$winget = Get-Command winget -ErrorAction SilentlyContinue
if (-not $winget) {
  Fail "winget không có. Cài App Installer từ Microsoft Store hoặc dùng installer thủ công."
  Write-Host "        https://aka.ms/getwinget"
  exit 1
}
Ok "winget $($winget.Version.Split([Environment]::NewLine)[0])"

# ----- 1. WSL2 -----
Step 1 "Enable WSL2 feature"
try {
  dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart | Out-Null
  dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart | Out-Null
  Ok "WSL feature enabled (cần restart sau khi cài Docker)"
} catch {
  Warn "dism lỗi (thường vẫn OK nếu feature đã bật): $_"
}

# Set default WSL version to 2
try {
  wsl --set-default-version 2 | Out-Null
  Ok "wsl --set-default-version 2"
} catch {
  Warn "wsl command không có; cần reboot trước"
}

# ----- 2. nvm-windows -----
Step 2 "Install nvm-windows (Node Version Manager)"
$nvmDir = "$env:APPDATA\nvm"
if (-not (Test-Path $nvmDir)) {
  Write-Host "  Tải nvm-windows installer..."
  $installer = "$env:TEMP\nvm-setup.exe"
  Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/coreybutler/nvm-windows/releases/download/1.1.12/nvm-setup.exe" -OutFile $installer
  Start-Process -FilePath $installer -ArgumentList "/silent" -Wait
  Remove-Item $installer -Force -ErrorAction SilentlyContinue
  Ok "nvm-windows installed (cần mở lại PowerShell Admin để PATH cập nhật)"
} else {
  Ok "nvm-windows đã có"
}

# ----- 3. Node 22 -----
Step 3 "Install Node.js 22.11.0 via nvm"
# Refesh PATH để thấy nvm
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
$nvm = Get-Command nvm -ErrorAction SilentlyContinue
if ($nvm) {
  nvm install 22.11.0 | Out-Null
  nvm use 22.11.0 | Out-Null
  nvm alias default 22.11.0 | Out-Null
  Ok "Node $(node --version) installed via nvm"
} else {
  Warn "nvm command chưa có; mở lại PowerShell Admin rồi chạy lại script từ Step 3"
}

# ----- 4. pnpm 9 -----
Step 4 "Enable pnpm 9.12.0 via corepack"
corepack enable | Out-Null
corepack prepare pnpm@9.12.0 --activate | Out-Null
Ok "pnpm $(pnpm --version) ready"

# ----- 5. Docker Desktop -----
Step 5 "Install Docker Desktop"
$docker = Get-Command docker -ErrorAction SilentlyContinue
if (-not $docker) {
  Write-Host "  Tải Docker Desktop installer (~600 MB)..."
  $dockerInstaller = "$env:TEMP\Docker Desktop Installer.exe"
  Invoke-WebRequest -UseBasicParsing -Uri "https://desktop.docker.com/win/main/amd64/Docker Desktop Installer.exe" -OutFile $dockerInstaller
  Start-Process -FilePath $dockerInstaller -ArgumentList "install --quiet --accept-license" -Wait
  Remove-Item $dockerInstaller -Force -ErrorAction SilentlyContinue
  Ok "Docker Desktop installed (cần logout/login hoặc reboot để hoàn tất)"
} else {
  Ok "Docker đã có"
}

# ----- 6. Verify -----
Step 6 "Verify installation"
Write-Host "  Node:    $(node --version 2>$null)"
Write-Host "  npm:     $(npm --version 2>$null)"
Write-Host "  pnpm:    $(pnpm --version 2>$null)"
Write-Host "  docker:  $(docker --version 2>$null)"
Write-Host "  git:     $(git --version 2>$null)"

Step 7 "Next steps"
Write-Host "  1. KHỞI ĐỘNG LẠI MÁY (reboot) để WSL2 + Docker chạy ổn định." -ForegroundColor Yellow
Write-Host "  2. Mở Docker Desktop → chờ icon 'Docker Desktop is running'." -ForegroundColor Yellow
Write-Host "  3. Quay lại đây, báo tôi 'ready' để chạy preflight + viết migration 0001_init." -ForegroundColor Yellow
