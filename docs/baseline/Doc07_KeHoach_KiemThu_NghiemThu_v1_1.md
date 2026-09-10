# Doc07 — Kế hoạch kiểm thử và nghiệm thu

**Baseline Status : LOCKED v1.1** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document07_KeHoach_KiemThu_NghiemThu_v1_1.docx` (phiên bản gốc 1.1, 08/09/2026).
> File gốc lưu tại `~/Downloads/DATN/Document07_KeHoach_KiemThu_NghiemThu_v1_1.docx` (ngoài repo).

## Version log

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 2026-08-25 | Khởi tạo |
| 1.1 | 2026-09-08 | Đồng bộ Doc02–06; thêm TC-DATA-01..05; bổ sung TC-DOC-01..05 |
| **1.1 LOCKED** | **2026-09-10** | **Baseline M0 — Vu Minh Hieu** |

## Bộ test case (tổng hợp)

| Mã | Số lượng | Module |
|---|---:|---|
| TC-AUTH-01..05 | 5 | Auth |
| TC-RBAC-01..06 | 6 | IAM/RBAC |
| TC-ORG-01..04 | 4 | Org & cấu hình |
| TC-CFG-01..03 | 3 | Cấu hình |
| TC-ASSET-01..05 | 5 | Asset |
| TC-INC-01..06 | 6 | Incident |
| TC-WO-01..08 | 8 | Work Order |
| TC-MNT-01..05 | 5 | Maintenance |
| TC-PART-01..07 | 7 | Inventory |
| TC-COST-01..04 | 4 | Cost |
| TC-APR-01..07 | 7 | Approval |
| TC-NOT-01..06 | 6 | Notification |
| TC-AI-01..06 | 6 | AI |
| TC-DOC-01..05 | 5 | Attachment |
| TC-AUD-01..04 | 4 | Audit |
| TC-REP-01..04 | 4 | Dashboard/Report |
| TC-UX-01..08 | 8 | UX |
| TC-PERF-01..04 | 4 | Hiệu năng |
| TC-SEC-01..08 | 8 | Bảo mật |
| TC-DATA-01..05 | 5 | Toàn vẹn dữ liệu |
| TC-OPS-01..03 | 3 | Vận hành |
| **Tổng** | **111** | |

## Phân lớp test

- **Unit**: state machine, RBAC policy, scope, SLA, recurrence, inventory (không âm), cost, AI schema validation.
- **Integration**:
  - Auth refresh rotation / reuse detection.
  - Org isolation.
  - Create incident + audit + outbox trong transaction.
  - Assign/start/complete/verify WO.
  - Concurrent issue stock: balance **không âm** (TC-PART, TC-DATA).
  - Approval separation of duties.
  - Scheduler không tạo PM trùng.
  - File permission và presign.
- **E2E critical paths** (8):
  1. Requester login → quét QR → báo sự cố → theo dõi.
  2. Manager triage → assign → technician nhận việc.
  3. Technician start → log → issue part → complete.
  4. Manager verify/close → requester nhận notification.
  5. Cost vượt ngưỡng → approval → tiếp tục WO.
  6. Maintenance plan đến hạn → tự sinh WO đúng một lần.
  7. Low stock → notification.
  8. AI lỗi/timeout → người dùng vẫn tạo và xử lý incident thủ công.

## Non-functional

- API list p95 < 500 ms (không tính AI, export).
- Dashboard p95 < 2s với dữ liệu mục tiêu.
- AI interactive timeout có kiểm soát, không block transaction nghiệp vụ.
- Accessibility: login, incident form, WO detail.
- Security: IDOR, role bypass, upload abuse, brute-force, injection.

## Tiêu chí nghiệm thu (Definition of Done — mỗi story)

- Code + migration nếu có + unit/integration test.
- RBAC + audit được xem xét.
- Loading/empty/error/responsive hoàn chỉnh.
- API/OpenAPI cập nhật.
- Không lint/type error.
- Có dữ liệu seed hoặc fixture để demo.
- Acceptance criteria tương ứng được kiểm tra.

> Toàn bộ test case chi tiết (input, expected, bước thực hiện) xem file gốc `.docx`.
