# BATCH 1: Smoke + Auth + IAM
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

# ===== SMOKE =====
Run-Test 'SM-01' 'API liveness' { (Invoke-RestMethod -Uri "$base/healthz/live" -Method GET).status }
Run-Test 'SM-02' 'API readiness' { (Invoke-RestMethod -Uri "$base/healthz/ready" -Method GET).status }
Run-Test 'SM-05' 'Web login page' { (Invoke-WebRequest 'http://localhost:3000/login' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-06' 'Web root -> redirect' { (Invoke-WebRequest 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 8 -MaximumRedirection 0).StatusCode }
Run-Test 'SM-07a' 'Web dashboard' { (Invoke-WebRequest 'http://localhost:3000/dashboard' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07b' 'Web incidents' { (Invoke-WebRequest 'http://localhost:3000/incidents' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07c' 'Web work-orders' { (Invoke-WebRequest 'http://localhost:3000/work-orders' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07d' 'Web assets' { (Invoke-WebRequest 'http://localhost:3000/assets' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07e' 'Web approvals' { (Invoke-WebRequest 'http://localhost:3000/approvals' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07f' 'Web inventory/parts' { (Invoke-WebRequest 'http://localhost:3000/inventory/parts' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07g' 'Web maintenance/plans' { (Invoke-WebRequest 'http://localhost:3000/maintenance/plans' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07h' 'Web notifications' { (Invoke-WebRequest 'http://localhost:3000/notifications' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07i' 'Web reports' { (Invoke-WebRequest 'http://localhost:3000/reports' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07j' 'Web iam/users' { (Invoke-WebRequest 'http://localhost:3000/iam/users' -UseBasicParsing -TimeoutSec 8).StatusCode }
Run-Test 'SM-07k' 'Web iam/audit-logs' { (Invoke-WebRequest 'http://localhost:3000/iam/audit-logs' -UseBasicParsing -TimeoutSec 8).StatusCode }

# ===== AUTH =====
Run-Test 'AUTH-01' 'Login admin OK' { (Login 'admin.bootstrap' $pwdAdmin).accessToken.Length }
Run-Test 'AUTH-02' 'Login sai password' {
    try { Login 'admin.bootstrap' 'WrongPass'; throw 'Should fail' }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 401) { '401' } else { 'unexpected' } }
}
Run-Test 'AUTH-03' 'Login user not exist' {
    try { Login 'demo.nobody' 'x'; throw 'Should fail' }
    catch { if ($_.Exception.Response.StatusCode.value__ -eq 401) { '401' } else { 'unexpected' } }
}
Run-Test 'AUTH-04' 'Login missing password (400)' {
    try {
        Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType 'application/json' -Body '{"loginName":"x"}'
        throw 'Should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'AUTH-13' 'GET /iam/me/permissions' {
    (Invoke-RestMethod -Uri "$base/iam/me/permissions" -Method GET -Headers $hAdmin).user.loginName
}
Run-Test 'AUTH-14' 'Me without token (401)' {
    try {
        Invoke-RestMethod -Uri "$base/iam/me/permissions" -Method GET
        throw 'Should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== IAM USERS =====
Run-Test 'IAM-U-01' 'List users shape (has roles)' {
    $r = Invoke-RestMethod -Uri "$base/iam/users?limit=3" -Method GET -Headers $hAdmin
    if ($r.items.Count -lt 1) { throw 'empty' }
    if ($r.items[0].PSObject.Properties.Name -notcontains 'roles') { throw 'missing roles field' }
    "items=$($r.items.Count) firstRoles=$($r.items[0].roles.Count)"
}
Run-Test 'IAM-U-02' 'Search users (tech)' {
    (Invoke-RestMethod -Uri "$base/iam/users?search=tech&limit=5" -Method GET -Headers $hAdmin).items.Count
}
Run-Test 'IAM-U-03' 'Filter isActive=true' {
    (Invoke-RestMethod -Uri "$base/iam/users?isActive=true&limit=5" -Method GET -Headers $hAdmin).items.Count
}
Run-Test 'IAM-U-04' 'Pagination (limit=2)' {
    $r = Invoke-RestMethod -Uri "$base/iam/users?limit=2&offset=0" -Method GET -Headers $hAdmin
    "items=$($r.items.Count) total=$($r.total)"
}
Run-Test 'IAM-U-05' 'IAM RBAC (USER -> 403)' {
    try {
        Invoke-RestMethod -Uri "$base/iam/users?limit=1" -Method GET -Headers $hRpt
        throw 'Should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}
Run-Test 'IAM-U-08' 'Create user (initialPassword)' {
    $uname = "test_$(Get-Random)"
    $body = '{"loginName":"' + $uname + '","fullName":"Test User","initialPassword":"TestPass123!@#"}'
    try {
        $r = Invoke-RestMethod -Uri "$base/iam/users" -Method POST -ContentType 'application/json' -Headers $hAdmin -Body $body
        "created: $($r.loginName)"
    } catch { throw $_.Exception.Message }
}
Run-Test 'IAM-R-01' 'List roles count' { (Invoke-RestMethod -Uri "$base/iam/roles" -Method GET -Headers $hAdmin).Count }
Run-Test 'IAM-R-02' 'List permissions (codes shape)' {
    $r = Invoke-RestMethod -Uri "$base/iam/permissions" -Method GET -Headers $hAdmin
    "codes=$($r.codes.Count) first3=$($r.codes[0..2] -join ',')"
}

# ===== AUDIT =====
Run-Test 'AUDIT-01' 'List audit logs' { (Invoke-RestMethod -Uri "$base/iam/audit-logs?limit=5" -Method GET -Headers $hAdmin).items.Count }
Run-Test 'AUDIT-05' 'Audit RBAC (USER -> 403)' {
    try {
        Invoke-RestMethod -Uri "$base/iam/audit-logs?limit=1" -Method GET -Headers $hRpt
        throw 'Should fail'
    } catch { $_.Exception.Response.StatusCode.value__ }
}

# ===== SUMMARY =====
$results | Format-Table -AutoSize -Wrap
$pass = ($results | Where-Object Status -eq 'PASS').Count
$fail = ($results | Where-Object Status -eq 'FAIL').Count
Write-Host "================================================================"
Write-Host "BATCH 1 SUMMARY:  PASS=$pass  FAIL=$fail  TOTAL=$($results.Count)"
$results | Export-Csv -Path 'test-batch1.csv' -NoTypeInformation -Encoding UTF8