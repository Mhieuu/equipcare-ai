# Doc06 — UX / UI / Sitemap / User Flow

**Baseline Status : LOCKED v1.1** · **Locked Date : 2026-09-10** · **Locked By : Vu Minh Hieu**

> Bản markdown trích từ `Document06_UX_UI_Sitemap_UserFlow_v1_1_NoiDung.docx` (phiên bản gốc 1.1, 08/09/2026).
> File gốc lưu tại `~/Downloads/DATN/Document06_UX_UI_Sitemap_UserFlow_v1_1_NoiDung.docx` (ngoài repo).

## Nguyên tắc UX

- Phong cách: hiện đại, kỹ thuật, đáng tin cậy, ít trang trí.
- Desktop: sidebar cố định có thể thu gọn.
- Mobile (KTV/Requester): bottom navigation 4 mục chính.
- Form dài: chia section; cảnh báo rõ khi rời trang có thay đổi.

## Design tokens

| Token | Giá trị | Ý nghĩa |
|---|---|---|
| Primary | Blue 600 `#2563EB` | hành động chính, link |
| Success | Emerald 600 `#059669` | hoàn tất |
| Warning | Amber 500 `#F59E0B` | sắp hạn, chờ |
| Danger | Red 600 `#DC2626` | quá hạn, nghiêm trọng |
| Neutral | Slate scale | nền, viền, chữ |
| Radius | 8–12px | card/form/dialog |
| Spacing | hệ 4px | nhất quán toàn app |
| Font | Inter / system sans | hỗ trợ vi-VN |

## Trạng thái UI bắt buộc

- Loading skeleton · Empty state có CTA · Error có retry · Permission denied rõ · Offline/network.
- Success feedback qua toast; thao tác nghiêm trọng qua confirm dialog.
- Optimistic update **CHỈ** dùng cho thao tác dễ hoàn tác (đọc thông báo); workflow dùng phản hồi server.

## Accessibility (WCAG 2.1 AA cho luồng chính)

- Mọi input có label; lỗi liên kết `aria-describedby`.
- Keyboard nav, focus ring rõ, dialog trap focus.
- Không truyền đạt trạng thái chỉ bằng màu (luôn có label/icon).
- Vùng chạm mobile ≥ 44×44px.
- Bảng mobile → card list hoặc horizontal scroll có cột ghim.

## Sitemap

```
/login · /forgot-password · /reset-password · /qr/:publicToken
/app
├── /dashboard
├── /my-tasks
├── /assets · /assets/new · /assets/:assetId · /assets/:assetId/edit · /assets/:assetId/qr
├── /incidents · /incidents/new · /incidents/:incidentId
├── /work-orders · /work-orders/new · /work-orders/:workOrderId
├── /maintenance/plans · /maintenance/plans/new · /maintenance/plans/:planId · /maintenance/calendar
├── /inventory/parts · /inventory/parts/:partId · /inventory/warehouses · /inventory/transactions
├── /approvals · /approvals/:approvalId
├── /costs
├── /reports
├── /notifications
└── /admin/{users,departments,locations,asset-categories,incident-categories,vendors,sla-policies,notification-settings,audit-logs}
```

> Toàn bộ wireframe, screen design, user flow chi tiết xem file gốc `.docx`.
