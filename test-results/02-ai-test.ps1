$api = 'http://localhost:3001';
$pass = 0; $fail = 0;

function Call($method, $path, $token, $body) {
  $headers = @{};
  if ($token) { $headers['Authorization'] = "Bearer $token" };
  $params = @{ Uri = "$api$path"; Method = $method; UseBasicParsing = $true; Headers = $headers; TimeoutSec = 30 };
  if ($body) { $params['Body'] = ($body | ConvertTo-Json -Depth 10 -Compress); $params['ContentType'] = 'application/json' };
  try {
    $r = Invoke-WebRequest @params -ErrorAction Stop;
    $obj = $null; try { $obj = $r.Content | ConvertFrom-Json } catch {};
    return @{ status = [int]$r.StatusCode; body = $obj; raw = $r.Content }
  } catch {
    $code = 0;
    if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode };
    $rawBody = '';
    if ($_.Exception.Response) { try { $rawBody = (New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())).ReadToEnd() } catch {} };
    return @{ status = $code; body = $null; raw = $rawBody; error = $_.Exception.Message }
  }
}

function Check($name, $expected, $actual) {
  $script:pass += $(if ($actual -eq $expected) { 1 } else { 0 });
  $script:fail += $(if ($actual -eq $expected) { 0 } else { 1 });
  $color = $(if ($actual -eq $expected) { 'Green' } else { 'Red' });
  $extra = '';
  if ($actual -ne $expected -and $r -and $r.raw) { $extra = " | " + $r.raw.Substring(0, [Math]::Min(150, $r.raw.Length)) }
  Write-Host ("  " + $(if ($actual -eq $expected) { "PASS" } else { "FAIL" }) + "  " + $name + " -> " + $actual + " (expected " + $expected + ")" + $extra) -ForegroundColor $color
}

Write-Host "`n========== AI DEEP TEST ==========" -ForegroundColor Cyan;

# Login manager
$body = @{ loginName='demo.manager1'; password='Demo@2026' };
$r = Call POST '/auth/login' $null $body;
$tok = $r.body.accessToken;
Write-Host "  Manager token: $($tok.Substring(0,30))..." -ForegroundColor Gray;

# Get a TRIAGED incident (so AI analysis can be done)
$incs = Call GET '/incidents?limit=50' $tok;
$items = if ($incs.body.items) { $incs.body.items } else { @($incs.body) };
$incToAnalyze = $items | Where-Object { $_.status -eq 'NEW' -or $_.status -eq 'TRIAGED' -or $_.status -eq 'IN_PROGRESS' -or $_.status -eq 'AWAITING_INFO' } | Select-Object -First 1;
if (-not $incToAnalyze) { $incToAnalyze = $items[0] };

Write-Host "`n--- Test 1: AI analyze on existing incident ---" -ForegroundColor Yellow;
Write-Host "  Incident: $($incToAnalyze.id) status=$($incToAnalyze.status)" -ForegroundColor Gray;
$ai = Call POST "/ai/incidents/$($incToAnalyze.id)/analyze" $tok @{};
Check "POST /ai/incidents/:id/analyze" 202 $ai.status;
$reqId = $ai.body.requestId;
Write-Host "  AI request id: $reqId" -ForegroundColor Gray;

# Poll for completion
$attempts = 0;
$aiRes = $null;
while ($attempts -lt 15) {
  Start-Sleep -Seconds 1;
  $aiRes = Call GET "/ai/requests/$reqId" $tok;
  $attempts++;
  if ($aiRes.body.status -in 'SUCCEEDED','FAILED','TIMED_OUT') { break };
};
Write-Host "  Polled $attempts times. Final status: $($aiRes.body.status)" -ForegroundColor Gray;
Check "AI request SUCCEEDED" 'SUCCEEDED' $aiRes.body.status;
if ($aiRes.body.output_payload) {
  Write-Host "  AI output: $($aiRes.body.output_payload | ConvertTo-Json -Compress)" -ForegroundColor Cyan;
}

# Check if re-running is idempotent or returns the same
Write-Host "`n--- Test 2: AI analyze again (re-run) ---" -ForegroundColor Yellow;
$ai2 = Call POST "/ai/incidents/$($incToAnalyze.id)/analyze" $tok @{};
Check "POST /ai/incidents/:id/analyze (2nd time)" 202 $ai2.status;

# Test with non-existent incident
Write-Host "`n--- Test 3: AI analyze non-existent incident ---" -ForegroundColor Yellow;
$bad = Call POST "/ai/incidents/00000000-0000-4000-8000-000000000000/analyze" $tok @{};
Check "POST /ai/incidents/INVALID/analyze -> 404" 404 $bad.status;

# Test without auth
Write-Host "`n--- Test 4: AI without auth ---" -ForegroundColor Yellow;
$noAuth = Call POST "/ai/incidents/$($incToAnalyze.id)/analyze" $null @{};
Check "POST /ai/analyze (no token) -> 401" 401 $noAuth.status;

# Test AI request GET for non-existent
Write-Host "`n--- Test 5: AI request GET non-existent ---" -ForegroundColor Yellow;
$bad2 = Call GET "/ai/requests/00000000-0000-4000-8000-000000000000" $tok;
Check "GET /ai/requests/INVALID -> 404" 404 $bad2.status;

# Check AI request list (if exists)
Write-Host "`n--- Test 6: AI request view (reporter) ---" -ForegroundColor Yellow;
$body = @{ loginName='demo.reporter1'; password='Demo@2026' } | ConvertTo-Json;
$r2 = Call POST '/auth/login' $null $body;
$repTok = $r2.body.accessToken;
$repAi = Call GET "/ai/requests/$reqId" $repTok;
Write-Host "  Reporter viewing AI request: $($repAi.status)" -ForegroundColor Gray;

Write-Host "`n========== AI SUMMARY ==========" -ForegroundColor Cyan;
Write-Host "Pass: $pass | Fail: $fail" -ForegroundColor $(if ($fail -eq 0) { 'Green' } else { 'Red' });
