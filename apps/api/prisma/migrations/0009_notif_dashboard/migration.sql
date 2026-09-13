-- Migration 0009_notif_dashboard - M9: Notification + Realtime + Dashboard + Report
-- Nguon: docs/db_schema.md Doc04 section 5.8 + plan section 12.2 M9.
--
-- Changes:
--   1. CHECK constraint event_type (Doc04 §5.8 + M9 spec):
--      notifications.event_type IN (
--        INVENTORY_LOW_STOCK,                    -- low-stock trigger M7
--        APPROVAL_SUBMITTED, APPROVAL_DECIDED, APPROVAL_REQUEST_INFO, -- approval inbox
--        WORK_ORDER_OVERDUE,                     -- SLA breach
--        WORK_ORDER_ASSIGNED,                    -- assignee notification
--        MAINTENANCE_OCCURRENCE_DUE,             -- scheduler tick
--        SYSTEM                                  -- system-wide (admin)
--      )
--   2. CHECK object_type (Doc04):
--      notifications.object_type IN ('part', 'work_order', 'approval', 'asset', 'maintenance_plan', 'user', 'system')
--   3. Indexes:
--      - idx_notifications_unread_recipient (recipient_id, created_at DESC) WHERE read_at IS NULL
--        (Doc04 §5.8 + Doc07 TC-NOT-04: danh sach unread cho badge UI)
--   4. Khong tao table moi; view v_kpi_* runtime qua Prisma raw (Doc04: "khong tao bang rieng").

-- 1. CHECK event_type
ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_event_type_check";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_event_type_check"
  CHECK ("event_type" IN (
    'INVENTORY_LOW_STOCK',
    'APPROVAL_SUBMITTED',
    'APPROVAL_DECIDED',
    'APPROVAL_REQUEST_INFO',
    'WORK_ORDER_OVERDUE',
    'WORK_ORDER_ASSIGNED',
    'MAINTENANCE_OCCURRENCE_DUE',
    'SYSTEM'
  ));

-- 2. CHECK object_type
ALTER TABLE "notifications"
  DROP CONSTRAINT IF EXISTS "notifications_object_type_check";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_object_type_check"
  CHECK ("object_type" IN (
    'part',
    'work_order',
    'approval',
    'asset',
    'maintenance_plan',
    'user',
    'system'
  ));

-- 3. Index unread-recipient (Doc04 §5.8 + Doc07 TC-NOT-04)
CREATE INDEX IF NOT EXISTS "idx_notifications_unread_recipient"
  ON "notifications" ("recipient_id", "created_at" DESC)
  WHERE "read_at" IS NULL;
