-- Migration 0010_v_asset_state_wo_join - M10: Update v_asset_state JOIN work_orders
-- Nguon: plan Q-08 (M5+ join work_orders cho MAINTENANCE/REPAIR)
--
-- M2 view chi mapping manual_state -> activity_status (NORMAL/SUSPENDED/RETIRED).
-- M5+ can JOIN work_orders de xac dinh MAINTENANCE/REPAIR khi co WO dang mo:
--   - WO kind='MAINTENANCE' va status IN ('NEW','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL')
--     -> activity_status = MAINTENANCE (uu tien hon manual_state NORMAL).
--   - WO kind='REPAIR' va status IN ('NEW','ASSIGNED','IN_PROGRESS','WAITING_APPROVAL')
--     -> activity_status = REPAIR (uu tien hon MAINTENANCE).
--   - Neu manual_state la SUSPENDED/RETIRED thi giu nguyen (operator override).
--   - Khong co WO mo -> giu manual_state mapping.
--
-- View phuc vu UI label (Doc04 section 7.2 + plan Q-08) + dashboard/report join neu can.
-- Field extra active_wo_kinds (array text) de FE biet co WO dang mo loai nao.

CREATE OR REPLACE VIEW "v_asset_state" AS
SELECT
  a.id              AS asset_id,
  a.code            AS asset_code,
  a.manual_state    AS manual_state,
  -- Priority: REPAIR > MAINTENANCE > manual_state (khi manual_state la NORMAL)
  --          manual_state giu nguyen khi SUSPENDED/RETIRED (operator override).
  -- Cast ve text de khop type cu.
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
      ELSE a.manual_state
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
  'Derived activity_status: REPAIR > MAINTENANCE > manual_state (NORMAL). SUSPENDED/RETIRED giu nguyen (operator override). Q-08 M10.';
