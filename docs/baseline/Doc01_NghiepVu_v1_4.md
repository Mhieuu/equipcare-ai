# Doc01 — Khảo sát nghiệp vụ và phân tích bài toán

**Baseline Status : LOCKED v1.0** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document01_NghiepVu_v1_4.docx` (phiên bản gốc 1.4, 08/09/2026).
> File gốc lưu tại `~/Downloads/DATN/Document01_NghiepVu_v1_4.docx` (ngoài repo).

## Mục đích

Tài liệu này trình bày kết quả khảo sát nghiệp vụ, phân tích bài toán và danh sách yêu cầu nghiệp vụ (BR-01..BR-24, NV-01..NV-20) — đầu vào cho SRS, Use Case, ERD, Kiến trúc/API, UX và Kế hoạch kiểm thử.

> Toàn bộ nội dung chi tiết xem file gốc `.docx`. Tóm tắt các quyết định chốt:

- Phạm vi: 1 tổ chức, 4 vai trò (Admin, Manager, Technician, Reporter/Requester).
- Module nghiệp vụ: Asset, Incident, Work Order, Maintenance Plan, Spare Parts, Cost & Approval, Notification, Dashboard, AI hỗ trợ.
- Mã hiển thị thống nhất theo format `AST-YYYY-NNNN`, `INC-YYYYMM-NNNN`, `WO-YYYYMM-NNNN`.
- Ngưỡng phê duyệt chi phí cấu hình theo tổ chức, mặc định 2.000.000 VND (theo `thresholds`/`approval_revisions`).
- File đính kèm ở S3-compatible storage; database chỉ lưu metadata.
- AI là tùy chọn có feature flag; workflow vẫn chạy khi AI down.
