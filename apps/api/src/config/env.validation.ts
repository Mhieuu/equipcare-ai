import * as Joi from 'joi';

/**
 * Joi schema validate biến môi trường khi NestJS bootstrap.
 *
 * Quy tắc (Doc02 §NFR-SEC + plan §13):
 * - Bắt buộc `DATABASE_URL` đúng dạng Postgres connection string.
 * - `JWT_ACCESS_SECRET` >= 32 bytes (Doc02 §NFR-SEC-01).
 * - `AI_PROVIDER` chỉ nhận 'mock' | 'openai' (Doc05 §10.1).
 * - `NODE_ENV` ∈ development | test | production.
 * - `API_PORT` mặc định 3001.
 *
 * Lỗi validate fail → process exit 1 với message rõ ràng (không để app khởi
 * động sai cấu hình — đặc biệt là secret thiếu).
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(3001),

  // ---- Database ----
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),

  // ---- Redis (BullMQ + cache) — required ở runtime, không fail bootstrap nếu thiếu
  // (chỉ fail khi feature thực sự dùng).
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).optional(),

  // ---- Auth ----
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  REFRESH_TOKEN_PEPPER: Joi.string().min(32).required(),
  ACCESS_TOKEN_TTL: Joi.number().integer().positive().default(900), // 15 phút

  // ---- Object storage ----
  S3_ENDPOINT: Joi.string().uri().optional(),
  S3_REGION: Joi.string().default('us-east-1'),
  S3_BUCKET: Joi.string().default('equipcare-files'),
  S3_ACCESS_KEY: Joi.string().optional(),
  S3_SECRET_KEY: Joi.string().optional(),

  // ---- AI ----
  AI_PROVIDER: Joi.string().valid('mock', 'openai').default('mock'),
  AI_REQUEST_TIMEOUT_MS: Joi.number().integer().positive().default(45000),
  OPENAI_API_KEY: Joi.string().allow('').optional(),
  OPENAI_MODEL: Joi.string().default('gpt-4o-2024-08-06'),
  AI_STORE_RESPONSES: Joi.boolean().default(false),

  // ---- Logging ----
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly')
    .default('info'),
});
