# Test Reports — EquipCare AI

> **Nguồn sự thật chính**: bộ test E2E tự động (Jest) chạy trong CI mỗi lần
> push — `pnpm test`. Kết quả bên dưới được đo trực tiếp từ CI.

## Summary

Có 3 lớp kiểm thử:

| Lớp | Công cụ | Khi nào chạy | Kết quả |
|------|----------|--------------|---------|
| **E2E tự động (CI)** | Jest + Supertest | Mỗi lần push lên `main` | **109/109 PASS** (16 suite) |
| **Kiểm thử HTTP thủ công** | PowerShell (`tools/legacy-tests/`) | Khi cần test sâu theo kịch bản | 133/134 PASS (99.25%) |
| **Kiểm thử UI** | Puppeteer + Chrome | Kiểm tra luồng trên trình duyệt | 31/31 PASS (100%) |

Ngoài ra: test hiệu năng (`tools/legacy-tests/test-perf.ps1`) và generator
OpenAPI / typed client.

## E2E tự động (Jest — nguồn chuẩn)

| Suite | Nội dung |
|-------|----------|
| `auth` | Login, refresh rotation, logout, đổi mật khẩu |
| `iam` | Người dùng, vai trò, phân quyền, audit log |
| `asset` | CRUD thiết bị, QR, vòng đời |
| `incident` | Sự cố, state machine, chat, tự sinh WO |
| `ai` | Triage & tóm tắt tài sản (provider mock trong CI) |
| `work-order` | Vòng đời WO, gán KTV, SLA, phụ tùng |
| `parts-stock` | Linh kiện, giao dịch kho, chống âm kho, concurrency |
| `cost-approval` | Chi phí, đề xuất, phê duyệt, revision |
| `maintenance` | Kế hoạch bảo trì định kỳ, sinh WO |
| `notif-dashboard-report` | Thông báo, KPI, xuất báo cáo |
| `demo-flow` | Luồng nghiệp vụ end-to-end |
| `m10-endpoints` | Các endpoint bổ sung |
| `q01-sec-aud` | Ràng buộc bảo mật ở mức DB |
| `q06-budget` | Ngân sách & ghi đè chi phí |
| `config` | Cấu hình hệ thống |
| **`rate-limit`** | **Rate limiting (429) — bảo vệ API khi public** |
| **Tổng** | **16 suite — 109 test — 109 PASS — 0 FAIL** |

### Cách chạy

```bash
pnpm test                      # toàn bộ
pnpm --filter @equipcare/api test -- --testPathPattern=auth
```

## Docker / Production Stack Verification

Kiểm chứng thực tế (không chỉ lý thuyết) — đo ngày 28/11/2026:

| Hạng mục | Kết quả |
|----------|---------|
| `docker build` API image | ✅ Thành công (`apps/api/Dockerfile`) |
| `docker build` Web image | ✅ Thành công (`apps/web/Dockerfile`) |
| `docker compose -f infra/docker-compose.prod.yml up -d` | ✅ 5 service: postgres (healthy) → migrate (exit 0) → seed (exit 0) → api (healthy) → web (healthy) |
| `GET /healthz/ready` | ✅ `{"status":"ok","db":true,...}` |
| Web `GET /` | ✅ HTTP 200 |
| Login (`POST /auth/login`) | ✅ HTTP 200, trả accessToken, `mustChangePassword=true` |
| Swagger `/docs` ở production | ✅ HTTP 404 (đã ẩn đúng) |
| Runtime config `GET /api/runtime-config` | ✅ Trả đúng URL API hiện hành |
| **Đổi URL API không cần rebuild** | ✅ Đổi env → restart container → giá trị mới có hiệu lực ngay |
| Thiếu biến bắt buộc khi deploy | ✅ Fail sớm với thông báo rõ ràng (`required variable DB_PASSWORD is missing`) |

### Ổn định của bộ test E2E

Bộ test được chạy **3 lần liên tiếp** để kiểm chứng tính lặp lại (idempotent):

| Lần | Kết quả |
|-----|---------|
| 1 | 16 suite / 109 test — **PASS** |
| 2 | 16 suite / 109 test — **PASS** |
| 3 | 16 suite / 109 test — **PASS** |

> Trước khi có `test/global-setup.ts` + gán cứng `NODE_ENV='test'`, một lần
> fail lơ lẻ (ví dụ timeout) có thể làm hỏng **cả** lần chạy test kế tiếp:
> admin bị kẹt ở mật khẩu đã đổi → mọi suite sau đó đều 401.

## Backend API Test Results (kiểm thử HTTP thủ công)

| Batch | Description | PASS | FAIL | TOTAL |
|-------|-------------|------|------|-------|
| 1 | Smoke + Auth + IAM | 31 | 0 | 31 |
| 2 | Incidents + AI + Notifications | 27 | 0 | 27 |
| 3 | Work Orders + Dashboard | 33 | 0 | 33 |
| 4 | Assets + Parts + Maintenance | 27 | 0 | 27 |
| 5 | Approvals + Org + Config | 15 | 0 | 15 |
| **Total** | | **133** | **1** | **134** |

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
# Sinh artifact (OpenAPI, fixtures, typed client)
node tools/openapi-generator.js
node tools/gen-fixtures.js
node tools/gen-ts-client.js

# Test E2E tự động (không cần chạy API riêng)
pnpm test

# Test HTTP thủ công + UI + perf (cần API chạy ở localhost:3001)
pwsh tools/run-all.ps1
```
