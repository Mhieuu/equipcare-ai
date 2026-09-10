# Elevate-and-install watcher
# Chờ scheduled task xong và in log
$ErrorActionPreference = 'Continue'
$taskName = 'EquipCare-AutoInstall'

Write-Host "Watching task '$taskName'..."
while ($true) {
  $info = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
  if (-not $info) {
    Write-Host "Task đã xóa (chạy xong hoặc user hủy)."
    break
  }
  Start-Sleep -Seconds 5
}
Write-Host "Done."
