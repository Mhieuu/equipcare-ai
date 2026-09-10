# Doc03 — Phân tích ca sử dụng (Use Case) và phân quyền theo vai trò (RBAC)

**Baseline Status : LOCKED v1.4** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document03_UseCase_RBAC_v1_4.docx` (phiên bản gốc 1.4, 08/09/2026, đồng bộ Doc01–02).
> File gốc lưu tại `~/Downloads/DATN/Document03_UseCase_RBAC_v1_4.docx` (ngoài repo).

## Nguyên tắc

- Mỗi ca sử dụng đại diện cho **mục tiêu** có ý nghĩa đối với tác nhân — không dùng trạng thái ("Đang xử lý", "Chờ phê duyệt") làm tên UC.
- Sự cố và Phiếu công việc **tách riêng**: Incident quản lý vòng đời yêu cầu; WO quản lý phần việc kỹ thuật.
- Các xử lý tự động (cập nhật tồn kho, tính ngày bảo trì, ghi nhật ký) **không** tách thành UC người dùng nếu không có mục tiêu tương tác độc lập.
- Quan hệ `include`/`extend` chỉ dùng khi thật sự làm rõ mô hình; điều kiện phát sinh mô tả trong phần đặc tả.

## 4 vai trò nghiệp vụ

- **Người sử dụng (Requester)** — báo sự cố, theo dõi yêu cầu.
- **Kỹ thuật viên (Technician)** — xử lý WO được giao.
- **Quản lý (Manager)** — điều phối, phân công, duyệt, theo dõi.
- **Quản trị viên (Admin)** — quản lý tài khoản, danh mục, cấu hình, audit.

## Ma trận quyền (tổng hợp)

| Quyền (permission action) | Admin | Manager | Technician | Requester |
|---|---:|---:|---:|---:|
| user.manage | ✓ | — | — | — |
| asset.{create,update,archive} | ✓ | ✓ | — | — |
| asset.read | ✓ | ✓ | ✓ | dept |
| incident.{create,read} | ✓ | ✓ | assigned | own |
| incident.triage | ✓ | ✓ | — | — |
| work_order.{create,read,assign} | ✓ | ✓ | assigned | — |
| work_order.{execute,complete} | ✓ | ✓ | assigned | — |
| approval.{request,decide} | ✓ | ✓ | — | — |
| cost.manage | ✓ | ✓ | assigned | — |
| dashboard.operational | ✓ | ✓ | assigned | own |
| report.export | ✓ | ✓ | — | — |
| audit.read | ✓ | ✓ (nghiệp vụ) | — | — |
| ai.use | ✓ | ✓ | assigned | own |

## Quy tắc tách nhiệm vụ

- Người tạo approval request **không** được quyết định request đó.
- Kỹ thuật viên **không** tự đổi assignee sang người khác.
- Requester không sửa incident sau khi TRIAGED; chỉ bổ sung comment/file.
- Admin reset mật khẩu **không** được xem mật khẩu mới.

> Toàn bộ UC chi tiết, đặc tả luồng chính/luồng thay thế, điều kiện trước/sau xem file gốc `.docx`.
