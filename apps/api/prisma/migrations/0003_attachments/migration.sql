-- Migration 0003_attachments — M3: Attachment STAGED→READY + technical documents
-- Nguồn: docs/db_schema.md Doc04 §5.6 + plan §12.2 M3
--
-- Thay đổi:
-- 1. CHECK constraint cho files.storage_state ∈ ('STAGED','READY','REJECTED')
--    (Doc04 §5.6: STAGED vừa upload, READY sau khi link tới 1 parent,
--     REJECTED khi magic bytes/MIME/size check fail).
-- 2. CHECK constraint cho attachment_links — ĐÚNG MỘT parent (Doc04 §5.6).
--    Doc04 nói "CHECK một parent" = tổng số parent (asset/incident/incident_message/
--    work_order/approval_revision) phải = 1. Dùng COALESCE để đếm NULL.
-- 3. CHECK constraint cho technical_documents.document_type — chuẩn hóa:
--    'MANUAL' | 'SCHEMATIC' | 'PROCEDURE' | 'OTHER' (Doc04 §5.6).

-- =============================================================================
-- 1. CHECK constraint cho files.storage_state
-- =============================================================================
ALTER TABLE "files"
  DROP CONSTRAINT IF EXISTS "files_storage_state_check";

ALTER TABLE "files"
  ADD CONSTRAINT "files_storage_state_check"
  CHECK ("storage_state" IN ('STAGED', 'READY', 'REJECTED'));

-- =============================================================================
-- 2. CHECK constraint cho attachment_links (đúng 1 parent)
--
--    Đếm số parent non-NULL; phải = 1.
--    Cách chuẩn Postgres: CASE WHEN ... THEN 1 ELSE 0 END (5 cột) sum.
--    Để dễ đọc dùng tổng 5 CASE (rõ ràng intent).
-- =============================================================================
ALTER TABLE "attachment_links"
  DROP CONSTRAINT IF EXISTS "attachment_links_one_parent_check";

ALTER TABLE "attachment_links"
  ADD CONSTRAINT "attachment_links_one_parent_check"
  CHECK (
    (
      (CASE WHEN "asset_id" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "incident_id" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "incident_message_id" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "work_order_id" IS NULL THEN 0 ELSE 1 END) +
      (CASE WHEN "approval_revision_id" IS NULL THEN 0 ELSE 1 END)
    ) = 1
  );

-- =============================================================================
-- 3. CHECK constraint cho technical_documents.document_type
-- =============================================================================
ALTER TABLE "technical_documents"
  DROP CONSTRAINT IF EXISTS "technical_documents_document_type_check";

ALTER TABLE "technical_documents"
  ADD CONSTRAINT "technical_documents_document_type_check"
  CHECK ("document_type" IN ('MANUAL', 'SCHEMATIC', 'PROCEDURE', 'OTHER'));

-- =============================================================================
-- 4. Comment rõ constraint cho team maintain
-- =============================================================================
COMMENT ON CONSTRAINT "files_storage_state_check" ON "files" IS
  'Doc04 §5.6: STAGED (vừa upload) → READY (sau khi link 1 parent) hoặc REJECTED (validation fail).';

COMMENT ON CONSTRAINT "attachment_links_one_parent_check" ON "attachment_links" IS
  'Doc04 §5.6: mỗi attachment link đúng 1 parent (asset/incident/incident_message/work_order/approval_revision).';

COMMENT ON CONSTRAINT "technical_documents_document_type_check" ON "technical_documents" IS
  'Doc04 §5.6: 4 loại tài liệu kỹ thuật chuẩn hóa.';
