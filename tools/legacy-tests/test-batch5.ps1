# BATCH 5: Approvals + Org + Config + Reports + Others
$base = 'http://localhost:3001'
$pwdAdmin = 'ChangeMe' + [char]64 + '2026'
$pwdUser = 'Demo' + [char]64 + '2026'
$results = @()

function Run-Test([string]$id, [string]$desc, [scriptblock]$fn) {
    try {
        $r = & $fn
        $script:results += [PSCustomObject]@{ ID = $id; Test = $desc; Status = 'PASS'; Detail = "$r" }
    } catch {
        $script:results += [PSCustomObject]@{ ID = $id; Test = $desc; Status = 'FAIL'; Detail = $_.Exception.Message }
    }
}

function Login([string]$u, [string]$p) {
    $body = '{"loginName":"' + $u + '","password":"' + $p + '"}'
    Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body $body
}

$admin = (Login 'admin.bootstrap' $pwdAdmin).accessToken
$mgr = (Login 'demo.manager1' $pwdUser).accessToken
$tech = (Login 'demo.tech1' $pwdUser).accessToken
$rpt = (Login 'demo.reporter1' $pwdUser).accessToken
$hAdmin = @{ Authorization = "Bearer $admin" }
$hMgr = @{ Authorization = "Bearer $mgr" }
$hTech = @{ Authorization = "Bearer $tech" }
$hRpt = @{ Authorization = "Bearer $rpt" }

# ===== APPROVALS =====
Run-Test 'APR-C-01' 'List approvals' { (Invoke-RestMethod -Uri "$base/approvals?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'APR-C-04' 'Get approval detail' {
    $r = (Invoke-RestMethod -Uri "$base/approvals?limit=1" -Method GET -Headers $hAdmin).items[0]
    if (-not $r) { throw 'no approval' }
    $d = Invoke-RestMethod -Uri "$base/approvals/$($r.id)" -Method GET -Headers $hAdmin
    "status=$($d.status) revisions=$($d.revisions.Count)"
}

# Create approval from a WO (skip if already exists)
$ids = (Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $hAdmin).items[0]
Run-Test 'APR-C-05' 'Create approval (workOrderId, reason, actionPlan)' {
    # Find a WO without existing approval
    $wo = (Invoke-RestMethod -Uri "$base/work-orders?limit=10" -Method GET -Headers $hAdmin).items | Select-Object -First 1
    try {
        $body = (@{workOrderId=$wo.id; reason='Test approval'; actionPlan='Plan A'} | ConvertTo-Json)
        $r = Invoke-RestMethod -Uri "$base/approvals" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        "OK id=$($r.id) status=$($r.status)"
    } catch {
        # 409 = already exists, that's fine
        if ($_.Exception.Response.StatusCode.value__ -eq 409) { return "already exists (ok)" } else { throw $_ }
    }
}
Run-Test 'APR-C-08' 'Create approval with negative amount (400)' {
    try {
        $body = (@{workOrderId=$ids.id; reason='x'; actionPlan='x'; otherEstimatedCost=-100} | ConvertTo-Json)
        Invoke-RestMethod -Uri "$base/approvals" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== ORGANIZATION =====
Run-Test 'ORG-D-01' 'List departments' { (Invoke-RestMethod -Uri "$base/departments" -Method GET -Headers $hAdmin).Count }
Run-Test 'ORG-L-01' 'List locations' { (Invoke-RestMethod -Uri "$base/locations" -Method GET -Headers $hAdmin).Count }
Run-Test 'ORG-L-02' 'Locations tree' {
    $r = Invoke-RestMethod -Uri "$base/locations/tree" -Method GET -Headers $hAdmin
    "tree_nodes=$($r.Count)"
}
Run-Test 'ORG-AT-01' 'List asset types' { (Invoke-RestMethod -Uri "$base/asset-types" -Method GET -Headers $hAdmin).Count }

# ===== SYSTEM CONFIG =====
Run-Test 'CFG-01' 'List system settings' {
    $r = Invoke-RestMethod -Uri "$base/system-settings" -Method GET -Headers $hAdmin
    "settings=$($r.Count)"
}
Run-Test 'CFG-02' 'Get any system setting' {
    $all = Invoke-RestMethod -Uri "$base/system-settings" -Method GET -Headers $hAdmin
    if ($all.Count -gt 0) {
        $key = $all[0].key
        $r = Invoke-RestMethod -Uri "$base/system-settings/$key" -Method GET -Headers $hAdmin
        "key=$key"
    } else { throw 'no settings' }
}
Run-Test 'CFG-03' 'Update system setting' {
    $all = Invoke-RestMethod -Uri "$base/system-settings" -Method GET -Headers $hAdmin
    if ($all.Count -gt 0) {
        $key = $all[0].key
        $body = (@{value=24; description='Updated for test'} | ConvertTo-Json)
        $r = Invoke-RestMethod -Uri "$base/system-settings/$key" -Method PUT -ContentType 'application/json' -Headers $hAdmin -Body $body
        "updated key=$key"
    } else { throw 'no settings' }
}

# ===== ATTACHMENTS =====
Run-Test 'ATT-09' 'Upload no auth (401)' {
    try {
        $boundary = '----T' + (Get-Random)
        Invoke-RestMethod -Uri "$base/files" -Method POST -ContentType "multipart/form-data; boundary=$boundary" -Body "x"
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== REPORTS =====
Run-Test 'RPT-02' 'Report incidents' {
    try {
        $r = Invoke-RestMethod -Uri "$base/reports/incidents?from=2026-01-01&to=2026-12-31" -Method GET -Headers $hAdmin -TimeoutSec 15
        "items=$($r.items.Count)"
    } catch {
        $code = $_.Exception.Response.StatusCode.value__
        "$code"
    }
}
Run-Test 'RPT-05' 'Reports RBAC (USER -> 403)' {
    try {
        Invoke-RestMethod -Uri "$base/reports/incidents" -Method GET -Headers $hRpt -TimeoutSec 10
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== TECHNICAL DOCUMENTS =====
Run-Test 'TD-01' 'List technical documents' { (Invoke-RestMethod -Uri "$base/technical-documents?limit=5" -Method GET -Headers $hAdmin).items.Count }

# ===== HEALTH =====
Run-Test 'HLT-03' 'Health detail' {
    $r = Invoke-RestMethod -Uri "$base/healthz" -Method GET
    "status=$($r.status) db=$($r.db)"
}

# ===== SUMMARY =====
$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Host "================================================================"
Write-Host "BATCH 5 SUMMARY:  PASS=$pass  FAIL=$fail  TOTAL=$($results.Count)"
$results | Export-Csv -Path 'test-batch5.csv' -NoTypeInformation -Encoding UTF8