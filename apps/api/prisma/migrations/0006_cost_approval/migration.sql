-- Migration 0006_cost_approval - M6: Cost + Approval + WAITING_APPROVAL
-- Nguon: docs/db_schema.md Doc04 section 3.2 + 5.6 + 5.7 + 5.8; plan section 12.2 M6; Q-06; FR-APR-09.
--
-- Changes:
--   1. CHECK constraints enum Doc04 strict:
--      - cost_entries.category     IN (PART, LABOR, OTHER)
--      - cost_entries.direction   IN (DEBIT, CREDIT)
--      - approvals.status         IN (DRAFT, SUBMITTED, APPROVED, REJECTED, CANCELLED, INFO_REQUESTED)
--      - approval_events.event_type IN (SUBMITTED, APPROVED, REJECTED, CANCELLED, INFO_REQUESTED,
--                                       DRAFT_UPDATED, REVISION_CREATED, REVOKED)
--   2. Trigger FR-APR-09 self-approval:
--      approval_events.event_type='APPROVED' -> cho phep nguoi APPROVE khac proposer_id.
--      Su dung trigger BEFORE INSERT de reject neu actor_id = approval.proposer_id.
--   3. Trigger business rule: WO status khi APPROVED -> chuyen WAITING_APPROVAL_EXIT (service layer
--      se lam; migration nay chi dat constraint).
--   4. Indexes bo sung cho queries Dashboard / inbox approval.
--
-- Note:
--   - Q-06 net_cost aggregation o service layer (cost.service.ts).
--   - WAITING_APPROVAL cua WO duoc ghi nhan qua work_order_notes(note_type=WAITING_APPROVAL_*).
--   - approval_revisions.revision_no UNIQUE per approval (co san trong schema @@unique).

-- 1. cost_entries.category (Doc04 section 5.6)
ALTER TABLE "cost_entries"
  DROP CONSTRAINT IF EXISTS "cost_entries_category_check";

ALTER TABLE "cost_entries"
  ADD CONSTRAINT "cost_entries_category_check"
  CHECK ("category" IN ('PART', 'LABOR', 'OTHER'));

-- 2. cost_entries.direction (Doc04 section 5.6 - DEBIT/CREDIT)
ALTER TABLE "cost_entries"
  DROP CONSTRAINT IF EXISTS "cost_entries_direction_check";

ALTER TABLE "cost_entries"
  ADD CONSTRAINT "cost_entries_direction_check"
  CHECK ("direction" IN ('DEBIT', 'CREDIT'));

-- 3. approvals.status (Doc04 section 5.7)
ALTER TABLE "approvals"
  DROP CONSTRAINT IF EXISTS "approvals_status_check";

ALTER TABLE "approvals"
  ADD CONSTRAINT "approvals_status_check"
  CHECK ("status" IN (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'INFO_REQUESTED'
  ));

-- 4. approval_events.event_type (Doc04 section 5.7)
-- SUBMITTED         : revision duoc submit boi proposer.
-- DRAFT_UPDATED     : revision dang duoc chinh sua (PATCH draft).
-- REVISION_CREATED  : proposer tao revision moi (khi bi REJECTED/INFO_REQUESTED).
-- APPROVED          : nguoi duyet chap nhan revision.
-- REJECTED          : nguoi duyet tu choi revision.
-- INFO_REQUESTED    : nguoi duyet yeu cau them thong tin.
-- CANCELLED         : proposer rut approval.
-- REVOKED           : approval bi huy boi admin (rare, rollback).
ALTER TABLE "approval_events"
  DROP CONSTRAINT IF EXISTS "approval_events_event_type_check";

ALTER TABLE "approval_events"
  ADD CONSTRAINT "approval_events_event_type_check"
  CHECK ("event_type" IN (
    'SUBMITTED',
    'DRAFT_UPDATED',
    'REVISION_CREATED',
    'APPROVED',
    'REJECTED',
    'INFO_REQUESTED',
    'CANCELLED',
    'REVOKED'
  ));

-- 5. Indexes ho tro inbox approval / dashboard

-- Inbox (filter status, sort by due_on of revision submitted)
CREATE INDEX IF NOT EXISTS "idx_approvals_status_updated"
  ON "approvals" ("status", "updated_at");

-- Latest revision per approval
CREATE INDEX IF NOT EXISTS "idx_approval_revisions_no"
  ON "approval_revisions" ("approval_id", "revision_no" DESC);

-- Cost by work_order
CREATE INDEX IF NOT EXISTS "idx_cost_entries_wo_category"
  ON "cost_entries" ("work_order_id", "category");

-- 6. Trigger FR-APR-09: khong cho phep tu duyet (actor_id = proposer_id khi event_type=APPROVED)
-- Su dung BEFORE INSERT. Raise exception neu vi pham.
-- Luu y: approval_id -> proposer_id; trigger check approval.proposer_id.
CREATE OR REPLACE FUNCTION enforce_no_self_approval() RETURNS trigger AS $$
DECLARE
  v_proposer_id uuid;
BEGIN
  IF NEW.event_type = 'APPROVED' THEN
    SELECT proposer_id INTO v_proposer_id FROM approvals WHERE id = NEW.approval_id;
    IF v_proposer_id IS NOT NULL AND v_proposer_id = NEW.actor_id THEN
      RAISE EXCEPTION 'FR_APR_09_SELF_APPROVAL: actor (%) khong the duyet approval cua chinh minh', NEW.actor_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_approval_events_no_self_approval ON "approval_events";

CREATE TRIGGER trg_approval_events_no_self_approval
  BEFORE INSERT ON "approval_events"
  FOR EACH ROW
  EXECUTE FUNCTION enforce_no_self_approval();
