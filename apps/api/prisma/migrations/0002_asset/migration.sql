-- Migration 0002_asset — M2: bổ sung CHECK constraint cho assets.manual_state + view v_asset_state
-- Nguồn: docs/db_schema.md Doc04 §5.3 + Q-08 (plan §9)
--
-- Thay đổi:
-- 1. CHECK constraint cho manual_state ∈ ('NORMAL', 'SUSPENDED', 'RETIRED')
--    (Doc04 §5.3: 3 trạng thái vận hành, do con người đặt thủ công).
-- 2. View v_asset_state — derived activity_status (= manual_state hiện tại).
--    M5+ sẽ JOIN với work_orders để tính MAINTENANCE/REPAIR từ WO đang mở.
--    M2 chỉ tạo skeleton view (Doc04 §7.2 + plan Q-08).

-- =============================================================================
-- CHECK constraint cho assets.manual_state
-- =============================================================================
ALTER TABLE "assets"
  DROP CONSTRAINT IF EXISTS "assets_manual_state_check";

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_manual_state_check"
  CHECK ("manual_state" IN ('NORMAL', 'SUSPENDED', 'RETIRED'));

-- =============================================================================
-- View v_asset_state — derived activity_status
--
-- M2: chỉ manual_state. Khi M5 có work_orders, view sẽ JOIN thêm để
-- tính MAINTENANCE (có WO MAINTENANCE đang mở) / REPAIR (có WO REPAIR đang mở).
--
-- Q-08 nhãn tiếng Việt (plan §9) mapping:
--   OPERATIONAL  → "Đang hoạt động"
--   MAINTENANCE  → "Đang bảo trì"
--   REPAIR       → "Đang sửa chữa"
--   SUSPENDED    → "Tạm ngừng"
--   RETIRED      → "Ngừng sử dụng"
--
-- Mapping sống ở packages/shared/labels.ts (frontend + API response).
-- =============================================================================
CREATE OR REPLACE VIEW "v_asset_state" AS
SELECT
  a.id              AS asset_id,
  a.code            AS asset_code,
  a.manual_state    AS manual_state,
  -- M2: activity_status = manual_state (M5 sẽ override MAINTENANCE/REPAIR từ WO).
  CASE a.manual_state
    WHEN 'NORMAL'    THEN 'OPERATIONAL'
    WHEN 'SUSPENDED' THEN 'SUSPENDED'
    WHEN 'RETIRED'   THEN 'RETIRED'
  END               AS activity_status
FROM assets a;

COMMENT ON VIEW "v_asset_state" IS
  'Derived activity_status cho assets. M2 = manual_state; M5 JOIN work_orders để thêm MAINTENANCE/REPAIR (Doc04 §7.2, plan §9 Q-08).';
