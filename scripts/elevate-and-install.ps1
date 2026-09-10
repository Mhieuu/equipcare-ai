#Requires -Version 5.1
<#
.SYNOPSIS
  Chạy install-deps.ps1 với quyền Admin qua UAC.
.DESCRIPTION
  Tạo scheduled task chạy 1 lần với RunLevel Highest. Bạn sẽ nhận 1 UAC prompt
  (nhấn Yes) — sau đó script chạy ngầm, đóng cửa sổ PowerShell ngay.
#>

$ErrorActionPreference = 'Stop'
$ScriptPath = Join-Path $PSScriptRoot 'install-deps.ps1'
$TaskName   = 'EquipCare-AutoInstall'

if (-not (Test-Path $ScriptPath)) {
  Write-Error "Không tìm thấy $ScriptPath"
  exit 1
}

# Xóa task cũ nếu có
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction `
  -Execute 'powershell.exe' `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`""

$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest -LogonType Interactive

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Principal $principal `
  -Settings $settings `
  -Description 'EquipCare AI — auto install Node 22 + pnpm + Docker' | Out-Null

Write-Host "Task đã đăng ký. Sẽ nhận 1 UAC prompt (nhấn Yes)."
Write-Host ""
Start-ScheduledTask -TaskName $TaskName
Write-Host "Started. Bạn có thể đóng cửa sổ này."
Write-Host ""
Write-Host "Xem tiến trình:"
Write-Host "  Get-ScheduledTask -TaskName $TaskName"
Write-Host "  Wait-ScheduledTask -TaskName $TaskName"
