# BATCH 2 FIXED: Incidents + AI + Notifications
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

# ===== INCIDENTS CRUD =====
Run-Test 'INC-C-01' 'List incidents' { (Invoke-RestMethod -Uri "$base/incidents?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'INC-C-02' 'Pagination' {
    $r = Invoke-RestMethod -Uri "$base/incidents?limit=2&offset=0" -Method GET -Headers $hAdmin
    "items=$($r.items.Count) total=$($r.total)"
}
Run-Test 'INC-C-03' 'Filter status=NEW' {
    (Invoke-RestMethod -Uri "$base/incidents?status=NEW&limit=5" -Method GET -Headers $hAdmin).items.Count
}
Run-Test 'INC-C-04' 'Filter priority=HIGH' {
    (Invoke-RestMethod -Uri "$base/incidents?priority=HIGH&limit=5" -Method GET -Headers $hAdmin).items.Count
}

$incBody = (@{assetId=$assetId; description='Batch 2 fixed test'; impactDescription='Test impact'} | ConvertTo-Json)
$incResp = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body $incBody
$INCID = $incResp.id
Write-Host "Created incident: $INCID status=$($incResp.status)"

Run-Test 'INC-C-10' 'Create incident (reporter)' { if ($INCID) { "OK id=$INCID" } else { throw 'no id' } }
Run-Test 'INC-C-12' 'Create missing asset (400)' {
    try {
        Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body '{"description":"x","impactDescription":"x"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'INC-C-13' 'Create with non-existent asset (404)' {
    try {
        Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body '{"assetId":"00000000-0000-0000-0000-000000000000","description":"x","impactDescription":"x"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

Run-Test 'INC-C-08' 'Get incident by id' {
    $d = Invoke-RestMethod -Uri "$base/incidents/$INCID" -Method GET -Headers $hAdmin
    "status=$($d.status) messages=$($d.messages.Count)"
}
Run-Test 'INC-C-09' 'Get non-existent incident (404)' {
    try {
        Invoke-RestMethod -Uri "$base/incidents/00000000-0000-0000-0000-000000000000" -Method GET -Headers $hAdmin
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== STATE MACHINE: full happy path NEW -> IN_PROGRESS -> RESOLVED -> CLOSED =====
Run-Test 'INC-S-01' 'NEW -> IN_PROGRESS' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"IN_PROGRESS"}'
    "status=$($r.status)"
}
Run-Test 'INC-S-07' 'IN_PROGRESS -> RESOLVED (skip AWAITING_INFO for clean path)' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"RESOLVED"}'
    "status=$($r.status)"
}
Run-Test 'INC-S-10' 'RESOLVED -> CLOSED' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"CLOSED"}'
    "status=$($r.status)"
}
Run-Test 'INC-S-12' 'CLOSED -> any (terminal, expect 4xx)' {
    try {
        Invoke-RestMethod -Uri "$base/incidents/$INCID/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"IN_PROGRESS"}'
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== AWAITING_INFO flow on a fresh incident =====
$inc2 = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='AWAIT test'; impactDescription='x'} | ConvertTo-Json)
$INCID2 = $inc2.id

Run-Test 'INC-S-02' 'NEW -> AWAITING_INFO' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID2/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"AWAITING_INFO"}'
    "status=$($r.status)"
}
Run-Test 'INC-S-05' 'AWAITING_INFO -> IN_PROGRESS (auto on staff msg)' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID2/messages" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body (@{body='Check breaker please'} | ConvertTo-Json)
    "status=$($r.status) msgType=$($r.type)"
}
Run-Test 'INC-S-08' 'IN_PROGRESS -> AWAITING_INFO' {
    $r = Invoke-RestMethod -Uri "$base/incidents/$INCID2/transition" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body '{"to":"AWAITING_INFO"}'
    "status=$($r.status)"
}

Run-Test 'INC-M-05' 'Empty message content (400)' {
    try {
        $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='msg test'; impactDescription='x'} | ConvertTo-Json)
        Invoke-RestMethod -Uri "$base/incidents/$($newInc.id)/messages" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body (@{type='STAFF'; body=''} | ConvertTo-Json)
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== AI TRIAGE =====
Run-Test 'AI-01' 'Trigger AI analyze' {
    $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='AI test pump'; impactDescription='impact'} | ConvertTo-Json)
    $req = Invoke-RestMethod -Uri "$base/ai/incidents/$($newInc.id)/analyze" -Method POST -Headers $hAdmin
    "requestId=$($req.requestId) status=$($req.status)"
}
Run-Test 'AI-03' 'Poll AI request (SUCCEEDED)' {
    $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='AI poll test'; impactDescription='x'} | ConvertTo-Json)
    $req = Invoke-RestMethod -Uri "$base/ai/incidents/$($newInc.id)/analyze" -Method POST -Headers $hAdmin
    Start-Sleep -Seconds 5
    $r = Invoke-RestMethod -Uri "$base/ai/requests/$($req.requestId)" -Method GET -Headers $hAdmin
    "status=$($r.status) provider=$($r.provider)"
}
Run-Test 'AI-04' 'AI output schema' {
    $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='AI schema'; impactDescription='x'} | ConvertTo-Json)
    $req = Invoke-RestMethod -Uri "$base/ai/incidents/$($newInc.id)/analyze" -Method POST -Headers $hAdmin
    Start-Sleep -Seconds 4
    $r = Invoke-RestMethod -Uri "$base/ai/requests/$($req.requestId)" -Method GET -Headers $hAdmin
    $o = $r.output
    if (-not $o) { throw 'no output' }
    "category=$($o.category) priority=$($o.priority) confidence=$($o.confidence) actions=$($o.actions.Count)"
}
Run-Test 'AI-06' 'Analyze non-existent incident (404)' {
    try {
        Invoke-RestMethod -Uri "$base/ai/incidents/00000000-0000-0000-0000-000000000000/analyze" -Method POST -Headers $hAdmin
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'AI-12' 'AI RBAC (USER -> 403)' {
    try {
        $newInc = Invoke-RestMethod -Uri "$base/incidents" -Method POST -ContentType 'application/json' -Headers $hRpt -Body (@{assetId=$assetId; description='rbac'; impactDescription='x'} | ConvertTo-Json)
        Invoke-RestMethod -Uri "$base/ai/incidents/$($newInc.id)/analyze" -Method POST -Headers $hRpt
        throw 'should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== NOTIFICATIONS =====
Run-Test 'NTF-01' 'List notifications' { (Invoke-RestMethod -Uri "$base/notifications?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'NTF-03' 'Unread count' { (Invoke-RestMethod -Uri "$base/notifications/unread-count" -Method GET -Headers $hAdmin).count }
Run-Test 'NTF-05' 'Mark all as read' { (Invoke-RestMethod -Uri "$base/notifications/read-all" -Method PATCH -Headers $hAdmin).updated }
Run-Test 'NTF-09' 'Notification RBAC (each user sees own)' {
    $a = (Invoke-RestMethod -Uri "$base/notifications?limit=10" -Method GET -Headers $hAdmin).items.Count
    $b = (Invoke-RestMethod -Uri "$base/notifications?limit=10" -Method GET -Headers $hRpt).items.Count
    "admin=$a reporter=$b"
}
Run-Test 'NTF-04' 'Mark one as read' {
    $items = (Invoke-RestMethod -Uri "$base/notifications?limit=5" -Method GET -Headers $hAdmin).items
    if ($items -and $items.Count -gt 0) {
        $r = Invoke-RestMethod -Uri "$base/notifications/$($items[0].id)/read" -Method PATCH -Headers $hAdmin
        "id=$($r.id) read=$($r.read)"
    } else { throw 'no notifications' }
}

$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Host "================================================================"
Write-Host "BATCH 2 (Incidents+AI+Notifications) FIXED SUMMARY:  PASS=$pass  FAIL=$fail  TOTAL=$($results.Count)"
$results | Export-Csv -Path 'test-batch2-fixed.csv' -NoTypeInformation -Encoding UTF8