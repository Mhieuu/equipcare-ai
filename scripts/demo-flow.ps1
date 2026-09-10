# demo-flow.ps1 — PowerShell mirror của demo-flow.sh
$ErrorActionPreference = "Stop"
$Api = if ($env:API) { $env:API } else { "http://localhost:3001" }

Write-Output "[demo-flow] (M0 stub) would call API at $Api"
Write-Output "[demo-flow] will be implemented end-to-end in M7 (Inventory + Approval)."
