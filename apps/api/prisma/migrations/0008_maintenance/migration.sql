-- Migration 0008_maintenance - M8: Maintenance Plan + Scheduler
-- Nguon: docs/db_schema.md Doc04 section 5.10 + DB-04; plan section 12.2 M8.
--
-- Changes:
--   1. CHECK constraints enum Doc04 strict:
--      - maintenance_plans.interval_unit IN (DAY, WEEK, MONTH, QUARTER, YEAR)
--      - maintenance_plans.schedule_basis IN (FIXED, AFTER_COMPLETION) -- M8 P1 chi dung FIXED
--      - maintenance_occurrences.status IN (PLANNED, SKIPPED, OVERDUE, COMPLETED, IN_PROGRESS)
--   2. CHECK constraints invariants:
--      - maintenance_plans.interval_value > 0
--   3. Partial unique: 1 work_order open cho moi occurrence (Doc04 Q-02):
--      - work_orders.occurrence_id partial UNIQUE WHERE status NOT IN ('COMPLETED','CANCELLED')
--      - Dam bao scheduler khong sinh 2 WO mo cung luc cho 1 occurrence.
--   4. Indexes:
--      - idx_maintenance_plans_active_due (co san)
--      - idx_maintenance_occurrences_status_due
--      - idx_work_orders_occurrence_partial (co san idx occurrence_id; partial unique them o buoc 3)
--   5. Seed defaults: khong can them.

-- 1. CHECK interval_unit
ALTER TABLE "maintenance_plans"
  DROP CONSTRAINT IF EXISTS "maintenance_plans_interval_unit_check";

ALTER TABLE "maintenance_plans"
  ADD CONSTRAINT "maintenance_plans_interval_unit_check"
  CHECK ("interval_unit" IN ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'));

-- 2. CHECK schedule_basis
ALTER TABLE "maintenance_plans"
  DROP CONSTRAINT IF EXISTS "maintenance_plans_schedule_basis_check";

ALTER TABLE "maintenance_plans"
  ADD CONSTRAINT "maintenance_plans_schedule_basis_check"
  CHECK ("schedule_basis" IN ('FIXED', 'AFTER_COMPLETION'));

-- 3. CHECK interval_value > 0
ALTER TABLE "maintenance_plans"
  DROP CONSTRAINT IF EXISTS "maintenance_plans_interval_value_positive";

ALTER TABLE "maintenance_plans"
  ADD CONSTRAINT "maintenance_plans_interval_value_positive"
  CHECK ("interval_value" > 0);

-- 4. CHECK occurrences.status
ALTER TABLE "maintenance_occurrences"
  DROP CONSTRAINT IF EXISTS "maintenance_occurrences_status_check";

ALTER TABLE "maintenance_occurrences"
  ADD CONSTRAINT "maintenance_occurrences_status_check"
  CHECK ("status" IN ('PLANNED', 'SKIPPED', 'OVERDUE', 'IN_PROGRESS', 'COMPLETED'));

-- 5. CHECK plan_version > 0
ALTER TABLE "maintenance_occurrences"
  DROP CONSTRAINT IF EXISTS "maintenance_occurrences_plan_version_positive";

ALTER TABLE "maintenance_occurrences"
  ADD CONSTRAINT "maintenance_occurrences_plan_version_positive"
  CHECK ("plan_version" > 0);

-- 6. Partial unique: 1 work_order open cho moi occurrence (Doc04 Q-02)
-- Co the create mot partial UNIQUE index thay vi constraint vi PG khong ho tro
-- partial UNIQUE constraint truc tiep (chi co partial UNIQUE index).
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_open_wo_per_occurrence"
  ON "work_orders" ("occurrence_id")
  WHERE "occurrence_id" IS NOT NULL
    AND "status" NOT IN ('COMPLETED', 'CANCELLED');

-- 7. Indexes bo sung
CREATE INDEX IF NOT EXISTS "idx_maintenance_occurrences_status_due"
  ON "maintenance_occurrences" ("status", "due_on");

CREATE INDEX IF NOT EXISTS "idx_maintenance_plans_active_basis"
  ON "maintenance_plans" ("is_active", "schedule_basis")
  WHERE "is_active" = true;
