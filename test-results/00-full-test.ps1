$ErrorActionPreference = 'Continue';
$api = 'http://localhost:3001';
$pass = 0; $fail = 0;
$results = New-Object System.Collections.Generic.List[object];

function Call($method, $path, $token, $body) {
  $headers = @{};
  if ($token) { $headers['Authorization'] = "Bearer $token" };
  $params = @{
    Uri = "$api$path"
    Method = $method
    UseBasicParsing = $true
    Headers = $headers
    TimeoutSec = 15
  };
  if ($body) {
    $params['Body'] = ($body | ConvertTo-Json -Depth 10 -Compress);
    $params['ContentType'] = 'application/json';
  };
  try {
    $r = Invoke-WebRequest @params -ErrorAction Stop;
    $obj = $null;
    try { $obj = $r.Content | ConvertFrom-Json } catch {};
    return @{ status = [int]$r.StatusCode; body = $obj; raw = $r.Content }
  } catch {
    $code = 0;
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode };
    $rawBody = '';
    if ($_.Exception.Response) {
      try { $rawBody = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {}
    };
    return @{ status = $code; body = $null; raw = $rawBody; error = $_.Exception.Message }
  }
}

function Check($name, $expected, $actual) {
  $script:pass += $(if ($actual -eq $expected) { 1 } else { 0 });
  $script:fail += $(if ($actual -eq $expected) { 0 } else { 1 });
  $color = $(if ($actual -eq $expected) { 'Green' } else { 'Red' });
  $script:results.Add([PSCustomObject]@{
    Test = $name; Expected = $expected; Actual = $actual; Pass = ($actual -eq $expected)
  }) | Out-Null;
  $extra = '';
  if ($actual -ne $expected -and $r -and $r.raw) { $extra = " | " + $r.raw.Substring(0, [Math]::Min(120, $r.raw.Length)) }
  Write-Host ("  " + $(if ($actual -eq $expected) { "PASS" } else { "FAIL" }) + "  " + $name + " -> " + $actual + " (expected " + $expected + ")" + $extra) -ForegroundColor $color
}

function Items($body) {
  if (-not $body) { return @() };
  if ($body.PSObject.Properties['items']) { return $body.items };
  if ($body.PSObject.Properties['data']) { return $body.data };
  if ($body -is [array]) { return $body };
  return @($body)
}

Write-Host "`n========== TEST SUITE ==========" -ForegroundColor Cyan;
Write-Host "Started: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray;

# ==========================================
# 1) LOGIN (4 roles)
# ==========================================
Write-Host "`n--- 1) Login flow ---" -ForegroundColor Yellow;
$admin = Call POST '/auth/login' $null @{ loginName='admin.bootstrap'; password='ChangeMe@2026' };
Check 'POST /auth/login (admin)' 200 $admin.status;
  $adminTok = if ($admin.body) { $admin.body.accessToken } else { $null };

  $mgr = Call POST '/auth/login' $null @{ loginName='demo.manager1'; password='Demo@2026' };
  Check 'POST /auth/login (manager1)' 200 $mgr.status;
  $mgrTok = if ($mgr.body) { $mgr.body.accessToken } else { $null };

  $tech = Call POST '/auth/login' $null @{ loginName='demo.tech1'; password='Demo@2026' };
  Check 'POST /auth/login (tech1)' 200 $tech.status;
  $techTok = if ($tech.body) { $tech.body.accessToken } else { $null };

  $rep = Call POST '/auth/login' $null @{ loginName='demo.reporter1'; password='Demo@2026' };
  Check 'POST /auth/login (reporter1)' 200 $rep.status;
  $repTok = if ($rep.body) { $rep.body.accessToken } else { $null };

# Save tokens
$tokFile = "C:\Users\Hieu-PC\Projects\equipcare-ai\test-results\tokens.json";
@{
  admin = $adminTok
  manager = $mgrTok
  technician = $techTok
  reporter = $repTok
  adminUserId = $admin.body.token.userId
} | ConvertTo-Json | Set-Content $tokFile;

# Bad password
$bad = Call POST '/auth/login' $null @{ loginName='demo.manager1'; password='wrong' };
Check 'POST /auth/login (wrong password)' 401 $bad.status;

# /auth/me doesn't exist; use /iam/me/permissions as identity check
$me = Call GET '/iam/me/permissions' $adminTok;
Check 'GET /iam/me/permissions (admin self-check)' 200 $me.status;

# ==========================================
# 2) IAM
# ==========================================
Write-Host "`n--- 2) IAM module ---" -ForegroundColor Yellow;
$perms = Call GET '/iam/me/permissions' $adminTok;
Check 'GET /iam/me/permissions (admin)' 200 $perms.status;
Write-Host "    Admin permissions: $(if ($perms.body) { $perms.body.Count } else { 'N/A' })" -ForegroundColor Gray;

$users = Call GET '/iam/users' $adminTok;
Check 'GET /iam/users (admin)' 200 $users.status;
$userCount = if ($users.body) { @(Items $users.body).Count } else { 0 };
Write-Host "    Total users: $userCount" -ForegroundColor Gray;

$permsMgr = Call GET '/iam/me/permissions' $mgrTok;
Check 'GET /iam/me/permissions (manager)' 200 $permsMgr.status;
Write-Host "    Manager permissions: $(if ($permsMgr.body) { $permsMgr.body.Count } else { 'N/A' })" -ForegroundColor Gray;

$permsRep = Call GET '/iam/me/permissions' $repTok;
Check 'GET /iam/me/permissions (reporter)' 200 $permsRep.status;
Write-Host "    Reporter permissions: $(if ($permsRep.body) { $permsRep.body.Count } else { 'N/A' })" -ForegroundColor Gray;

# Reporter cannot list users
$usersRep = Call GET '/iam/users' $repTok;
Check 'GET /iam/users (reporter -> forbidden)' 403 $usersRep.status;

# ==========================================
# 3) DASHBOARD
# ==========================================
Write-Host "`n--- 3) Dashboard ---" -ForegroundColor Yellow;
$kpis = Call GET '/dashboard/kpis' $mgrTok;
Check 'GET /dashboard/kpis (manager)' 200 $kpis.status;
if ($kpis.body) { Write-Host "    KPIs: $($kpis.body | ConvertTo-Json -Compress)" -ForegroundColor Gray }

$overdue = Call GET '/dashboard/overdue' $mgrTok;
Check 'GET /dashboard/overdue (manager)' 200 $overdue.status;

$actItems = Call GET '/dashboard/action-items' $mgrTok;
Check 'GET /dashboard/action-items (manager)' 200 $actItems.status;

$techLoad = Call GET '/dashboard/technician-load' $mgrTok;
Check 'GET /dashboard/technician-load (manager)' 200 $techLoad.status;

# ==========================================
# 4) ASSETS
# ==========================================
Write-Host "`n--- 4) Assets ---" -ForegroundColor Yellow;
$assets = Call GET '/assets' $mgrTok;
Check 'GET /assets (manager)' 200 $assets.status;
if ($assets.body) {
  $items = Items $assets.body;
  $assetCount = @($items).Count;
  Write-Host "    Total assets: $assetCount" -ForegroundColor Gray;
  if ($assetCount -gt 0) {
    $firstAsset = $items[0];
    $assetId = $firstAsset.id;
    $assetDetail = Call GET "/assets/$assetId" $mgrTok;
    Check "GET /assets/:id (manager)" 200 $assetDetail.status;
    
    $qr = Call GET "/assets/$assetId/qr" $mgrTok;
    Check "GET /assets/:id/qr (manager)" 200 $qr.status;
  }
}

# Reporter should see assets too
$assetsRep = Call GET '/assets' $repTok;
Check 'GET /assets (reporter)' 200 $assetsRep.status;

# ==========================================
# 5) INCIDENTS
# ==========================================
Write-Host "`n--- 5) Incidents ---" -ForegroundColor Yellow;
$incidents = Call GET '/incidents' $mgrTok;
Check 'GET /incidents (manager)' 200 $incidents.status;
$incCount = if ($incidents.body) { @(Items $incidents.body).Count } else { 0 };
Write-Host "    Total incidents: $incCount" -ForegroundColor Gray;

# Create a new incident as reporter
$assetsList = Call GET '/assets?limit=1' $repTok;
$newAssetId = if ($assetsList.body) {
  $ai = Items $assetsList.body;
  if (@($ai).Count -gt 0) { $ai[0].id } else { $null }
} else { $null };
if ($newAssetId) {
  $newInc = Call POST '/incidents' $repTok @{
    assetId = $newAssetId
    description = "TEST E2E: motor kêu bất thường, rung mạnh"
    impactDescription = "Ảnh hưởng 20% công suất"
  };
  Check 'POST /incidents (reporter)' 201 $newInc.status;
  $newIncId = if ($newInc.body) { $newInc.body.id } else { $null };
  Write-Host "    New incident: $newIncId" -ForegroundColor Gray;
  
  if ($newIncId) {
    # Triage as manager - move from NEW to IN_PROGRESS
    $triage = Call POST "/incidents/$newIncId/transition" $mgrTok @{
      to = 'IN_PROGRESS'
      reason = 'Test transition E2E'
    };
    Check 'POST /incidents/:id/transition IN_PROGRESS' 200 $triage.status;
    
    # Add message
    $msg = Call POST "/incidents/$newIncId/messages" $mgrTok @{
      body = "Vui lòng kiểm tra thêm thông số rung"
    };
    Check 'POST /incidents/:id/messages' 201 $msg.status;
  }
}

# ==========================================
# 6) WORK ORDERS
# ==========================================
Write-Host "`n--- 6) Work Orders ---" -ForegroundColor Yellow;
$wos = Call GET '/work-orders' $mgrTok;
Check 'GET /work-orders (manager)' 200 $wos.status;
$woCount = if ($wos.body) { @(Items $wos.body).Count } else { 0 };
Write-Host "    Total WOs: $woCount" -ForegroundColor Gray;

# Get one NEW WO and assign it to technician
$woList = Items $wos.body;
$newWo = $woList | Where-Object { $_.status -eq 'NEW' } | Select-Object -First 1;
if ($newWo) {
  # Get tech user id
  $techUser = (Call GET '/iam/me/permissions' $techTok).body.user;
  $techUserId = $techUser.id;
  
  # Assign to tech
  $assign = Call PATCH "/work-orders/$($newWo.id)/assign" $mgrTok @{
    assigneeId = $techUserId
  };
  Check 'PATCH /work-orders/:id/assign (manager)' 200 $assign.status;
  
  # Tech transitions ASSIGNED -> IN_PROGRESS
  $start = Call PATCH "/work-orders/$($newWo.id)/transition" $techTok @{
    to = 'IN_PROGRESS'
  };
  Check 'PATCH /work-orders/:id/transition IN_PROGRESS' 200 $start.status;
  
  # Tech completes WO
  $complete = Call POST "/work-orders/$($newWo.id)/complete" $techTok @{
    actionTaken = "E2E test: replaced bearing"
    confirmedCause = "Worn bearing after long use"
    resultSummary = "Equipment back to normal operation"
  };
    Check 'POST /work-orders/:id/complete (tech)' 201 $complete.status;
}

# ==========================================
# 7) APPROVALS
# ==========================================
Write-Host "`n--- 7) Approvals ---" -ForegroundColor Yellow;
$apprs = Call GET '/approvals' $mgrTok;
Check 'GET /approvals (manager)' 200 $apprs.status;
$apprCount = if ($apprs.body) { @(Items $apprs.body).Count } else { 0 };
Write-Host "    Total approvals: $apprCount" -ForegroundColor Gray;

# Filter pending approvals for manager
$apprQueue = Call GET '/approvals?status=SUBMITTED' $mgrTok;
$pendingApprs = Items $apprQueue.body;
Write-Host "    Pending approvals (mine): $(@($pendingApprs).Count)" -ForegroundColor Gray;
if (@($pendingApprs).Count -gt 0) {
  $firstAppr = $pendingApprs[0];
  $apprDetail = Call GET "/approvals/$($firstAppr.id)" $mgrTok;
  Check 'GET /approvals/:id (manager)' 200 $apprDetail.status;
}

# ==========================================
# 8) INVENTORY
# ==========================================
Write-Host "`n--- 8) Inventory ---" -ForegroundColor Yellow;
$parts = Call GET '/parts' $mgrTok;
Check 'GET /parts (manager)' 200 $parts.status;
$partCount = if ($parts.body) { @(Items $parts.body).Count } else { 0 };
Write-Host "    Total parts: $partCount" -ForegroundColor Gray;

# ==========================================
# 9) MAINTENANCE PLANS
# ==========================================
Write-Host "`n--- 9) Maintenance ---" -ForegroundColor Yellow;
$plans = Call GET '/maintenance-plans' $mgrTok;
Check 'GET /maintenance-plans (manager)' 200 $plans.status;
$planCount = if ($plans.body) { @(Items $plans.body).Count } else { 0 };
Write-Host "    Total plans: $planCount" -ForegroundColor Gray;

# ==========================================
# 14) RBAC DENIALS
# ==========================================
Write-Host "`n--- 14) RBAC denials ---" -ForegroundColor Yellow;
# Reporter cannot suspend/retire asset (lifecycle)
$lifecycleRep = Call POST "/assets/$assetId/lifecycle" $repTok @{
  to = 'SUSPENDED'
  reason = 'Test denial'
};
Check 'POST /assets/:id/lifecycle (reporter -> 403)' 403 $lifecycleRep.status;
# Reporter cannot create WO
$repAssets = Items (Call GET '/assets?limit=1' $repTok).body;
if (@($repAssets).Count -gt 0) {
  $newWoRep = Call POST '/work-orders' $repTok @{
    assetId = $repAssets[0].id
    kind = 'INSPECTION'
    title = 'TEST reporter'
    description = 'Should be denied'
  };
  Check 'POST /work-orders (reporter -> 403)' 403 $newWoRep.status;
}
# Manager cannot manage users
$newUserMgr = Call POST '/iam/users' $mgrTok @{
  loginName = 'denied.user'
  fullName = 'Denied User'
  email = 'denied@test.com'
};
Check 'POST /iam/users (manager -> 403)' 403 $newUserMgr.status;
# Tech cannot decide approval (self-approve prevention)
$techApprList = Items (Call GET '/approvals?status=SUBMITTED' $techTok).body;
if (@($techApprList).Count -gt 0) {
  $decideAppr = Call PATCH "/approvals/$($techApprList[0].id)/draft" $techTok @{ decision = 'APPROVED' };
  # This is not decide - try decide endpoint
  $tryAppr = Invoke-WebRequest -Uri "$api/approvals/$($techApprList[0].id)" -Method GET -UseBasicParsing -Headers @{ Authorization = "Bearer $techTok" };
  Write-Host "    Tech viewing approval: $($tryAppr.StatusCode)" -ForegroundColor Gray;
}

# ==========================================
# 15) NOTIFICATIONS
# ==========================================
Write-Host "`n--- 15) Notifications ---" -ForegroundColor Yellow;
$notif = Call GET '/notifications' $mgrTok;
Check 'GET /notifications (manager)' 200 $notif.status;
$notifCount = if ($notif.body) { @(Items $notif.body).Count } else { 0 };
Write-Host "    Total notifications: $notifCount" -ForegroundColor Gray;

$unread = Call GET '/notifications/unread-count' $mgrTok;
Check 'GET /notifications/unread-count' 200 $unread.status;

# ==========================================
# 11) REPORTS
# ==========================================
Write-Host "`n--- 11) Reports ---" -ForegroundColor Yellow;
$rep1 = Call GET '/reports/work-orders' $mgrTok;
Check 'GET /reports/work-orders (manager)' 200 $rep1.status;

$rep2 = Call GET '/reports/cost-summary' $mgrTok;
Check 'GET /reports/cost-summary (manager)' 200 $rep2.status;

# ==========================================
# 12) AI TRIAGE - use existing incident
# ==========================================
Write-Host "`n--- 12) AI Triage ---" -ForegroundColor Yellow;
$existingInc = Call GET '/incidents?limit=1' $mgrTok;
$aiIncId = $null;
if ($existingInc.body) {
  $incList = Items $existingInc.body;
  if (@($incList).Count -gt 0) { $aiIncId = $incList[0].id };
}
if ($aiIncId) {
  $ai = Call POST "/ai/incidents/$aiIncId/analyze" $mgrTok @{};
  Check "POST /ai/incidents/:id/analyze (manager)" 202 $ai.status;
  $aiReqId = if ($ai.body) { $ai.body.id } else { $null };
  Write-Host "    AI request: $aiReqId" -ForegroundColor Gray;
  
  if ($aiReqId) {
    Start-Sleep -Seconds 2;
    $aiRes = Call GET "/ai/requests/$aiReqId" $mgrTok;
    Check 'GET /ai/requests/:id (poll)' 200 $aiRes.status;
    if ($aiRes.body) {
      Write-Host "    AI status: $($aiRes.body.status)" -ForegroundColor Gray;
      if ($aiRes.body.output_payload) {
        Write-Host "    AI output: $($aiRes.body.output_payload | ConvertTo-Json -Compress)" -ForegroundColor Gray;
      }
    }
  }
}

# ==========================================
# 13) AUDIT LOGS
# ==========================================
Write-Host "`n--- 13) Audit ---" -ForegroundColor Yellow;
$audit = Call GET '/iam/audit-logs' $adminTok;
Check 'GET /iam/audit-logs (admin)' 200 $audit.status;
$auditCount = if ($audit.body) { @(Items $audit.body).Count } else { 0 };
Write-Host "    Total audit logs: $auditCount" -ForegroundColor Gray;

# Manager cannot read all audit
$auditMgr = Call GET '/iam/audit-logs' $mgrTok;
Write-Host "    Manager audit: status=$($auditMgr.status) (depends on perm)" -ForegroundColor Gray;

# ==========================================
# 16) WEB UI
# ==========================================
Write-Host "`n--- 16) Web UI ---" -ForegroundColor Yellow;
$web = 'http://localhost:3000';
$pages = @(
  '/login',
  '/dashboard',
  '/assets',
  '/incidents',
  '/work-orders',
  '/approvals',
  '/inventory/parts',
  '/maintenance/plans',
  '/notifications',
  '/reports',
  '/iam/users',
  '/iam/audit-logs'
);
foreach ($p in $pages) {
  try {
    $r = Invoke-WebRequest -Uri "$web$p" -Method GET -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop;
    $pass2 = if ($r.StatusCode -in 200, 307, 308) { 1 } else { 0 };
    $fail2 = 1 - $pass2;
    $script:pass += $pass2;
    $script:fail += $fail2;
    $msg = if ($pass2) { "PASS" } else { "FAIL" };
    $color = if ($pass2) { 'Green' } else { 'Red' };
    Write-Host ("  " + $msg + "  GET " + $p + " -> " + $r.StatusCode) -ForegroundColor $color;
    $script:results.Add([PSCustomObject]@{
      Test = "Web GET $p"; Expected = "200/307"; Actual = $r.StatusCode; Pass = ($pass2 -eq 1)
    }) | Out-Null;
  } catch {
    $script:fail++;
    Write-Host ("  FAIL  GET " + $p + " -> " + $_.Exception.Message) -ForegroundColor Red;
  }
}

# ==========================================
# SUMMARY
# ==========================================
Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan;
Write-Host "Total: $($pass + $fail) | Pass: $pass | Fail: $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' });
Write-Host "Finished: $(Get-Date -Format 'HH:mm:ss')" -ForegroundColor Gray;

# Save results
$results | Export-Csv "C:\Users\Hieu-PC\Projects\equipcare-ai\test-results\test-results.csv" -NoTypeInformation -Encoding UTF8;
Write-Host "Results saved to test-results.csv" -ForegroundColor Gray;

