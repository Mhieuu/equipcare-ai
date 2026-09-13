-- Migration 0005_work_orders - M5: Work Order core + SLA
-- Nguon: docs/db_schema.md Doc04 section 3.2 + 5.4 + 5.6; plan section 12.2 M5; Q-04 SLA.
--
-- Changes:
--   1. CHECK constraints enum Doc04 strict:
--      - work_orders.status        IN (NEW, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED)
--      - work_orders.kind          IN (REPAIR, MAINTENANCE, INSPECTION)
--      - work_orders.creation_mode IN (MANUAL, FROM_INCIDENT, FROM_MAINTENANCE)
--      - work_orders.priority_code IN (LOW, MEDIUM, HIGH, CRITICAL)
--      - work_order_notes.note_type IN (PROGRESS, PAUSE_START, PAUSE_END,
--                                       WAITING_APPROVAL_START, WAITING_APPROVAL_END)
--   2. Partial unique index Doc04 DB-03:
--      mot incident chi co 1 WO REPAIR dang mo (status NOT IN terminal).
--   3. Indexes bo sung cho queries thuong gap.
--
-- Luu y tu de cuong (Q-04):
--   - SLA tinh pause-aware qua note_type PAUSE_START/PAUSE_END,
--     WAITING_APPROVAL_START/END (M6 se dung them).
--   - Status enum KHONG co PAUSED (Doc04) - pause chi la note event.
--   - Complete WO -> neu la REPAIR duy nhat dang mo cua incident
--     -> incident tu chuyen sang RESOLVED (service layer xu ly).

-- 1. work_orders.status (Doc04 section 3.2)
ALTER TABLE "work_orders"
  DROP CONSTRAINT IF EXISTS "work_orders_status_check";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_status_check"
  CHECK ("status" IN ('NEW', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));

-- 2. work_orders.kind (Doc04 section 3.2)
ALTER TABLE "work_orders"
  DROP CONSTRAINT IF EXISTS "work_orders_kind_check";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_kind_check"
  CHECK ("kind" IN ('REPAIR', 'MAINTENANCE', 'INSPECTION'));

-- 3. work_orders.creation_mode (Doc04 section 5.4)
ALTER TABLE "work_orders"
  DROP CONSTRAINT IF EXISTS "work_orders_creation_mode_check";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_creation_mode_check"
  CHECK ("creation_mode" IN ('MANUAL', 'FROM_INCIDENT', 'FROM_MAINTENANCE'));

-- 4. work_orders.priority_code (Doc04 section 3.2 - dung chung IncidentPriority)
ALTER TABLE "work_orders"
  DROP CONSTRAINT IF EXISTS "work_orders_priority_code_check";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_priority_code_check"
  CHECK ("priority_code" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- 5. work_order_notes.note_type (Doc04 section 5.6 + Q-04)
--    PROGRESS, PAUSE_START, PAUSE_END, WAITING_APPROVAL_START, WAITING_APPROVAL_END
ALTER TABLE "work_order_notes"
  DROP CONSTRAINT IF EXISTS "work_order_notes_note_type_check";

ALTER TABLE "work_order_notes"
  ADD CONSTRAINT "work_order_notes_note_type_check"
  CHECK ("note_type" IN (
    'PROGRESS',
    'PAUSE_START',
    'PAUSE_END',
    'WAITING_APPROVAL_START',
    'WAITING_APPROVAL_END'
  ));

-- 6. Partial unique Doc04 DB-03: mot incident chi co toi da 1 WO REPAIR dang mo
DROP INDEX IF EXISTS "uniq_open_repair_per_incident";

CREATE UNIQUE INDEX "uniq_open_repair_per_incident"
  ON "work_orders" ("incident_id")
  WHERE "incident_id" IS NOT NULL
    AND "kind" = 'REPAIR'
    AND "status" NOT IN ('COMPLETED', 'CANCELLED');

-- 7. Indexes bo sung cho queries

-- Kanban board / dispatch: filter status + assignee + due_at
CREATE INDEX IF NOT EXISTS "idx_work_orders_status_due_at"
  ON "work_orders" ("status", "due_at");

-- SLA scan overdue: started_at + status filter
CREATE INDEX IF NOT EXISTS "idx_work_orders_active_started"
  ON "work_orders" ("status", "started_at")
  WHERE "status" IN ('ASSIGNED', 'IN_PROGRESS');

-- Notes per WO ordered by time (cho pause timeline UI)
CREATE INDEX IF NOT EXISTS "idx_work_order_notes_wo_time"
  ON "work_order_notes" ("work_order_id", "note_type", "created_at");
