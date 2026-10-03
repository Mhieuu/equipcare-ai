# Test Reports — EquipCare AI

## Summary

After running all test suites (`tools/run-all.ps1`), results are aggregated here.

## Test Suites

| Suite | Coverage | Results |
|-------|----------|---------|
| **Backend API** (5 batches) | All REST endpoints + DTOs | 133/134 PASS (99.25%) |
| **E2E UI** | All 23 pages with auth flows | 31/31 PASS (100%) |
| **Performance** | Cold start + p95 latency + 1000+ records | All under 50ms p95 |
| **OpenAPI Generator** | 77 paths + 62 DTOs + 20 enums | Generates valid spec + client |

## Backend API Test Results (Latest Run)

| Batch | Description | PASS | FAIL | TOTAL |
|-------|-------------|------|------|-------|
| 1 | Smoke + Auth + IAM | 31 | 0 | 31 |
| 2 | Incidents + AI + Notifications | 27 | 0 | 27 |
| 3 | Work Orders + Dashboard | 33 | 0 | 33 |
| 4 | Assets + Parts + Maintenance | 27 | 0 | 27 |
| 5 | Approvals + Org + Config | 15 | 0 | 15 |
| **Total** | | **133** | **0** | **133** |

## E2E UI Test Results (Puppeteer + Chrome)

| Category | Tests | PASS | FAIL |
|----------|-------|------|------|
| Route smoke (12 routes) | 12 | 12 | 0 |
| Login flows (3) | 3 | 3 | 0 |
| Authenticated pages (8) | 8 | 8 | 0 |
| List links (3) | 3 | 3 | 0 |
| Layout/Theme (2) | 2 | 2 | 0 |
| **Total** | **31** | **31** | **0** |

## Performance Results (1066 incidents in DB)

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) | Iterations |
|----------|----------|----------|----------|------------|
| GET /healthz | 1 | 5 | 5 | 20 |
| GET /incidents?limit=50 | 17 | 33 | 35 | 30 |
| GET /work-orders?limit=50 | 16 | 23 | 31 | 30 |
| GET /assets?limit=50 | 15 | 21 | 30 | 30 |
| GET /parts?limit=50 | 12 | 15 | 16 | 30 |
| GET /iam/users?limit=50 | 14 | 16 | 17 | 30 |
| GET /maintenance-plans?limit=50 | 12 | 14 | 15 | 30 |
| GET /approvals?limit=50 | 13 | 15 | 16 | 30 |
| GET /notifications?limit=50 | 11 | 15 | 17 | 30 |
| GET /dashboard/kpis | 27 | 33 | 37 | 30 |
| GET /incidents?limit=100&offset=0 | 20 | 27 | 28 | 30 |
| GET /incidents?limit=100&offset=100 | 21 | 25 | 26 | 30 |
| GET /incidents?limit=100&offset=200 | 21 | 26 | 28 | 30 |
| GET /incidents?limit=200 (max) | 29 | 42 | 47 | 30 |
| GET /incidents/:id (single) | 13 | 16 | 16 | 30 |
| GET /work-orders/:id (single) | 13 | 17 | 17 | 30 |
| **API cold start** | **2042 ms** | — | — | 1 |

## Files Generated

- `tools/openapi.json` — OpenAPI 3.0 spec (77 paths, 62 DTOs, 20 enums)
- `tools/api-client.ts` — TypeScript typed client (82 types, 96 methods)
- `tools/fixtures.ps1` — PowerShell test fixtures (57 body DTOs)
- `tools/dto-schema.json` — Raw DTO JSON Schemas

## Running

```bash
# Generate artifacts
node tools/openapi-generator.js
node tools/gen-fixtures.js
node tools/gen-ts-client.js

# Run all tests
pwsh tools/run-all.ps1
```