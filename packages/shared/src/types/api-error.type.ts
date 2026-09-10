/**
 * API error shape trả về cho client (Doc02 §7).
 */
export interface ApiErrorBody {
  code: string;            // machine-readable code, vd 'AUTH_LOCKED', 'APR_EXCEEDED_LIMIT'
  message: string;         // human-readable message
  details?: Record<string, unknown>;
  traceId?: string;
}
