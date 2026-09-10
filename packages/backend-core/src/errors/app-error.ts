/**
 * AppError — domain error chuẩn (Doc02 §7).
 * HTTP layer ở apps/api sẽ map AppError.code → HTTP status.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status: number = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  static unauthorized(message = 'Unauthorized', details?: Record<string, unknown>): AppError {
    return new AppError('UNAUTHORIZED', message, 401, details);
  }

  static forbidden(message = 'Forbidden', details?: Record<string, unknown>): AppError {
    return new AppError('FORBIDDEN', message, 403, details);
  }

  static notFound(message = 'Not found', details?: Record<string, unknown>): AppError {
    return new AppError('NOT_FOUND', message, 404, details);
  }

  static conflict(message = 'Conflict', details?: Record<string, unknown>): AppError {
    return new AppError('CONFLICT', message, 409, details);
  }

  static unprocessable(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ): AppError {
    return new AppError(code, message, 422, details);
  }
}
