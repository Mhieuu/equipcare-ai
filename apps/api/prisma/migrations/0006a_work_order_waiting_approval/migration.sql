-- Migration 0006a_work_order_waiting_approval - M6: bo sung WAITING_APPROVAL vao enum
-- Nguon: plan section 12.2 M6; Doc04 section 5.4 cho phep WO o WAITING_APPROVAL (Q-06).
--
-- Reason: 0005_work_orders chi cho phep (NEW, ASSIGNED, IN_PROGRESS, COMPLETED, CANCELLED).
-- M6 can them WAITING_APPROVAL de worker cho duyet voi cost vuot qua approval_threshold_cost.
--
-- Them WAITING_APPROVAL vao work_orders_status_check (Doc04 section 5.4 + M6 plan).
-- Update partial unique uniq_open_repair_per_incident de WAITING_APPROVAL van "open"
-- (khi dang WAITING_APPROVAL van dang mo cho incident do - khong tao WO REPAIR moi).

-- 1. Work_orders.status: them WAITING_APPROVAL
ALTER TABLE "work_orders"
  DROP CONSTRAINT IF EXISTS "work_orders_status_check_v2";

ALTER TABLE "work_orders"
  ADD CONSTRAINT "work_orders_status_check_v2"
  CHECK ("status" IN (
    'NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_APPROVAL',
    'COMPLETED', 'CANCELLED'
  ));

-- Loi migration cum: drop check cu va su dung constraint moi (DB chi chap nhan 1 CHECK cung ten
-- neu noi dung giong nhau, nhung vi them mot value moi -> phai drop va recreate).
ALTER TABLE "work_orders"
  DROP CONSTRAINT "work_orders_status_check";

ALTER TABLE "work_orders"
  RENAME CONSTRAINT "work_orders_status_check_v2" TO "work_orders_status_check";

-- 2. Partial unique khong can update (dieu kien NOT IN terminal van giu WAITING_APPROVAL la open)
-- Vi check khong thay doi, nguoi doc xem 0005_work_orders/migration.sql.
