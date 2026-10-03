# BATCH 3 FIXED: Work Orders + Dashboard
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
$meAdmin = Invoke-RestMethod -Uri "$base/iam/me/permissions" -Method GET -Headers $hAdmin
$meTech = Invoke-RestMethod -Uri "$base/iam/me/permissions" -Method GET -Headers $hTech
$adminId = $meAdmin.user.id
$techId = $meTech.user.id

# Get a non-CLOSED incident
$inc = Invoke-RestMethod -Uri "$base/incidents?status=IN_PROGRESS&limit=1" -Method GET -Headers $hAdmin
$incId = $inc.items[0].id

Write-Host "Setup: assetId=$assetId  techId=$techId  incId=$incId"

# ===== WO CRUD =====
Run-Test 'WO-C-01' 'List work-orders' { (Invoke-RestMethod -Uri "$base/work-orders?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'WO-C-02' 'Filter status=NEW' { (Invoke-RestMethod -Uri "$base/work-orders?status=NEW&limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'WO-C-03' 'Filter assignee=tech' { (Invoke-RestMethod -Uri "$base/work-orders?assigneeId=$techId&limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'WO-C-05' 'Get WO by id' {
    $r = (Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $hAdmin).items[0]
    $d = Invoke-RestMethod -Uri "$base/work-orders/$($r.id)" -Method GET -Headers $hAdmin
    "status=$($d.status) assignee=$($d.assigneeId)"
}
Run-Test 'WO-C-11' 'SLA status endpoint' {
    $r = (Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $hAdmin).items[0]
    $s = Invoke-RestMethod -Uri "$base/work-orders/$($r.id)/sla-status" -Method GET -Headers $hAdmin
    "state=$($s.state) breached=$($s.breached)"
}

# Create WO manual - using FIXED DTO: kind, creationMode, priorityCode, description
Run-Test 'WO-C-06' 'Create WO manual (manager)' {
    $body = '{"assetId":"' + $assetId + '","kind":"REPAIR","creationMode":"MANUAL","description":"Test WO manual","priorityCode":"HIGH"}'
    $r = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $body
    "OK id=$($r.id) status=$($r.status)"
}
Run-Test 'WO-C-07' 'Create WO from incident' {
    # Create fresh incident
    $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body ('{"assetId":"' + $assetId + '","description":"WO from inc test","impactDescription":"x"}')
    $body = (@{assetId = $assetId; incidentId = $newInc.id; kind = 'REPAIR'; creationMode = 'FROM_INCIDENT'; description = 'From inc'; priorityCode = 'HIGH'} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $body
    "OK id=$($r.id)"
}
Run-Test 'WO-C-09' 'Create WO missing required (400)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body '{"description":"x"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# Create WO with assignee so we can drive the state machine
$woBody = '{"assetId":"' + $assetId + '","kind":"REPAIR","creationMode":"MANUAL","description":"state machine test","priorityCode":"HIGH","assigneeId":"' + $techId + '"}'
$wo = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $woBody
$WOID = $wo.id
Write-Host "Created WO: $WOID status=$($wo.status)"

# ===== STATE MACHINE =====
Run-Test 'WO-S-03' 'ASSIGNED -> IN_PROGRESS (transition)' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/transition" -Method PATCH -ContentType 'application/json' -Headers $hTech -Body '{"to":"IN_PROGRESS"}'
    "status=$($r.status)"
}
Run-Test 'WO-A-04' 'Add PROGRESS note (noteType, note)' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/notes" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"noteType":"PROGRESS","note":"Replacing bearing"}'
    "noteType=$($r.noteType)"
}
Run-Test 'WO-A-05' 'Pause WO (WAITING_PART)' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/notes" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"noteType":"PAUSE_START","pauseReason":"WAITING_PART","note":"Need bearing"}'
    "noteType=$($r.noteType) reason=$($r.pauseReason)"
}
Run-Test 'WO-A-06' 'Pause without reason (400)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders/$WOID/notes" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"noteType":"PAUSE_START","note":"x"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'WO-A-07' 'Resume WO (PAUSE_END)' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/notes" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"noteType":"PAUSE_END","note":"Back to work"}'
    "noteType=$($r.noteType)"
}
Run-Test 'WO-S-09' 'IN_PROGRESS -> COMPLETED' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/complete" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{}'
    "status=$($r.status)"
}
Run-Test 'WO-S-11' 'COMPLETED -> any (terminal, expect 4xx)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders/$WOID/transition" -Method PATCH -ContentType 'application/json' -Headers $hTech -Body '{"to":"IN_PROGRESS"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# Reassign test on a NEW WO
$wo2 = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $woBody
$WOID2 = $wo2.id
Run-Test 'WO-S-01' 'NEW -> ASSIGNED (via assign endpoint)' {
    $newWo = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $woBody
    $r = Invoke-RestMethod -Uri "$base/work-orders/$($newWo.id)/assign" -Method PATCH -ContentType 'application/json' -Headers $hMgr -Body (@{assigneeId = $techId} | ConvertTo-Json)
    "status=$($r.status) assignee=$($r.assigneeId)"
}
Run-Test 'WO-A-03' 'Assign COMPLETED WO (400)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders/$WOID/assign" -Method PATCH -ContentType 'application/json' -Headers $hMgr -Body '{"assigneeId":"' + $techId + '"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== COST ENTRIES =====
Run-Test 'WO-CT-01' 'List cost entries' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method GET -Headers $hAdmin
    "items=$($r.Count)"
}
Run-Test 'WO-CT-03' 'Add LABOR cost (quantity, unitPrice, description)' {
    $body = '{"category":"LABOR","quantity":2,"unitPrice":50,"description":"Labor 2h"}'
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method POST -ContentType 'application/json' -Headers $hTech -Body $body
    "category=$($r.category) amount=$($r.amount)"
}
Run-Test 'WO-CT-02' 'Add PART cost' {
    $body = '{"category":"PART","quantity":1,"unitPrice":25,"description":"Part cost"}'
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method POST -ContentType 'application/json' -Headers $hTech -Body $body
    "category=$($r.category)"
}
Run-Test 'WO-CT-04' 'Add OTHER cost' {
    $body = '{"category":"OTHER","quantity":1,"unitPrice":10,"description":"Misc"}'
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method POST -ContentType 'application/json' -Headers $hTech -Body $body
    "category=$($r.category)"
}
Run-Test 'WO-CT-05' 'CREDIT direction' {
    $body = '{"category":"OTHER","direction":"CREDIT","quantity":1,"unitPrice":5,"description":"Return"}'
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method POST -ContentType 'application/json' -Headers $hTech -Body $body
    "direction=$($r.direction)"
}
Run-Test 'WO-CT-06' 'Amount negative (400)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders/$WOID/cost-entries" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"category":"OTHER","quantity":-1,"unitPrice":1,"description":"x"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# Planned parts
Run-Test 'WO-P-02' 'Add planned part (admin)' {
    # Use a NEW WO that's IN_PROGRESS so we can plan parts
    $newWo2 = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body (@{assetId=$assetId;kind='REPAIR';creationMode='MANUAL';description='planned part test';priorityCode='HIGH';assigneeId=$techId} | ConvertTo-Json)
    $partForPlan = (Invoke-RestMethod -Uri "$base/parts?limit=1" -Method GET -Headers $hAdmin).items[0]
    $body = (@{partId=$partForPlan.id;plannedQuantity=2} | ConvertTo-Json)
    $r = Invoke-RestMethod -Uri "$base/work-orders/$($newWo2.id)/parts/planned" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
    "OK partId=$($r.partId)"
}
Run-Test 'WO-P-03' 'Planned qty negative (400)' {
    try {
        Invoke-RestMethod -Uri "$base/work-orders/$WOID/parts/planned" -Method POST -ContentType 'application/json' -Headers $hTech -Body '{"partId":"' + $ids.partId + '","plannedQuantity":-1}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'WO-P-01' 'List planned parts' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$WOID/parts/planned" -Method GET -Headers $hAdmin
    "items=$($r.Count)"
}

# Cancel test (NEW WO -> CANCELLED)
$wo3 = Invoke-RestMethod -Uri "$base/work-orders" -Method POST -ContentType 'application/json' -Headers $hMgr -Body $woBody
Run-Test 'WO-S-02' 'NEW -> CANCELLED' {
    $r = Invoke-RestMethod -Uri "$base/work-orders/$($wo3.id)/cancel" -Method POST -ContentType 'application/json' -Headers $hMgr -Body (@{reason = 'test cancel'} | ConvertTo-Json)
    "status=$($r.status)"
}

# ===== DASHBOARD =====
Run-Test 'DB-01' 'Dashboard KPIs' {
    $r = Invoke-RestMethod -Uri "$base/dashboard/kpis" -Method GET -Headers $hAdmin
    "keys=$($r.PSObject.Properties.Name -join ',')"
}
Run-Test 'DB-02' 'Overdue WOs' { (Invoke-RestMethod -Uri "$base/dashboard/overdue" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'DB-03' 'Technician load' { (Invoke-RestMethod -Uri "$base/dashboard/technician-load" -Method GET -Headers $hAdmin).Count }
Run-Test 'DB-04' 'Asset critical' { (Invoke-RestMethod -Uri "$base/dashboard/asset-critical" -Method GET -Headers $hAdmin).Count }
Run-Test 'DB-05' 'Cost trend' {
    $r = Invoke-RestMethod -Uri "$base/dashboard/cost-trend?from=2026-01-01&to=2026-12-31&bucket=month" -Method GET -Headers $hAdmin
    "keys=$($r.PSObject.Properties.Name -join ',')"
}
Run-Test 'DB-06' 'Action items' { (Invoke-RestMethod -Uri "$base/dashboard/action-items" -Method GET -Headers $hAdmin).items.Count }

$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Host "================================================================"
Write-Host "BATCH 3 (WO+Dashboard) FIXED SUMMARY:  PASS=$pass  FAIL=$fail  TOTAL=$($results.Count)"
$results | Export-Csv -Path 'test-batch3-fixed.csv' -NoTypeInformation -Encoding UTF8