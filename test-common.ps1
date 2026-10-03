# Common test helpers — load fixtures and login utilities
. "$PSScriptRoot\fixtures.ps1"

$base = 'http://localhost:3001'
$pwdAdmin = 'ChangeMe' + [char]64 + '2026'
$pwdUser = 'Demo' + [char]64 + '2026'
$pwdUserUtf = 'Demo' + [char]64 + '2026'   # Demo@2026

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

function Get-Headers([string]$token) {
    return @{ Authorization = "Bearer $token" }
}

function Get-LiveIds {
    param([hashtable]$headers)
    $assets = Invoke-RestMethod -Uri "$base/assets?limit=1" -Method GET -Headers $headers
    $parts = Invoke-RestMethod -Uri "$base/parts?limit=1" -Method GET -Headers $headers
    $wos = Invoke-RestMethod -Uri "$base/work-orders?limit=1" -Method GET -Headers $headers
    return [PSCustomObject]@{
        assetId = $assets.items[0].id
        partId = $parts.items[0].id
        workOrderId = $wos.items[0].id
    }
}