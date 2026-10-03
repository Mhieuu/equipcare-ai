# EquipCare AI - Testing & Tooling

This directory contains the full testing + tooling suite for the project.

## Layout

```
tools/
├── dto-extractor.js       # Extract JSON Schema from NestJS DTO files
├── gen-fixtures.js        # Generate PowerShell test fixtures from DTOs
├── gen-ts-client.js       # Generate TypeScript API client from OpenAPI spec
├── openapi-generator.js   # Walk controllers + DTOs to produce OpenAPI 3.0 spec
├── seed-perf.js           # Seed 1000+ records for performance testing
├── e2e.mjs                # E2E UI tests (Puppeteer + system Chrome)
├── pw/                    # Local node_modules for puppeteer-core (workspace-isolated)
├── run-all.ps1            # Master runner
├── openapi.json           # Generated OpenAPI 3.0 spec
├── api-client.ts          # Generated typed TypeScript client
├── fixtures.ps1           # Generated PowerShell body fixtures
└── dto-schema.json        # Generated DTO JSON Schemas
```

## Quick Start

```bash
# Generate specs + clients
node tools/openapi-generator.js
node tools/gen-fixtures.js
node tools/gen-ts-client.js

# Backend tests
powershell -ExecutionPolicy Bypass -File test-batch1.ps1
powershell -ExecutionPolicy Bypass -File test-batch2-fixed.ps1
powershell -ExecutionPolicy Bypass -File test-batch3-fixed.ps1
powershell -ExecutionPolicy Bypass -File test-batch4-fixed.ps1
powershell -ExecutionPolicy Bypass -File test-batch5.ps1

# E2E UI tests
node tools/e2e.mjs

# Performance
powershell -ExecutionPolicy Bypass -File test-perf.ps1

# Everything
pwsh tools/run-all.ps1
```

## Test Reports

After running tests, reports are saved to:
- `test-batch*.csv` — Backend API test results
- `e2e-report.json` — E2E UI test results
- `perf-results.csv` — Performance metrics

## OpenAPI Client Usage

```typescript
import { ApiClient } from './api-client';

const client = new ApiClient({ baseUrl: 'http://localhost:3001' });
const auth = await client.post_auth_login({ loginName: 'admin.bootstrap', password: 'ChangeMe@2026' });

const authed = new ApiClient({ baseUrl: 'http://localhost:3001', token: auth.accessToken });
const incidents = await authed.get_incidents({ limit: 10 });
```