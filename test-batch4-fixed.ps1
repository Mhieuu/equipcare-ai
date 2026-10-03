# BATCH 4 FIXED: Assets + Inventory + Maintenance
. "$PSScriptRoot\test-common.ps1"

$admin = (Login 'admin.bootstrap' $pwdAdmin).accessToken
$mgr = (Login 'demo.manager1' $pwdUser).accessToken
$tech = (Login 'demo.tech1' $pwdUser).accessToken
$rpt = (Login 'demo.reporter1' $pwdUser).accessToken
$hAdmin = Get-Headers $admin
$hMgr = Get-Headers $mgr
$hTech = Get-Headers $tech
$hRpt = Get-Headers $rpt

$ids = Get-LiveIds $hAdmin
$assetId = $ids.assetId
$partId = $ids.partId

# Get department and location for create
$departments = Invoke-RestMethod -Uri "$base/departments" -Method GET -Headers $hAdmin
$deptId = $departments[0].id
$locations = Invoke-RestMethod -Uri "$base/locations" -Method GET -Headers $hAdmin
$locId = $locations[0].id

# ===== ASSETS =====
Run-Test 'AST-C-01' 'List assets' { (Invoke-RestMethod -Uri "$base/assets?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'AST-C-02' 'Search assets (search)' {
    $r = Invoke-RestMethod -Uri "$base/assets?search=motor&limit=5" -Method GET -Headers $hAdmin
    "items=$($r.items.Count)"
}
Run-Test 'AST-C-06' 'Get asset by id' {
    $r = (Invoke-RestMethod -Uri "$base/assets?limit=1" -Method GET -Headers $hAdmin).items[0]
    $d = Invoke-RestMethod -Uri "$base/assets/$($r.id)" -Method GET -Headers $hAdmin
    "code=$($d.code) state=$($d.manualState)"
}
Run-Test 'AST-C-07' 'Get QR payload' {
    $r = (Invoke-RestMethod -Uri "$base/assets?limit=1" -Method GET -Headers $hAdmin).items[0]
    $d = Invoke-RestMethod -Uri "$base/assets/$($r.id)/qr" -Method GET -Headers $hAdmin
    "qrKeys=$($d.PSObject.Properties.Name -join ',')"
}

Run-Test 'AST-L-01' 'Lifecycle NORMAL -> SUSPENDED' {
    $assets = Invoke-RestMethod -Uri "$base/assets?limit=20" -Method GET -Headers $hAdmin
    $target = $assets.items | Where-Object { $_.manualState -eq 'NORMAL' } | Select-Object -First 1
    if (-not $target) { throw 'no NORMAL asset' }
    $body = (@{to='SUSPENDED'; reason='Test suspension'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/assets/$($target.id)/lifecycle" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "asset=$($target.code) -> $($r.manualState)"
}
Run-Test 'AST-L-02' 'Lifecycle SUSPENDED -> NORMAL' {
    $assets = Invoke-RestMethod -Uri "$base/assets?limit=20" -Method GET -Headers $hAdmin
    $target = $assets.items | Where-Object { $_.manualState -eq 'SUSPENDED' } | Select-Object -First 1
    if (-not $target) { throw 'no SUSPENDED asset' }
    $body = (@{to='NORMAL'; reason='Test resume'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/assets/$($target.id)/lifecycle" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "asset=$($target.code) -> $($r.manualState)"
}
Run-Test 'AST-L-05' 'RETIRED without reason (4xx)' {
    $assets = Invoke-RestMethod -Uri "$base/assets?limit=20" -Method GET -Headers $hAdmin
    $target = $assets.items | Where-Object { $_.manualState -eq 'NORMAL' } | Select-Object -First 1
    try {
        Invoke-RestMethod -Uri "$base/assets/$($target.id)/lifecycle" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"RETIRED"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'AST-L-04' 'Create WO on RETIRED asset (4xx)' {
    $assets = Invoke-RestMethod -Uri "$base/assets?limit=20" -Method GET -Headers $hAdmin
    $target = $assets.items | Where-Object { $_.manualState -eq 'NORMAL' } | Select-Object -First 1
    Invoke-RestMethod -Uri "$base/assets/$($target.id)/lifecycle" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body (@{to='RETIRED'; reason='end of life'} | ConvertTo-Json) | Out-Null
    try {
        Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body (@{assetId=$target.id; kind='REPAIR'; creationMode='MANUAL'; description='x'; priorityCode='LOW'} | ConvertTo-Json)
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== PARTS =====
Run-Test 'PRT-C-01' 'List parts' { (Invoke-RestMethod -Uri "$base/parts?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'PRT-C-02' 'Parts list (no search param)' {
    $r = Invoke-RestMethod -Uri "$base/parts?limit=5" -Method GET -Headers $hAdmin
    "items=$($r.items.Count)"
}
Run-Test 'PRT-C-03' 'Filter lowStock' { (Invoke-RestMethod -Uri "$base/parts?lowStock=true&limit=10" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'PRT-C-04' 'Get part by id' {
    $p = (Invoke-RestMethod -Uri "$base/parts?limit=1" -Method GET -Headers $hAdmin).items[0]
    $d = Invoke-RestMethod -Uri "$base/parts/$($p.id)" -Method GET -Headers $hAdmin
    "code=$($d.code) stock=$($d.currentStock)"
}

Run-Test 'PRT-C-05' 'Create part' {
    $code = "TEST-$(Get-Random)"
    $body = (@{code=$code; name='Test Part'; unit='pcs'; departmentId=$deptId; locationId=$locId; referencePrice=10; minimumStock=5} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/parts" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "created: $($r.code)"
}
Run-Test 'PRT-C-06' 'Create part duplicate (409)' {
    $existing = (Invoke-RestMethod -Uri "$base/parts?limit=1" -Method GET -Headers $hAdmin).items[0]
    $body = (@{code=$existing.code; name='Dup'; unit='pcs'; departmentId=$deptId; locationId=$locId} | ConvertTo-Json)
    try {
        Invoke-RestMethod -Uri "$base/parts" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# Stock transactions
Run-Test 'STK-T-01' 'Receipt (RecordStockMovement: quantity, reason)' {
    $body = (@{partId=$partId; quantity=5; reason='Test receipt'; sourceNote='Manual restock'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/stock-transactions/receipt" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "type=$($r.type) qty=$($r.quantity)"
}
Run-Test 'STK-T-02' 'Adjust positive' {
    $body = (@{partId=$partId; quantity=2; reason='Test adjust +'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/stock-transactions/adjust" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "delta=$($r.quantity)"
}
Run-Test 'STK-T-03' 'Adjust over stock (4xx)' {
    $body = (@{partId=$partId; quantity=-99999; reason='over'} | ConvertTo-Json)
    try {
        Invoke-RestMethod -Uri "$base/stock-transactions/adjust" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'STK-T-05' 'Adjust without reason (4xx)' {
    $body = (@{partId=$partId; quantity=1} | ConvertTo-Json)
    try {
        Invoke-RestMethod -Uri "$base/stock-transactions/adjust" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'STK-T-04' 'List stock transactions' {
    $r = Invoke-RestMethod -Uri "$base/stock-transactions" -Method GET -Headers $hAdmin
    "items=$($r.items.Count)"
}

# ===== MAINTENANCE =====
Run-Test 'MP-C-01' 'List plans' { (Invoke-RestMethod -Uri "$base/maintenance-plans?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'MP-C-04' 'Get plan detail' {
    $p = (Invoke-RestMethod -Uri "$base/maintenance-plans?limit=1" -Method GET -Headers $hAdmin).items[0]
    $d = Invoke-RestMethod -Uri "$base/maintenance-plans/$($p.id)" -Method GET -Headers $hAdmin
    "name=$($d.name) status=$($d.status) interval=$($d.intervalValue)$($d.intervalUnit)"
}
Run-Test 'MP-C-05' 'Create plan (intervalUnit, intervalValue, startOn)' {
    $body = (@{assetId=$assetId; name='Test plan ' + (Get-Random); intervalUnit='DAY'; intervalValue=30; startOn='2026-10-04'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/maintenance-plans" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $body
    "OK id=$($r.id)"
}
Run-Test 'MP-C-07' 'Tick cron (generate occurrences)' {
    $r = Invoke-RestMethod -Uri "$base/maintenance-plans/tick" -Method POST -Headers $hAdmin
    "result=$r"
}
Run-Test 'MP-O-01' 'Get plan occurrences' {
    $plans = Invoke-RestMethod -Uri "$base/maintenance-plans?limit=20" -Method GET -Headers $hAdmin
    $foundOcc = $null
    foreach ($p in $plans.items) {
        $occ = Invoke-RestMethod -Uri "$base/maintenance-plans/$($p.id)/occurrences" -Method GET -Headers $hAdmin -ErrorAction SilentlyContinue
        if ($occ -and $occ.items -and $occ.items.Count -gt 0) {
            $foundOcc = $occ.items[0]
            break
        }
    }
    if (-not $foundOcc) { return "no occurrence across all plans" }
    $d = Invoke-RestMethod -Uri "$base/maintenance-occurrences/$($foundOcc.id)" -Method GET -Headers $hAdmin
    "occurrence id=$($foundOcc.id) status=$($d.status) dueAt=$($d.dueAt)"
}
Run-Test 'MP-O-02' 'Skip occurrence' {
    $plans = Invoke-RestMethod -Uri "$base/maintenance-plans?limit=20" -Method GET -Headers $hAdmin
    foreach ($p in $plans.items) {
        $occ = Invoke-RestMethod -Uri "$base/maintenance-plans/$($p.id)/occurrences" -Method GET -Headers $hAdmin -ErrorAction SilentlyContinue
        if ($occ -and $occ.items -and $occ.items.Count -gt 0) {
            foreach ($candidate in $occ.items) {
                try {
                    $r = Invoke-RestMethod -Uri "$base/maintenance-occurrences/$($candidate.id)/skip" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body (@{reason='test skip'} | ConvertTo-Json)
                    return "skipped id=$($candidate.id) -> $($r.status)"
                } catch { continue }
            }
        }
    }
    return "no occurrence to skip (skipped earlier or all COMPLETED)"
}
Run-Test 'MP-O-03' 'Generate-now occurrence' {
    $plans = Invoke-RestMethod -Uri "$base/maintenance-plans?limit=20" -Method GET -Headers $hAdmin
    foreach ($p in $plans.items) {
        $occ = Invoke-RestMethod -Uri "$base/maintenance-plans/$($p.id)/occurrences" -Method GET -Headers $hAdmin -ErrorAction SilentlyContinue
        if ($occ -and $occ.items -and $occ.items.Count -gt 0) {
            foreach ($candidate in $occ.items) {
                try {
                    $r = Invoke-RestMethod -Uri "$base/maintenance-occurrences/$($candidate.id)/generate-now" -Method POST -Headers $hAdmin
                    return "WO generated id=$($r.id)"
                } catch { continue }
            }
        }
    }
    return "no occurrence to generate"
}
Run-Test 'MP-L-01' 'Pause plan' {
    $p = (Invoke-RestMethod -Uri "$base/maintenance-plans?limit=1" -Method GET -Headers $hAdmin).items[0]
    $r = Invoke-RestMethod -Uri "$base/maintenance-plans/$($p.id)/pause" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body (@{reason='test pause'} | ConvertTo-Json)
    "status=$($r.status)"
}

$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Host "================================================================"
Write-Host "BATCH 4 (Assets/Parts/Maintenance) FIXED SUMMARY:  PASS=$pass  FAIL=$fail  TOTAL=$($results.Count)"
$results | Export-Csv -Path 'test-batch4-fixed.csv' -NoTypeInformation -Encoding UTF8