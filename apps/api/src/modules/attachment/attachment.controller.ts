import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AppError } from '@equipcare/backend-core';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AttachmentService } from './attachment.service.js';
import { LinkAttachmentDto } from './dto/attachment.dto.js';
import type { AuthenticatedUser } from '../../common/types/auth-user.type.js';

/**
 * AttachmentController — M3 (Doc04 §5.6, plan §12.2 M3).
 *
 * Routes:
 *   POST  /files             multipart upload → STAGED
 *   GET   /files/:id         thông tin file + link
 *   POST  /files/:id/link    link STAGED → 1 parent → READY
 *   GET   /files/:id/download  stream blob (MIME từ storage)
 *   DELETE /files/:id          unlink (soft)
 */
@ApiTags('attachment')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('files')
export class AttachmentController {
  constructor(private readonly attachments: AttachmentService) {}

  @Post()
  @Permissions('attachment:upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 30 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload file → STAGED (FR-ATTACHMENT-01)' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw AppError.unprocessable(
        'ATTACHMENT_FILE_REQUIRED',
        'Cần gửi field "file" trong multipart',
      );
    }
    return this.attachments.upload(file, actor.sub);
  }

  @Get(':id')
  @Permissions('attachment:read')
  @ApiOperation({ summary: 'Chi tiết file + link info (nếu READY)' })
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.attachments.getInfo(id);
  }

  @Post(':id/link')
  @Permissions('attachment:upload')
  @ApiOperation({ summary: 'Link file STAGED → 1 parent → READY (in tx)' })
  link(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: LinkAttachmentDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.attachments.link(id, dto, actor.sub);
  }

  @Get(':id/download')
  @Permissions('attachment:read')
  @ApiOperation({ summary: 'Download blob (set Content-Type theo MIME)' })
  async download(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: false }) res: Response,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const isAdmin = (actor.permissions ?? []).includes('iam:role:manage');
    const { buffer, mime, originalName } = await this.attachments.download(id, actor.sub, isAdmin);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', buffer.length.toString());
    // RFC 5987 cho filename có UTF-8 (tiếng Việt).
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${originalName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(originalName)}`,
    );
    res.end(buffer);
  }

  @Delete(':id')
  @Permissions('attachment:upload')
  @ApiOperation({ summary: 'Unlink file (soft delete — giữ audit trail)' })
  async unlink(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    await this.attachments.unlink(id, actor.sub);
    return { ok: true };
  }
}
