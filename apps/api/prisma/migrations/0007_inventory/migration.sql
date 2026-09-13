-- Migration 0007_inventory - M7: Inventory + Q-06 net_issued_quantity
-- Nguon: docs/db_schema.md Doc04 section 3.2 + 5.6 + 5.7; plan section 12.2 M7; Q-06 (full).
--
-- Changes:
--   1. CHECK constraints enum Doc04 strict:
--      - stock_transactions.movement_type IN (ISSUE, RETURN, RECEIPT, ADJUST, TRANSFER_IN, TRANSFER_OUT)
--   2. CHECK constraint parts.on_hand >= 0 + minimum_stock >= 0:
--      - Dam bao invariant khong bi vi pham (Doc04 section 5.6).
--      - Service layer atomic update (UPDATE parts SET on_hand = on_hand +/- ? WHERE id = ? AND ...)
--        se check >= 0 truoc khi commit, nhung DB constraint la defense-in-depth.
--   3. Indexes bo sung cho queries (low-stock scan, ledger per part).
--   4. Unique constraint: moi WO chi co toi da 1 work_order_parts record moi part
--      (co san tu schema @@unique([work_order_id, part_id])).

-- 1. stock_transactions.movement_type (Doc04 section 5.6)
ALTER TABLE "stock_transactions"
  DROP CONSTRAINT IF EXISTS "stock_transactions_movement_type_check";

ALTER TABLE "stock_transactions"
  ADD CONSTRAINT "stock_transactions_movement_type_check"
  CHECK ("movement_type" IN (
    'ISSUE',
    'RETURN',
    'RECEIPT',
    'ADJUSTMENT',
    'TRANSFER_IN',
    'TRANSFER_OUT'
  ));

-- 2. parts.on_hand >= 0 (Doc04 section 5.6 invariant)
ALTER TABLE "parts"
  DROP CONSTRAINT IF EXISTS "parts_on_hand_non_negative";

ALTER TABLE "parts"
  ADD CONSTRAINT "parts_on_hand_non_negative"
  CHECK ("on_hand" >= 0);

-- 3. parts.minimum_stock >= 0
ALTER TABLE "parts"
  DROP CONSTRAINT IF EXISTS "parts_minimum_stock_non_negative";

ALTER TABLE "parts"
  ADD CONSTRAINT "parts_minimum_stock_non_negative"
  CHECK ("minimum_stock" >= 0);

-- 4. Indexes

-- Low-stock alert scan: on_hand < minimum_stock
CREATE INDEX IF NOT EXISTS "idx_parts_low_stock"
  ON "parts" ("is_active", "department_id")
  WHERE "is_active" = true;

-- Stock ledger per part (recent first) - co san trong schema
-- @@index([part_id, occurred_at]) -- co san

-- Work-order planned parts lookup
CREATE INDEX IF NOT EXISTS "idx_work_order_parts_wo"
  ON "work_order_parts" ("work_order_id");

-- 5. Trigger: low_stock notification - ghi notifications khi on_hand < minimum_stock
-- Su dung AFTER UPDATE OF on_hand tren parts. Insert notifications voi
-- event_key = 'low_stock:{part_id}' (Doc04 section 5.8 UNIQUE(recipient_id, event_key)).
-- Recipient = users co role ADMIN (Doc04 FR-NOT).

DROP TRIGGER IF EXISTS trg_parts_low_stock ON "parts";
DROP TRIGGER IF EXISTS trg_parts_low_stock_insert ON "parts";
DROP FUNCTION IF EXISTS notify_low_stock();

CREATE OR REPLACE FUNCTION notify_low_stock() RETURNS trigger AS $$
DECLARE
  v_should_notify boolean := false;
  v_admin_role_id uuid;
BEGIN
  -- Chi notify khi vua crossing threshold (on_hand xuong duoi minimum_stock)
  -- va da tung o tren (hoac moi tao)
  IF NEW.on_hand < NEW.minimum_stock
     AND (OLD.on_hand IS NULL OR OLD.on_hand >= OLD.minimum_stock) THEN
    v_should_notify := true;
  END IF;

  IF NOT v_should_notify THEN
    RETURN NEW;
  END IF;

  -- Lay admin role id
  SELECT id INTO v_admin_role_id FROM roles WHERE code = 'ADMIN' LIMIT 1;
  IF v_admin_role_id IS NULL THEN
    RETURN NEW; -- khong co admin role, skip
  END IF;

  INSERT INTO notifications (id, recipient_id, event_key, event_type, title, object_type, object_key)
  SELECT gen_random_uuid(),
         ur.user_id,
         'low_stock:' || NEW.id::text,
         'INVENTORY_LOW_STOCK',
         LEFT('Linh kien "' || NEW.code || '" duoi muc toi thieu (' || NEW.on_hand::text || ' < ' || NEW.minimum_stock::text || ')', 200),
         'part',
         LEFT(NEW.id::text, 100)
  FROM user_roles ur
  WHERE ur.role_id = v_admin_role_id
    AND ur.revoked_at IS NULL
  ON CONFLICT (recipient_id, event_key) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_parts_low_stock ON "parts";

CREATE TRIGGER trg_parts_low_stock
  AFTER UPDATE OF on_hand ON "parts"
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_stock();

-- Cung apply khi INSERT (khoi tao on_hand < minimum_stock)
DROP TRIGGER IF EXISTS trg_parts_low_stock_insert ON "parts";

CREATE TRIGGER trg_parts_low_stock_insert
  AFTER INSERT ON "parts"
  FOR EACH ROW
  EXECUTE FUNCTION notify_low_stock();
