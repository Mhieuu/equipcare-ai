-- Migration 0004_incidents_ai — M4: Incident state machine + AI provider infrastructure
-- Nguồn: docs/db_schema.md Doc04 §3.2 + §5.4 + §5.5 + §5.8; plan §12.2 M4.
--
-- Thay đổi: CHECK constraints cho
--   1. incidents.status      ∈ ('NEW','AWAITING_INFO','IN_PROGRESS','RESOLVED','CLOSED','CANCELLED')
--   2. incidents.priority_code ∈ ('LOW','MEDIUM','HIGH','CRITICAL') (Doc04 §3.2 priority)
--   3. incident_messages.message_type ∈ ('REPORTER','STAFF','SYSTEM','AI') — Doc04 §5.5
--   4. ai_requests.task_type ∈ ('INCIDENT_TRIAGE','ASSET_SUMMARY','OTHER') — Doc05 §10.1
--   5. ai_requests.status ∈ ('QUEUED','RUNNING','SUCCEEDED','FAILED','TIMED_OUT') — Doc04 §5.8
--
-- Lưu ý:
--   - Các trạng thái CANCELLED/CLOSED có timestamp tương ứng — set trong service layer
--     (Doc02 §FR-INC-07..09).
--   - Ai_requests.asset_id NOT NULL (Doc04 §5.8): mọi AI request đều gắn với 1 asset
--     để audit/trace; incident_id/work_order_id có thể null cho use case
--     'asset summary' (FR-AI-02).
--   - Lưu PII tối thiểu trong `input_snapshot` (Doc05 §8.3) — service chỉ snapshot
--     metadata (asset_code/loại/triệu chứng ngắn).

-- =============================================================================
-- 1. incidents.status
-- =============================================================================
ALTER TABLE "incidents"
  DROP CONSTRAINT IF EXISTS "incidents_status_check";

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_status_check"
  CHECK ("status" IN ('NEW', 'AWAITING_INFO', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'CANCELLED'));

-- =============================================================================
-- 2. incidents.priority_code (Doc04 §3.2 priority enum)
-- =============================================================================
ALTER TABLE "incidents"
  DROP CONSTRAINT IF EXISTS "incidents_priority_code_check";

ALTER TABLE "incidents"
  ADD CONSTRAINT "incidents_priority_code_check"
  CHECK ("priority_code" IS NULL OR "priority_code" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- =============================================================================
-- 3. incident_messages.message_type (Doc04 §5.5)
--
-- REPORTER — người báo sự cố (khi tạo incident).
-- STAFF    — kỹ thuật viên/manager phản hồi.
-- SYSTEM   — system event (audit/state change logged như một message).
-- AI       — gợi ý từ AI provider (output snapshot).
-- =============================================================================
ALTER TABLE "incident_messages"
  DROP CONSTRAINT IF EXISTS "incident_messages_message_type_check";

ALTER TABLE "incident_messages"
  ADD CONSTRAINT "incident_messages_message_type_check"
  CHECK ("message_type" IN ('REPORTER', 'STAFF', 'SYSTEM', 'AI'));

-- =============================================================================
-- 4. ai_requests.task_type (Doc05 §10.1)
-- =============================================================================
ALTER TABLE "ai_requests"
  DROP CONSTRAINT IF EXISTS "ai_requests_task_type_check";

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_task_type_check"
  CHECK ("task_type" IN ('INCIDENT_TRIAGE', 'ASSET_SUMMARY', 'OTHER'));

-- =============================================================================
-- 5. ai_requests.status (Doc04 §5.8)
--
-- QUEUED     — đã lưu vào DB + push BullMQ, chờ worker.
-- RUNNING    — worker đang gọi provider.
-- SUCCEEDED  — provider trả kết quả hợp lệ → output_payload đã snapshot.
-- FAILED     — provider lỗi (network/auth/...), không retry được nữa.
-- TIMED_OUT  — vượt timeout (system_settings.key='ai.timeout_ms', mặc định 45000).
-- =============================================================================
ALTER TABLE "ai_requests"
  DROP CONSTRAINT IF EXISTS "ai_requests_status_check";

ALTER TABLE "ai_requests"
  ADD CONSTRAINT "ai_requests_status_check"
  CHECK ("status" IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT'));

-- =============================================================================
-- 6. Doc comments
-- =============================================================================
COMMENT ON CONSTRAINT "incidents_status_check" ON "incidents" IS
  'Doc04 §3.2: status enum. State machine ở @equipcare/backend-core/incident.machine.ts. CLOSED/CANCELLED có timestamp tương ứng (closed_at/cancelled_at).';

COMMENT ON CONSTRAINT "incident_messages_message_type_check" ON "incident_messages" IS
  'Doc04 §5.5: REPORTER (người báo), STAFF (KT/Manager), SYSTEM (state event), AI (gợi ý).';

COMMENT ON CONSTRAINT "ai_requests_status_check" ON "ai_requests" IS
  'Doc04 §5.8: QUEUED→RUNNING→SUCCEEDED|FAILED|TIMED_OUT. Worker xử lý retry/backoff qua system_settings.ai.*.';

COMMENT ON CONSTRAINT "ai_requests_task_type_check" ON "ai_requests" IS
  'Doc05 §10.1: 3 task types. INCIDENT_TRIAGE (FR-AI-01), ASSET_SUMMARY (FR-AI-02), OTHER (mở rộng).';
