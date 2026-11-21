# Tài liệu bàn giao — EquipCare AI

> Đồ án tốt nghiệp: Hệ thống quản lý bảo trì thiết bị tích hợp AI.
> Tài liệu này hướng dẫn cài đặt, chạy, kiểm thử và đóng gói dự án.

---

## 1. Tổng quan hệ thống

**EquipCare AI** là web monorepo (modular monolith) phục vụ quản lý thiết bị, sự cố, phiếu công việc, bảo trì định kỳ, kho linh kiện, chi phí, phê duyệt, dashboard và AI hỗ trợ — phạm vi một tổ chức.

### Thành phần

| Thành phần | Công nghệ | Cổng | Vai trò |
|---|---|---|---|
| `apps/web` | Next.js 14 (App Router), React 18, Tailwind, TanStack Query | 3000 | Giao diện người dùng |
| `apps/api` | NestJS 10, Prisma 5, PostgreSQL 16 | 3001 | REST API + Swagger + AI provider |
| `packages/shared` | TypeScript | — | Types, enum, permission constants |
| `packages/backend-core` | TypeScript | — | PrismaService + state machine + policy |
| `infra/` | Docker Compose | — | Hạ tầng Postgres / Redis / MinIO |

### Luồng nghiệp vụ chính

```
Người dùng báo sự cố  →  Sự cố (NEW)
                            ↓ AI phân loại (Gemini)
                        Work Order (NEW → ASSIGNED → IN_PROGRESS → COMPLETED)
                            ↓ chi phí linh kiện > ngưỡng
                        Approval (DRAFT → SUBMITTED → APPROVED/REJECTED)
                            ↓
                        Kho (nhập / xuất / trả) + Báo cáo CSV
```

---

## 2. Yêu cầu môi trường

| Thành phần | Phiên bản | Ghi chú |
|---|---|---|
| Node.js | 22.x LTS | Theo `.nvmrc` (`nvm install && nvm use`) |
| pnpm | ≥ 9.12 | `npm i -g pnpm@9` |
| Docker Desktop | bất kỳ | Chạy Postgres 16 + Redis 7 + MinIO |
| PostgreSQL | 16 | Có thể dùng container `infra/` |

> Mọi phiên bản chính xác nằm trong `pnpm-lock.yaml`. Không bump major sau khi đóng băng baseline.

---

## 3. Cài đặt & chạy (môi trường dev)

```powershell
# 1) Cài dependencies
pnpm install

# 2) Bật hạ tầng (Postgres / Redis / MinIO)
pnpm infra:up

# 3) Tạo file env
cp .env.example .env          # PowerShell: Copy-Item .env.example .env

# 4) Migrate + seed dữ liệu nền
pnpm --filter @equipcare/api db:migrate:deploy
pnpm --filter @equipcare/api db:seed

# 5) (tuỳ chọn) Nạp dữ liệu demo đầy đủ
pnpm --filter @equipcare/api db:demo-seed

# 6) Chạy api + web + worker
pnpm dev
```

Truy cập:

- **Web**: <http://localhost:3000>
- **API + Swagger**: <http://localhost:3001/docs>
- **Health check**: <http://localhost:3001/healthz>

### Bật chức năng AI (Gemini)

Trong `apps/api/.env`:

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=<api key của bạn>
GEMINI_MODEL=gemini-3.5-flash-lite
```

Đổi `AI_PROVIDER=mock` nếu không dùng AI thật (mock trả kết quả giả lập theo đúng schema).

> API key **không** được commit — `.env` đã nằm trong `.gitignore`. Chỉ `.env.example` được track.

---

## 4. Triển khai production

### 4.1. Docker Compose (full stack)

```powershell
# Bật toàn bộ: postgres → migrate → seed → api → web
pnpm demo:up

# Theo dõi log
docker compose -f infra/docker-compose.demo.yml logs -f
```

Pipeline tự động chạy `prisma migrate deploy` rồi `prisma seed` trước khi API khởi động, nên DB luôn ở trạng thái đúng schema.

### 4.2. Checklist bảo mật trước khi deploy thật

| # | Việc | Cách làm |
|---|---|---|
| 1 | Đổi mật khẩu admin | Đăng nhập `admin.bootstrap` → bắt buộc đổi (`mustChangePassword: true`) |
| 2 | Khóa tài khoản demo | `demo.*` có mật khẩu công khai — khóa qua **Người dùng → Khóa**, hoặc đổi mật khẩu |
| 3 | Sinh secret ngẫu nhiên | `JWT_ACCESS_SECRET` và `REFRESH_TOKEN_PEPPER` tối thiểu 32 bytes, **không** dùng giá trị mặc định |
| 4 | Chỉ định domain | `APP_URL=https://ten-mien-cua-ban` — quyết định CORS allowlist |
| 5 | Ẩn gợi ý đăng nhập | Tự động — trang login chỉ hiện tài khoản demo khi `NODE_ENV != production` |
| 6 | Bật HTTPS | Đặt reverse proxy (nginx/Caddy) phía trước, chuyển cookie sang `Secure` |

### 4.3. Biến môi trường bắt buộc

| Biến | Mô tả | Ví dụ |
|---|---|---|
| `DATABASE_URL` | Kết nối PostgreSQL | `postgresql://user:pwd@host:5432/equipcare` |
| `JWT_ACCESS_SECRET` | ≥ 32 bytes | `openssl rand -hex 32` |
| `REFRESH_TOKEN_PEPPER` | ≥ 32 bytes | `openssl rand -hex 32` |
| `APP_URL` | Danh sách origin CORS, phân tách bằng `,` | `https://equipcare.vn` |
| `API_PORT` | Cổng API | `3001` |
| `NEXT_PUBLIC_API_URL` | URL API phía web | `https://api.equipcare.vn` |
| `AI_PROVIDER` | `gemini` hoặc `mock` | `gemini` |
| `GEMINI_API_KEY` | Khóa Gemini (chỉ khi `AI_PROVIDER=gemini`) | — |

---

## 5. Kiểm thử

```powershell
# Toàn bộ test E2E của API (106 trường hợp / 15 suite)
pnpm --filter @equipcare/api test

# Chạy lướt lẻ
pnpm --filter @equipcare/api exec jest --runInBand --config jest.config.cjs test/incident.e2e-spec.ts
```

Test E2E cần PostgreSQL đang chạy và có dữ liệu seed. Nếu DB không truy cập được, suite tự skip thay vì fail.

### CI

`.github/workflows/ci.yml` chạy 2 job trên mỗi push/PR lên `main`:

1. **preflight** — lint → build → typecheck → validate docker-compose
2. **test** — dựng Postgres 16 tạm, `migrate deploy` → `seed` → chạy 106 test E2E (dùng `AI_PROVIDER=mock` nên không cần Gemini key)

### Tài liệu test

`docs/TEST-CASES.md` — mô tả chi tiết từng test case theo mã (TC-INC-xx, TC-WO-xx, TC-APR-xx, TC-PART-xx, TC-MNT-xx, TC-COST-xx, TC-SEC-xx).

---

## 6. Cấu trúc mã nguồn

```
equipcare-ai/
├── apps/
│   ├── api/src/modules/        # Mỗi domain 1 module: controller / service / dto
│   │   ├── auth/               # Đăng nhập, refresh token, đổi mật khẩu
│   │   ├── iam/                # Người dùng, vai trò, quyền, phòng ban
│   │   ├── asset/              # Thiết bị, QR, vòng đời
│   │   ├── incident/           # Sự cố + phân loại AI
│   │   ├── work-order/         # Phiếu công việc + SLA state machine
│   │   ├── approval/           # Quy trình phê duyệt + revision
│   │   ├── part/               # Linh kiện
│   │   ├── stock-transaction/  # Nhập / xuất / trả / điều chỉnh
│   │   ├── maintenance/        # Kế hoạch bảo trì + occurrences
│   │   ├── cost/               # Chi phí
│   │   ├── report/             # Báo cáo CSV
│   │   ├── ai/                 # Điều phối AI + adapter Gemini
│   │   └── audit/              # Nhật ký hệ thống
│   └── web/src/
│       ├── app/(main)/         # Các trang theo phân quyền
│       ├── components/         # DataTable, AppShell, panel AI, toast…
│       └── lib/                # api client (fetch wrapper), auth store
├── packages/
│   ├── shared/                 # Enum, permission constant, type dùng chung
│   └── backend-core/           # PrismaService, AI provider factory
├── infra/                      # docker-compose hạ tầng & demo
└── docs/                       # Tài liệu bàn giao + baseline
```

### Nguyên tắc phân quyền

- Backend kiểm tra quyền ở **mọi** endpoint (`@Permissions(...)`) — frontend chỉ ẩn hiển thị, không phải hàng rào bảo mật.
- Menu điều hướng lọc theo `permission` / `roles` trong `AppShell`.
- Đăng nhập dùng access token (15 phút) + refresh token trong cookie `HttpOnly`.
- `auth_version` tăng khi đổi mật khẩu → vô hiệu hoá mọi phiên cũ.

---

## 7. Chức năng AI

| Luồng | Endpoint | Mô tả |
|---|---|---|
| Phân tích sự cố | `POST /ai/incidents/:id/analyze` | Gemini phân loại sự cố, đề xuất mức ưu tiên, độ tin cậy, lý do và các bước xử lý |
| Tóm tắt thiết bị | `POST /ai/assets/:id/summary` | Gemini đánh giá rủi ro (`LOW`/`MEDIUM`/`HIGH`) dựa trên sự cố 90 ngày, phiếu đang mở và chi phí |
| Theo dõi trạng thái | `GET /ai/requests/:id` | Job chạy bất đồng bộ (202) → poll tới trạng thái cuối |

Cơ chế: `AI_PROVIDER` chọn provider qua `packages/backend-core/src/ai/provider.factory.ts`.
Lỗi Gemini được trả về rõ ràng (`AI_NETWORK`, `AI_GEMINI_HTTP`, `AI_BAD_RESPONSE`) — **không** fallback im lặng sang mock, tránh việc tưởng đang dùng AI thật.

---

## 8. Đóng gói bàn giao

### 8.1. Đóng gói mã nguồn (không kèm `node_modules`)

```powershell
# Xác nhận working tree sạch
git status

# Tạo file nén (PowerShell)
Compress-Archive -Path apps,packages,infra,docs,.github,README.md,package.json,pnpm-lock.yaml,pnpm-workspace.yaml,.env.example,.nvmrc -DestinationPath EquipCare-AI-v1.0.0.zip
```

> **Không** đóng gói `.env` (chứa secret) hay `node_modules` / `.next` / `dist`.

### 8.2. Đóng gói kèm ảnh Docker (tuỳ chọn)

```powershell
docker compose -f infra/docker-compose.demo.yml build
docker save -o EquipCare-AI-images.tar equipcare-demo-api equipcare-demo-web
```

### 8.3. Bộ tài liệu kèm theo

| File | Nội dung |
|---|---|
| `README.md` | Mô tả dự án, cài đặt nhanh |
| `docs/HANDOVER.md` | Tài liệu này |
| `docs/EquipCare-AI-System-Documentation.md` | Tài liệu hệ thống đầy đủ (có bản `.docx`) |
| `docs/TEST-CASES.md` | Bộ test case chi tiết |
| `docs/db_schema.md` | Mô tả cơ sở dữ liệu |
| `docs/baseline/Doc01..07` | 7 tài liệu baseline (nghiệp vụ, SRS, RBAC, CSDL/ERD, kiến trúc/API, UX/UI, kế hoạch kiểm thử) |

---

## 9. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách xử lý |
|---|---|---|
| `EPERM: operation not permitted, open '.next/trace'` | Dev server đang giữ file, chạy `next build` đồng thời | Tắt dev server, xóa `apps/web/.next`, build lại |
| `relation "users" does not exist` | Chưa migrate | `pnpm --filter @equipcare/api db:migrate:deploy` |
| `AI_PROVIDER=gemini yêu cầu GEMINI_API_KEY` | Thiếu API key | Thêm `GEMINI_API_KEY` vào `apps/api/.env` |
| `Invalid prisma.$queryRaw() invocation` | Test chạy song song với dev server đang ghi DB | Dừng dev server rồi chạy test, hoặc dùng `docker compose -f infra/docker-compose.demo.yml up` |
| Trang trắng, console báo lỗi module | Dev server chưa compile xong | Đợi vài giây, hard refresh (`Ctrl+Shift+R`) |
| `Proposer không thể tự quyết định approval của mình` | Đúng business rule FR-APR-09 | Đăng nhập bằng tài khoản MANAGER khác để duyệt |

---

## 10. Lịch sử commit quan trọng

| Commit | Nội dung |
|---|---|
| `6f4d033` | Gemini AI provider, lọc vai trò IAM, sửa các lỗi luồng UI |
| `c351993` | Tính đúng tổng tiền revision, thêm filter tìm kiếm linh kiện |
| `fba834b` | Hiển thị lỗi API trong DataTable, ô tìm kiếm linh kiện |
| `a37a880` | Ẩn thông tin tài khoản demo ở production |
| `6f574c3` | CI: job E2E với Postgres service |

---

## 11. Thông tin đồ án

- **Trường**: Đại học Thủy Lợi — Khoa Công nghệ thông tin
- **Loại**: Đồ án tốt nghiệp
- **Phạm vi**: Một tổ chức (đơn vị sản xuất/công ty)
