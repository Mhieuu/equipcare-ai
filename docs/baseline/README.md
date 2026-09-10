# Baseline — Doc01..07 LOCKED

## Quyết định

Sau vòng review thứ 5 (`IMPLEMENTATION_PLAN.md` rev. 5) đã đối chiếu toàn bộ với Doc01..07 v1.4/v1.2/v1.1, baseline v1.x được **đóng băng** trước W1 (2026-09-28) theo IMPLEMENTATION_PLAN §0.

| Tài liệu | Phiên bản | Ngày lock | Bằng chứng |
|---|---|---|---|
| Doc01 — Khảo sát nghiệp vụ | v1.4 | 2026-09-10 | `Doc01_NghiepVu_v1_4.md` |
| Doc02 — SRS | v1.4 | 2026-09-10 | `Doc02_SRS_v1_4.md` |
| Doc03 — UC / RBAC | v1.4 | 2026-09-10 | `Doc03_UseCase_RBAC_v1_4.md` |
| Doc04 — CSDL / ERD | v1.2 | 2026-09-10 | `Doc04_CSDL_ERD_v1_2_Clean.md` |
| Doc05 — Kiến trúc / API | v1.2 | 2026-09-10 | `Doc05_KienTruc_API_v1_2_Clean_Sync.md` |
| Doc06 — UX / UI / Sitemap | v1.1 | 2026-09-10 | `Doc06_UX_UI_Sitemap_UserFlow_v1_1_NoiDung.md` |
| Doc07 — Kiểm thử / Nghiệm thu | v1.1 | 2026-09-10 | `Doc07_KeHoach_KiemThu_NghiemThu_v1_1.md` |

## Quy tắc

- Mọi thay đổi nghiệp vụ sau thời điểm này phải qua **change request form** riêng và cập nhật cả 3 tài liệu (Doc02 + Doc04 + Doc07).
- `IMPLEMENTATION_PLAN.md` rev. 5 đã ghi nhận toàn bộ Q-items chốt (Q-01..Q-07) và các quyết định đã review — coi là nguồn sử dụng hằng ngày.

## Quyết định baseline đã đối chiếu (xem IMPLEMENTATION_PLAN §1, §5)

1. ✅ Single-tenant MVP, UUID seed cố định cho `org_unit`.
2. ✅ Stack pin: Node 22, pnpm 9.12+, NestJS 10, Prisma 5, Next.js 14, React 18.
3. ✅ WAITING_PARTS **không dùng**; pause chờ linh kiện = `IN_PROGRESS` + `event_type=PAUSED` + `pause_reason`.
4. ✅ Magic bytes check trên upload trước MIME allowlist.
5. ✅ APPROVAL `DRAFT|PENDING|AWAITING_INFO|APPROVED|REJECTED|CANCELLED` (không `SUPERSEDED`).
6. ✅ M6 = Cost + Approval; M7 = Inventory (đổi để tránh phụ thuộc vòng Q-06).
7. ✅ AI 100% async (202 + requestId); gửi ngữ cảnh nghiệp vụ tối thiểu đã làm sạch, không PII.
8. ✅ Tách Compose: `docker-compose.infra.yml` (infra) + `docker-compose.demo.yml` (full stack); `pnpm demo:up` không chạy `pnpm dev` ngược lại.
9. ✅ RBAC chain trên `userRoleId`, không ghép quyền A với scope B.
10. ✅ BACKEND-CORE shared giữa api + worker; không circular dependency.

## Bằng chứng

- `IMPLEMENTATION_PLAN.md` rev. 5 — đối chiếu đầy đủ Doc02/03/04/05/06/07.
- File trích `.md` này (mỗi doc) đã giữ nguyên phần Q-items chốt và FR/TC mapping.
- File gốc `.docx` lưu tại `~/Downloads/DATN/` (ngoài repo, dùng để đối chiếu khi cần).
