#!/usr/bin/env pwsh
# Run all test suites + generators.
# Usage:  pwsh tools/run-all.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot | Split-Path -Parent

Write-Host "==========================================="
Write-Host "EQUIPCARE AI - FULL TEST SUITE"
Write-Host "==========================================="
Write-Host ""

# Generate OpenAPI spec + fixtures
Write-Host "[1/4] Generating OpenAPI spec + fixtures..."
& node $root/tools/openapi-generator.js
& node $root/tools/gen-fixtures.js
& node $root/tools/gen-ts-client.js
Write-Host ""

# Backend API tests
Write-Host "[2/4] Backend API tests..."
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-batch1.ps1"
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-batch2-fixed.ps1"
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-batch3-fixed.ps1"
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-batch4-fixed.ps1"
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-batch5.ps1"
Write-Host ""

# E2E UI tests
Write-Host "[3/4] E2E UI tests..."
& node $root/tools/e2e.mjs
Write-Host ""

# Performance
Write-Host "[4/4] Performance tests..."
& powershell.exe -ExecutionPolicy Bypass -File "$root/test-perf.ps1"
Write-Host ""

Write-Host "==========================================="
Write-Host "ALL TESTS COMPLETE"
Write-Host "==========================================="