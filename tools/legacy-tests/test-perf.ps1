# Performance test runner
# Measures:
#  - Cold start (API boot)
#  - p95 latency for list endpoints
#  - Performance under 1000+ record pagination

$base = 'http://localhost:3001'
$pwdAdmin = 'ChangeMe' + [char]64 + '2026'

$results = @()

function Measure-Endpoint {
    param([string]$url, [string]$method = 'GET', [int]$iterations = 30, [hashtable]$headers, [string]$body)
    $latencies = @()
    for ($i = 0; $i -lt $iterations; $i++) {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        try {
            if ($method -eq 'GET') {
                Invoke-RestMethod -Uri $url -Method GET -Headers $headers -TimeoutSec 10 | Out-Null
            } else {
                Invoke-RestMethod -Uri $url -Method $method -ContentType 'application/json' -Headers $headers -Body $body -TimeoutSec 10 | Out-Null
            }
        } catch { Write-Host "ERR $($i): $($_.Exception.Message)" }
        $sw.Stop()
        $latencies += $sw.ElapsedMilliseconds
    }
    $sorted = $latencies | Sort-Object
    $p50 = $sorted[[math]::Floor($sorted.Count * 0.5)]
    $p95 = $sorted[[math]::Floor($sorted.Count * 0.95)]
    $p99 = $sorted[[math]::Floor($sorted.Count * 0.99)]
    $max = ($sorted | Measure-Object -Maximum).Maximum
    $min = ($sorted | Measure-Object -Minimum).Minimum
    $avg = [math]::Round(($latencies | Measure-Object -Average).Average, 1)
    return @{
        p50 = $p50
        p95 = $p95
        p99 = $p99
        avg = $avg
        min = $min
        max = $max
        n = $iterations
    }
}

function Test-Perf {
    param([string]$id, [string]$desc, [string]$url, [int]$iterations = 30, [hashtable]$headers, [string]$method = 'GET', [string]$body)
    Write-Host "Running $id $desc ..."
    $r = Measure-Endpoint -url $url -method $method -iterations $iterations -headers $headers -body $body
    $results += [PSCustomObject]@{
        ID = $id
        Test = $desc
        Iterations = $r.n
        P50ms = $r.p50
        P95ms = $r.p95
        P99ms = $r.p99
        Avg = $r.avg
        Min = $r.min
        Max = $r.max
    }
    Write-Host "  p50=$($r.p50)ms  p95=$($r.p95)ms  p99=$($r.p99)ms  max=$($r.max)ms"
}

# Login
$r = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body ('{"loginName":"admin.bootstrap","password":"' + $pwdAdmin + '"}')
$h = @{ Authorization = "Bearer $($r.accessToken)" }

# Health
Test-Perf 'PERF-HEALTH' 'GET /healthz (liveness)' "$base/healthz" -iterations 20 -headers $h

# List endpoints with pagination
Test-Perf 'PERF-INC' 'GET /incidents (limit 50)' "$base/incidents?limit=50" -headers $h
Test-Perf 'PERF-WO' 'GET /work-orders (limit 50)' "$base/work-orders?limit=50" -headers $h
Test-Perf 'PERF-ASSET' 'GET /assets (limit 50)' "$base/assets?limit=50" -headers $h
Test-Perf 'PERF-PART' 'GET /parts (limit 50)' "$base/parts?limit=50" -headers $h
Test-Perf 'PERF-IAM-USER' 'GET /iam/users (limit 50)' "$base/iam/users?limit=50" -headers $h
Test-Perf 'PERF-MP' 'GET /maintenance-plans (limit 50)' "$base/maintenance-plans?limit=50" -headers $h
Test-Perf 'PERF-APR' 'GET /approvals (limit 50)' "$base/approvals?limit=50" -headers $h
Test-Perf 'PERF-NTF' 'GET /notifications (limit 50)' "$base/notifications?limit=50" -headers $h
Test-Perf 'PERF-DASH' 'GET /dashboard/kpis' "$base/dashboard/kpis" -headers $h

# Pagination test - 1000 records (offset through pages)
Test-Perf 'PERF-PAGED-1' 'GET /incidents?limit=100&offset=0' "$base/incidents?limit=100&offset=0" -headers $h
Test-Perf 'PERF-PAGED-2' 'GET /incidents?limit=100&offset=100' "$base/incidents?limit=100&offset=100" -headers $h
Test-Perf 'PERF-PAGED-3' 'GET /incidents?limit=100&offset=200' "$base/incidents?limit=100&offset=200" -headers $h
Test-Perf 'PERF-PAGED-MAX' 'GET /incidents?limit=200 (max page)' "$base/incidents?limit=200" -headers $h

# Single-record fetch
Test-Perf 'PERF-SINGLE-INC' 'GET /incidents/:id (single)' "$base/incidents/$(($(Invoke-RestMethod -Uri "$base/incidents?limit=1" -Method GET -Headers $h).items[0].id))" -headers $h
Test-Perf 'PERF-SINGLE-WO' 'GET /work-orders/:id (single)' "$base/work-orders/$(($(Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $h).items[0].id))" -headers $h

# Count records in DB
Write-Host ""
Write-Host "=== Record counts ==="
$counts = @{
    Incidents = (Invoke-RestMethod -Uri "$base/incidents?limit=1" -Method GET -Headers $h).total
    WorkOrders = (Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $h).total
    Assets = (Invoke-RestMethod -Uri "$base/assets?limit=1" -Method GET -Headers $h).total
    Parts = (Invoke-RestMethod -Uri "$base/parts?limit=1" -Method GET -Headers $h).total
    Users = (Invoke-RestMethod -Uri "$base/iam/users?limit=1" -Method GET -Headers $h).total
    Plans = (Invoke-RestMethod -Uri "$base/maintenance-plans?limit=1" -Method GET -Headers $h).total
    Approvals = (Invoke-RestMethod -Uri "$base/approvals?limit=1" -Method GET -Headers $h).total
    Notifications = (Invoke-RestMethod -Uri "$base/notifications?limit=1" -Method GET -Headers $h).total
}
$counts.GetEnumerator() | ForEach-Object { Write-Host "  $($_.Key): $($_.Value)" }

# Cold start
Write-Host ""
Write-Host "=== Cold start measurement (API process restart) ==="
# Get API PID via healthz
$before = Get-Date
$start = $before

# Restart API
$apiPids = Get-Process node 2>$null | Where-Object { $_.MainModule.FileName -like '*\node.exe' }
$apiProcess = $apiPids | Where-Object { (Get-NetTCPConnection -OwningProcess $_.Id -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq 3001 }).Count -gt 0 } | Select-Object -First 1
if ($apiProcess) {
    Write-Host "Stopping API PID $($apiProcess.Id) ..."
    Stop-Process -Id $apiProcess.Id -Force
    Start-Sleep -Seconds 2
    # Restart
    Set-Location 'C:\Users\Hieu-PC\Projects\equipcare-ai\apps\api'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run start:prod > C:\Users\Hieu-PC\Projects\equipcare-ai\api.log 2>&1' -PassThru | Out-Null
    Set-Location 'C:\Users\Hieu-PC\Projects\equipcare-ai'
    # Wait for ready
    $ready = $false
    $coldStartSw = [System.Diagnostics.Stopwatch]::StartNew()
    while (-not $ready -and $coldStartSw.ElapsedMilliseconds -lt 60000) {
        try {
            $r = Invoke-WebRequest "$base/healthz" -UseBasicParsing -TimeoutSec 1
            if ($r.StatusCode -eq 200) { $ready = $true }
        } catch {}
    }
    $coldStartSw.Stop()
    Write-Host "Cold start: $($coldStartSw.ElapsedMilliseconds) ms"
    $results += [PSCustomObject]@{
        ID = 'PERF-COLD-START'
        Test = 'API cold start'
        Iterations = 1
        P50ms = $coldStartSw.ElapsedMilliseconds
        P95ms = $coldStartSw.ElapsedMilliseconds
        P99ms = $coldStartSw.ElapsedMilliseconds
        Avg = $coldStartSw.ElapsedMilliseconds
        Min = $coldStartSw.ElapsedMilliseconds
        Max = $coldStartSw.ElapsedMilliseconds
    }
}

# ===== SUMMARY =====
$results | Format-Table -AutoSize
Write-Host "=========================================="
Write-Host "PERFORMANCE SUMMARY"
Write-Host "=========================================="
$results | Export-Csv -Path 'perf-results.csv' -NoTypeInformation -Encoding UTF8

# Check p95 thresholds
$high = $results | Where-Object { $_.Iterations -gt 1 -and $_.P95ms -gt 1000 }
if ($high) {
    Write-Host ""
    Write-Host "SLOW ENDPOINTS (p95 > 1000ms):"
    $high | Format-Table ID, Test, P50ms, P95ms
} else {
    Write-Host ""
    Write-Host "ALL LIST ENDPOINTS OK (p95 < 1000ms)"
}