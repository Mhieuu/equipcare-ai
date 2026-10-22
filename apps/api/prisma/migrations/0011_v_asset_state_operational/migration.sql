-- Migration 0011_v_asset_state_operational - FIX: v_asset_state tra activity_status sai
--
-- BUG: migration 0010 vô tình regress mapping manual_state -> activity_status.
--   CASE ... ELSE a.manual_state  →  trả 'NORMAL'
--   nhưng enum ActivityStatus (packages/shared/src/enums/asset.enum.ts) chỉ có:
--     OPERATIONAL | MAINTENANCE | REPAIR | SUSPENDED | RETIRED
--
-- Hậu quả (44 assets trong DB):
--   - GET /assets trả activityStatus='NORMAL' (không thuộc enum)
--   - ActivityStatusLabel[activityStatus] = undefined → activityStatusLabel = '' (UI hiển thị rỗng)
--   - GET /dashboard/kpis: operationalAssets luôn = 0 (query group by 'OPERATIONAL' không match)
--
-- Migration 0002 map đúng: WHEN 'NORMAL' THEN 'OPERATIONAL'. 0010 phải giữ mapping này.
--
-- Fix: ELSE 'OPERATIONAL' (manual_state NORMAL + không có WO mở = thiết bị đang vận hành).

CREATE OR REPLACE VIEW "v_asset_state" AS
SELECT
  a.id              AS asset_id,
  a.code            AS asset_code,
  a.manual_state    AS manual_state,
  -- Priority: REPAIR > MAINTENANCE > manual_state (khi manual_state la NORMAL)
  --          manual_state giu nguyen khi SUSPENDED/RETIRED (operator override).
  --          NORMAL (khong WO mo) -> OPERATIONAL (enum ActivityStatus).
  CAST(
    CASE
      WHEN a.manual_state IN ('SUSPENDED', 'RETIRED') THEN a.manual_state
      WHEN EXISTS (
        SELECT 1 FROM work_orders wo
        WHERE wo.asset_id = a.id
          AND wo.kind = 'REPAIR'
          AND wo.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL')
      ) THEN 'REPAIR'
      WHEN EXISTS (
        SELECT 1 FROM work_orders wo
        WHERE wo.asset_id = a.id
          AND wo.kind = 'MAINTENANCE'
          AND wo.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL')
      ) THEN 'MAINTENANCE'
      ELSE 'OPERATIONAL'
    END
  AS text)          AS activity_status,
  -- Array string cac kind WO dang mo (de FE tooltip).
  (
    SELECT array_to_string(array_agg(DISTINCT wo.kind), ',')
    FROM work_orders wo
    WHERE wo.asset_id = a.id
      AND wo.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL')
  ) AS active_wo_kinds,
  (
    SELECT COUNT(1)::int
    FROM work_orders wo
    WHERE wo.asset_id = a.id
      AND wo.status IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL')
  ) AS active_wo_count
FROM assets a;

COMMENT ON VIEW "v_asset_state" IS
  'Derived activity_status: REPAIR > MAINTENANCE > OPERATIONAL (manual_state NORMAL). SUSPENDED/RETIRED giu nguyen (operator override). Enum ActivityStatus: OPERATIONAL|MAINTENANCE|REPAIR|SUSPENDED|RETIRED. Q-08 M10, fix 0011.';
