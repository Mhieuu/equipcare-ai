# Tổng hợp số liệu cho báo cáo — EquipCare AI

> Tài liệu này gom **số liệu đã kiểm chứng** để viết báo cáo đồ án.
> Mọi con số đều đo từ mã nguồn thực tế hoặc từ kết quả chạy thật
> (CI, E2E, docker build, prod stack) — không phải ước lượng.
> Ngày cập nhật: 28/11/2026.

---

## 1. Quy mô mã nguồn

| Hạng mục | Số file | Số dòng code (LOC) |
|----------|---------|---------------------|
| `apps/api/src` (NestJS) | 86 | 8.950 |
| `apps/web/src` (Next.js) | 43 | 5.009 |
| `packages/*/src` (shared + backend-core) | 44 | 2.443 |
| **Tổng mã nguồn sản phẩm** | **173** | **16.402** |
| `apps/api/test` (E2E) | 18 | 4.825 |
| **Tổng (kể cả test)** | **191** | **21.227** |

> Tỉ lệ mã test : mã sản phẩm ≈ **29%** — độ bao phủ kiểm thử tốt so với
> đồ án cùng quy mô.

---

## 2. Kiến trúc & hạ tầng

| Thành phần | Công nghệ | Phiên bản |
|------------|-----------|-----------|
| Frontend | Next.js (App Router) + React + TypeScript + Tailwind + TanStack Query | Next 14 |
| Backend | NestJS + Prisma ORM + PostgreSQL | NestJS 10.4.4 / Prisma 5.20.0 / PG 16 |
| Auth | JWT access token + refresh token (rotate) + cookie `httpOnly` | — |
| AI provider | Google Gemini (tích hợp qua interface, có mock provider cho test) | Gemini 3.5 Flash Lite |
| Runtime | Node.js | 22.11.0 (Alpine) |
| Quản lý gói | pnpm workspace (monorepo) | 9.12.0 |

### Mô hình dữ liệu

| Hạng mục | Số lượng |
|----------|---------|
| Bảng trong DB (Prisma model) | **30** |
| Migration đã áp dụng | **12** |
| Controller (module API) | **16** |
| Endpoint REST | **87** |
| Trang UI (App Router `page.tsx`) | **21** |
| Vai trò (role) | **5** (ADMIN, MANAGER, TECHNICIAN, USER, SYSTEM) |
| Mã quyền (permission code) | **49** |

---

## 3. Kiểm thử

| Lớp kiểm thử | Công cụ | Kết quả |
|---------------|---------|---------|
| **E2E tự động (CI)** | Jest + Supertest | **109/109 PASS** — 16 suite |
| Kiểm thử HTTP thủ công | PowerShell (`tools/legacy-tests/`) | 133/134 PASS (99.25%) |
| Kiểm thử UI | Puppeteer + Chrome | 31/31 PASS (100%) |

**Tính lặp lại của bộ E2E** (chạy 3 lần liên tiếp, cùng DB):

| Lần | Kết quả |
|-----|---------|
| 1 | 16 suite / 109 test — PASS |
| 2 | 16 suite / 109 test — PASS |
| 3 | 16 suite / 109 test — PASS |

> Nhờ `test/global-setup.ts` (reset trạng thái admin trước mỗi lần chạy) và
> gán cứng `NODE_ENV='test'` → bộ test **không còn phụ thuộc kết quả của lần
> chạy trước**.

### Danh mục 16 test suite

| Suite | Nội dung kiểm thử |
|-------|-------------------|
| `auth` | Login, refresh rotation, logout, đổi mật khẩu |
| `iam` | Người dùng, vai trò, phân quyền, audit log |
| `asset` | CRUD thiết bị, QR code, vòng đời |
| `incident` | Sự cố, state machine, chat, tự sinh work order |
| `ai` | Triage & tóm tắt tài sản (provider mock) |
| `work-order` | Vòng đời WO, gán KTV, SLA, phụ tùng |
| `parts-stock` | Linh kiện, giao dịch kho, chống âm kho, concurrency |
| `cost-approval` | Chi phí, đề xuất, phê duyệt, revision |
| `maintenance` | Kế hoạch bảo trì định kỳ, sinh WO |
| `notif-dashboard-report` | Thông báo, KPI, xuất báo cáo CSV |
| `demo-flow` | Luồng nghiệp vụ end-to-end (15 bước) |
| `m10-endpoints` | Các endpoint bổ sung |
| `q01-sec-aud` | Ràng buộc bảo mật ở mức DB |
| `q06-budget` | Ngân sách & ghi đè chi phí |
| `config` | Cấu hình hệ thống |
| `rate-limit` | Rate limiting (429) — bảo vệ API khi public |

---

## 4. Hiệu năng

Đo trên DB chứa **1.066 incidents**:

| Endpoint | p50 (ms) | p95 (ms) | p99 (ms) |
|----------|----------|----------|----------|
| `GET /healthz` | 1 | 5 | 5 |
| `GET /incidents?limit=50` | 17 | 33 | 35 |
| `GET /work-orders?limit=50` | 16 | 23 | 31 |
| `GET /assets?limit=50` | 15 | 21 | 30 |
| `GET /parts?limit=50` | 12 | 15 | 16 |
| `GET /approvals?limit=50` | 13 | 15 | 16 |
| `GET /dashboard/kpis` | 27 | 33 | 37 |
| `GET /incidents?limit=200` (max) | 29 | 42 | 47 |
| **API cold start** | **2.042 ms** | — | — |

---

## 5. Bảo mật (đã triển khai & kiểm chứng)

| Biện pháp | Cơ chế | Kiểm chứng |
|-----------|---------|-----------|
| Xác thực | JWT access token (15 phút) + refresh token rotate, cookie `httpOnly`/`secure` | `auth` suite |
| RBAC | 5 vai trò × 49 mã quyền, kiểm tra ở cả API và UI | `iam`, `q01-sec-aud` |
| Mã hoá mật khẩu | bcrypt (cost 10) | — |
| Chống brute-force | Rate limit ngưỡng `short` (20 req/phút/IP) cho login/refresh/đổi mật khẩu | `rate-limit` suite |
| Bảo vệ chi phí AI | Rate limit ngưỡng `ai` (6 req/phút/IP) cho endpoint Gemini | `rate-limit` suite |
| Rate limit toàn cục | 120 req/phút/IP | `rate-limit` suite |
| IP thật sau reverse proxy | `TRUST_PROXY=1` → đọc `X-Forwarded-For` | — |
| Header bảo mật | helmet (CSP, HSTS, X-Frame-Options…) | — |
| Ẩn Swagger ở production | `/docs` trả **404** khi `NODE_ENV=production` | ✅ đo thật trên prod stack |
| Ràng buộc dữ liệu ở mức DB | CHECK, UNIQUE index, trigger no-self-approval | `q01-sec-aud` (TC-DATA-01..05) |
| Audit log | Ghi lại mọi hành động nhạy cảm | `demo-flow` (bước 15) |
| Không lộ secret vào image | `.dockerignore` loại `.env*`; secret chỉ qua env runtime | — |

---

## 6. Triển khai (đã kiểm chứng bằng cách chạy thật)

| Hạng mục | Kết quả kiểm chứng |
|----------|-------------------|
| `docker build` API image | ✅ Thành công |
| `docker build` Web image | ✅ Thành công |
| Prod stack 5 service (postgres → migrate → seed → api → web) | ✅ Tất cả **healthy** |
| `GET /healthz/ready` | ✅ `{"status":"ok","db":true}` |
| `POST /auth/login` | ✅ HTTP 200, `mustChangePassword=true` |
| Swagger `/docs` ở production | ✅ HTTP 404 |
| **Đổi URL API không cần rebuild image** | ✅ Đổi env → restart → có hiệu lực ngay |
| Thiếu biến bắt buộc khi deploy | ✅ Fail sớm với thông báo rõ ràng |

### Cơ chế runtime config (điểm nhấn kỹ thuật)

Next.js **inline** biến `NEXT_PUBLIC_*` vào JS bundle lúc `next build` → URL API
bị đóng băng theo image. Dự án xử lý bằng route handler
`GET /api/runtime-config` đọc `process.env.API_URL` lúc **runtime**; client đọc
endpoint này một lần rồi cache. Kết quả: đổi domain chỉ cần restart container.

### Cấu hình prod stack so với demo

| Điểm | Demo | Production |
|------|------|-----------|
| Postgres | publish port 5432 ra host | **không** publish — chỉ network nội bộ |
| Restart policy | mặc định | `unless-stopped` (tự sống lại sau reboot) |
| Healthcheck | postgres | postgres + api + web |
| Biến bắt buộc | có default | `:?` → fail sớm |
| Cổng publish | mọi interface | `127.0.0.1` → reverse proxy là cổng vào duy nhất |

---

## 7. CI/CD

`.github/workflows/ci.yml` — 2 job mỗi lần push lên `main`:

| Job | Nội dung |
|-----|----------|
| **preflight** | lint → build → typecheck → validate 3 docker-compose (`infra`, `demo`, `prod`) |
| **test** | Dựng PostgreSQL 16 trên CI → `migrate deploy` → `seed` → chạy **109 test E2E** (`AI_PROVIDER=mock` nên không cần Gemini key) |

---

## 8. Tài liệu bàn giao

| Tài liệu | Vai trò |
|----------|---------|
| `docs/EquipCare-AI-System-Documentation.md` | Tài liệu hệ thống (kiến trúc, CSDL, API, triển khai) |
| `docs/HANDOVER.md` | Hướng dẫn cài đặt, chạy, deploy, xử lý sự cố |
| `docs/TEST-CASES.md` | Mô tả chi tiết từng test case theo mã (TC-INC-xx, TC-WO-xx, TC-APR-xx…) |
| `docs/db_schema.md` | Đặc tả cơ sở dữ liệu |
| `docs/baseline/Doc01..07` | 7 tài liệu baseline (nghiệp vụ, SRS, RBAC, CSDL/ERD, kiến trúc/API, UX/UI, kế hoạch kiểm thử) |
| `TEST-REPORTS.md` | Kết quả kiểm thử tổng hợp |
| `dist/EquipCare-AI-v1.0.0.zip` | Gói bàn giao (437 file, 0.6 MB, **không** chứa secret) |

---

## 9. Trạng thái chốt

| Hạng mục | Trạng thái |
|----------|-----------|
| Mã nguồn | ✅ Hoàn tất, commit & push lên `origin/main` |
| Test | ✅ 109/109 pass, ổn định qua 3 lần chạy |
| Lint / Typecheck / Build | ✅ Sạch |
| Docker image | ✅ Build thành công cho cả API và Web |
| Prod stack | ✅ Chạy thật, tất cả service healthy |
| CI | ✅ Xanh |
| Gói bàn giao | ✅ Đã build `dist/EquipCare-AI-v1.0.0.zip` |
| Tài liệu | ✅ Đồng bộ với code thực tế |

> **Sẵn sàng viết báo cáo.**
