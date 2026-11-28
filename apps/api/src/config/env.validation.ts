import * as Joi from 'joi';

/**
 * Joi schema validate biến môi trường khi NestJS bootstrap.
 *
 * Quy tắc (Doc02 §NFR-SEC + plan §13):
 * - Bắt buộc `DATABASE_URL` đúng dạng Postgres connection string.
 * - `JWT_ACCESS_SECRET` >= 32 bytes (Doc02 §NFR-SEC-01).
 * - `AI_PROVIDER` chỉ nhận 'mock' | 'gemini' (Doc05 §10.1).
 * - `NODE_ENV` ∈ development | test | production.
 * - `API_PORT` mặc định 3001.
 *
 * Lỗi validate fail → process exit 1 với message rõ ràng (không để app khởi
 * động sai cấu hình — đặc biệt là secret thiếu).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  API_PORT: Joi.number().port().default(3001),

  // ---- Database ----
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  // ---- Auth ----
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_PEPPER: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL: Joi.number().integer().positive().default(900), // 15 phút

  // ---- AI ----
  AI_PROVIDER: Joi.string().valid('mock', 'gemini').default('mock'),
  AI_REQUEST_TIMEOUT_MS: Joi.number().integer().positive().default(45000),
  GEMINI_API_KEY: Joi.string().when('AI_PROVIDER', {
    is: 'gemini',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_MODEL: Joi.string().default('gemini-3.5-flash-lite'),
  AI_STORE_RESPONSES: Joi.boolean().default(false),

  // ---- Logging ----
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),

  // ---- Swagger ----
  // Mặc định /docs chỉ bật khi NODE_ENV !== production.
  // Đặt true để bật tạm thời khi debug trên môi trường thật.
  SWAGGER_ENABLED: Joi.boolean().default(false),

  // ---- Reverse proxy ----
  // Số lớp reverse proxy đứng trước API (1 = nginx/Caddy trực tiếp).
  // Bật để rate limit tính theo IP thật của client.
  TRUST_PROXY: Joi.number().integer().min(0).default(1),

  // ---- Rate limit (bảo vệ API khi đưa lên internet) ----
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().positive().default(60000),
  RATE_LIMIT_MAX: Joi.number().integer().positive().default(120),
  RATE_LIMIT_SHORT_MAX: Joi.number().integer().positive().default(20),
  RATE_LIMIT_AI_MAX: Joi.number().integer().positive().default(6),

  // ---- Scheduler ----
  SCHEDULER_INTERVAL_MS: Joi.number().integer().positive().default(60000),
});
