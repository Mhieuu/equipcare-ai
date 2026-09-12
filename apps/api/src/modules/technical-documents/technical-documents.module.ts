import { Module } from '@nestjs/common';
import { TechnicalDocumentController } from './technical-documents.controller.js';
import { TechnicalDocumentService } from './technical-documents.service.js';

/**
 * TechnicalDocumentModule — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Workflow:
 *  - CRUD metadata + version + per-doc RBAC.
 *  - Kết nối với AttachmentModule (client upload file → STAGED → truyền fileId
 *    tới /technical-documents/:id/versions để bind vào version).
 */
@Module({
  controllers: [TechnicalDocumentController],
  providers: [TechnicalDocumentService],
  exports: [TechnicalDocumentService],
})
export class TechnicalDocumentModule {}
