# Doc02 — Đặc tả yêu cầu phần mềm (SRS)

**Baseline Status : LOCKED v1.4** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document02_SRS_v1_4.docx` (phiên bản gốc 1.4, 08/09/2026, đồng bộ Doc01–03).
> File gốc lưu tại `~/Downloads/DATN/Document02_SRS_v1_4.docx` (ngoài repo).

## Ngữ cảnh

| Thông tin | Giá trị |
|---|---|
| Sinh viên | Vũ Minh Hiếu |
| Lớp / MSV | 64CNTT3 / 2251061780 |
| Email | hvuminh998@gmail.com |
| GVHD | Trương Xuân Nam |
| Phiên bản | 1.4 — Đồng bộ Doc01–03 (08/09/2026) |

## Quy ước ưu tiên

| Mức | Ý nghĩa |
|---|---|
| **P1 — Bắt buộc** | Thuộc luồng nghiệp vụ chính, cần có trong phiên bản bảo vệ đồ án. |
| **P2 — Nên có** | Có giá trị sử dụng cao, có thể giản lược nếu tiến độ không cho phép. |
| **P3 — Mở rộng** | Không cam kết trong phạm vi 3 tháng. |

## Nhóm yêu cầu đã chốt (tóm tắt)

| Module | FR-# | Nội dung chính |
|---|---|---|
| Auth | FR-AUTH-01..07 | login/logout/refresh/change-password/admin-reset |
| IAM (RBAC) | FR-AUTH-03/05, AC-01/14 | user/role/permission/scope, deactivate, audit |
| Org & Cấu hình | FR-ORG-01..03, FR-CFG-01..02 | org_unit (UUID seed), departments, locations, asset_types, thresholds |
| Asset | FR-ASSET-01..09, AC-02 | CRUD + lifecycle + QR + tech-doc |
| Incident | FR-INC-01..09, AC-03 | lifecycle + transition + AI suggest |
| Work Order | FR-WO-01..09, AC-04/13 | lifecycle + assign + issue/return + cost + approval + complete/cancel |
| Maintenance | FR-MNT-01..09, AC-05 | plan + recurrence + scheduler |
| Inventory | FR-PART-01..08, AC-06 | parts + ledger + issue/return/adjust + low-stock |
| Cost | FR-COST-01..04, AC-08 | cost_entries per WO |
| Approval | FR-APR-01..09, AC-07/14 | request + decision + revision chain |
| Notification | FR-NOT-01..06, AC-09 | list + realtime WS + retry-safe |
| AI | FR-AI-01..06, NFR-AI-01..05, AC-10 | 100% async, 202 + requestId |
| Attachment | FR-DOC-01..04 | STAGED → READY, magic bytes + MIME + size |
| Audit | FR-AUD-01..03, AC-12 | immutable |
| Dashboard/Report | FR-REP-01..05, AC-11 | KPI + CSV |
| Bảo mật | NFR-SEC-01..06, DR-* | across modules |

> ⚠️ **Q-06 (Doc04)** — vượt phương án duyệt: ISSUE bị từ chối khi `net_issued_quantity` hoặc `net_cost` vượt approval APPROVED; chỉ tiếp tục sau khi APPROVED mới.

> ⚠️ **WAITING_PARTS** không dùng trong hệ thống (đã chốt ở M0); "pause vì chờ linh kiện" giữ `IN_PROGRESS` + ghi `pause_reason` ở `work_order_status_history`.

> ⚠️ AI gửi **ngữ cảnh nghiệp vụ tối thiểu đã làm sạch** — không gửi PII hay dữ liệu không liên quan.

## TC tương ứng (xem Doc07)

| Module | Test case |
|---|---|
| Auth | TC-AUTH-01..05 |
| IAM (RBAC) | TC-RBAC-01..06 |
| Org | TC-ORG-01..04 |
| Cấu hình | TC-CFG-01..03 |
| Asset | TC-ASSET-01..05 |
| Incident | TC-INC-01..06 |
| Work Order | TC-WO-01..08 |
| Maintenance | TC-MNT-01..05 |
| Inventory | TC-PART-01..07 |
| Cost | TC-COST-01..04 |
| Approval | TC-APR-01..07 |
| Notification | TC-NOT-01..06 |
| AI | TC-AI-01..06 |
| Attachment | TC-DOC-01..05 |
| Audit | TC-AUD-01..04 |
| Dashboard/Report | TC-REP-01..04 |
| Bảo mật | TC-SEC-01..08 |
| Toàn vẹn dữ liệu | TC-DATA-01..05 |

## Yêu cầu phi chức năng (NFR)

- **Bảo mật**: NFR-SEC-01..06 — auth, authorization, multi-tenant isolation, anti-CSRF, audit.
- **Hiệu năng**: NFR-PERF-* — p95 theo endpoint (xem TC-PERF-01..04).
- **Khả dụng**: NFR-MNT-03 — migration + ops.
- **UX**: NFR-USAB-*, UI-AC-* — accessibility, mobile-responsive.

> Toàn bộ nội dung chi tiết xem file gốc `.docx`.
