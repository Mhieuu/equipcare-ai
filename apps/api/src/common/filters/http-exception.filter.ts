import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@equipcare/shared';
import { AppError } from '@equipcare/backend-core';
import { Prisma } from '@prisma/client';

/**
 * HttpExceptionFilter — global filter map mọi error ra response chuẩn (Doc02 §7).
 *
 * Áp dụng cho:
 * - AppError (domain error từ backend-core) → giữ nguyên status + code + details.
 * - Prisma error (P2002 unique, P2025 not found, P2003 FK) → map sang HTTP phù hợp.
 * - HttpException (Nest built-in) → giữ status + message.
 * - Mọi error khác → 500 INTERNAL_ERROR (log đầy đủ stack, không leak cho client).
 *
 * Response shape: ApiErrorBody { code, message, details?, traceId? }
 * - traceId = correlation id (sẽ tích hợp AsyncLocalStorage ở bước sau; tạm thời
 *   dùng X-Request-Id header nếu có, fallback uuid-like ngẫu nhiên).
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const { status, body } = this.toResponse(exception, req);

    // Log error server-side với đầy đủ context; không log 4xx như spam.
    if (status >= 500) {
      this.logger.error(
        `[${body.traceId}] ${req.method} ${req.originalUrl} → ${status} ${body.code}: ${body.message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${body.traceId}] ${req.method} ${req.originalUrl} → ${status} ${body.code}: ${body.message}`,
      );
    }

    res.status(status).json(body);
  }

  private toResponse(exception: unknown, req: Request): { status: number; body: ApiErrorBody } {
    const traceId =
      (req.headers['x-request-id'] as string | undefined) ??
      this.randomTraceId();

    // 1) AppError — domain error (Doc02 §7 chuẩn).
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        body: {
          code: exception.code,
          message: exception.message,
          details: exception.details,
          traceId,
        },
      };
    }

    // 2) Prisma errors — map sang HTTP chuẩn.
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return {
        status: this.prismaToStatus(exception),
        body: {
          code: this.prismaToCode(exception),
          message: this.prismaToMessage(exception),
          details: { target: exception.meta?.target, modelName: exception.meta?.modelName },
          traceId,
        },
      };
    }

    // 3) HttpException — Nest built-in (BadRequestException, UnauthorizedException, ...).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resp = exception.getResponse();
      const message =
        typeof resp === 'string'
          ? resp
          : ((resp as { message?: string }).message ?? exception.message);
      const code =
        typeof resp === 'object' && resp && (resp as { error?: string }).error
          ? (resp as { error?: string }).error!.toUpperCase().replace(/\s+/g, '_')
          : `HTTP_${status}`;
      return {
        status,
        body: {
          code,
          message: Array.isArray(message) ? message.join('; ') : String(message),
          traceId,
        },
      };
    }

    // 4) Unknown — 500, không leak chi tiết.
    const fallback: ApiErrorBody = {
      code: 'INTERNAL_ERROR',
      message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại hoặc liên hệ quản trị.',
      traceId,
    };
    return { status: HttpStatus.INTERNAL_SERVER_ERROR, body: fallback };
  }

  private prismaToStatus(err: Prisma.PrismaClientKnownRequestError): number {
    switch (err.code) {
      case 'P2002': // unique violation
        return HttpStatus.CONFLICT;
      case 'P2003': // FK violation
        return HttpStatus.CONFLICT;
      case 'P2025': // record not found
        return HttpStatus.NOT_FOUND;
      case 'P2000': // value too long
        return HttpStatus.BAD_REQUEST;
      case 'P2001': // record not found (where)
        return HttpStatus.NOT_FOUND;
      case 'P2004': // constraint failed
        return HttpStatus.UNPROCESSABLE_ENTITY;
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private prismaToCode(err: Prisma.PrismaClientKnownRequestError): string {
    switch (err.code) {
      case 'P2002':
        return 'DB_UNIQUE_VIOLATION';
      case 'P2003':
        return 'DB_FK_VIOLATION';
      case 'P2025':
        return 'DB_RECORD_NOT_FOUND';
      case 'P2000':
        return 'DB_VALUE_TOO_LONG';
      case 'P2001':
        return 'DB_RECORD_NOT_FOUND';
      case 'P2004':
        return 'DB_CONSTRAINT_FAILED';
      default:
        return 'DB_ERROR';
    }
  }

  private prismaToMessage(err: Prisma.PrismaClientKnownRequestError): string {
    switch (err.code) {
      case 'P2002':
        return 'Giá trị đã tồn tại (trùng khóa tự nhiên).';
      case 'P2003':
        return 'Vi phạm khóa ngoại.';
      case 'P2025':
        return 'Bản ghi không tồn tại.';
      case 'P2000':
        return 'Giá trị vượt quá độ dài cho phép.';
      case 'P2001':
        return 'Không tìm thấy bản ghi thỏa điều kiện.';
      case 'P2004':
        return 'Vi phạm ràng buộc dữ liệu.';
      default:
        return 'Lỗi cơ sở dữ liệu.';
    }
  }

  private randomTraceId(): string {
    // Lightweight id (không cần UUID strict) — đủ để debug correlation.
    return (
      Date.now().toString(36) +
      Math.random().toString(36).slice(2, 10)
    );
  }
}
