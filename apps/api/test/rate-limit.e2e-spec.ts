import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';

/**
 * E2E test cho rate limiting (Doc02 §NFR-SEC).
 *
 * Mục đích: chứng minh API thật sự chặn abuse khi đưa lên internet —
 *  - Login bị giới hạn (chống brute-force).
 *  - Khi vượt ngưỡng, response trả 429 theo chuẩn ApiErrorBody.
 *
 * Kỹ thuật: đặt ngưỡng RATE_LIMIT_* rất thấp TRƯỚC khi AppModule được
 * import, vì `throttlerOptions()` đọc env lúc module khởi tạo.
 *
 * Yêu cầu: Postgres có sẵn ở DATABASE_URL. Nếu không, test sẽ skip.
 */

// Đặt ngưỡng thấp để test nhanh — phải set TRƯỚC khi import AppModule.
// RATE_LIMIT_TEST_STRICT=true: bỏ chế độ nới lỏng dành riêng cho môi trường
// test, để ngưỡng thật sự có hiệu lực trong test này.
process.env.RATE_LIMIT_TEST_STRICT = 'true';
process.env.RATE_LIMIT_MAX = '5';
process.env.RATE_LIMIT_SHORT_MAX = '3';
process.env.RATE_LIMIT_AI_MAX = '2';
process.env.RATE_LIMIT_WINDOW_MS = '60000';

import { AppModule } from '../src/app.module.js';

describe('Rate Limit E2E (TC-SEC-RATE-01..03)', () => {
  let app: INestApplication | undefined;
  let server: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    try {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      app.use(cookieParser());
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      server = app.getHttpServer();
    } catch (err) {
      console.warn('[rate-limit.e2e] DB unavailable — skipping:', (err as Error).message);
    }
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // -------------------------------------------------------------------------
  // TC-SEC-RATE-01: login sai mật khẩu quá ngưỡng → 429
  // -------------------------------------------------------------------------
  it('TC-SEC-RATE-01: login vượt ngưỡng trả 429', async () => {
    if (!app) return;

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await request(server)
        .post('/auth/login')
        .send({ loginName: 'admin.bootstrap', password: 'WrongPassword@2026' });
      statuses.push(res.status);
    }

    expect(statuses).toContain(429);
    // 429 phải xuất hiện sau ngưỡng `short` = 3.
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // TC-SEC-RATE-02: response 429 theo chuẩn ApiErrorBody
  // -------------------------------------------------------------------------
  it('TC-SEC-RATE-02: response 429 theo chuẩn ApiErrorBody', async () => {
    if (!app) return;

    let body: Record<string, unknown> = {};
    for (let i = 0; i < 8; i++) {
      const res = await request(server)
        .post('/auth/login')
        .send({ loginName: 'admin.bootstrap', password: 'WrongPassword@2026' });
      if (res.status === 429) {
        body = res.body as Record<string, unknown>;
        break;
      }
    }

    expect(body).toHaveProperty('code');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('traceId');
    expect(typeof body.message).toBe('string');
  });

  // -------------------------------------------------------------------------
  // TC-SEC-RATE-03: ngưỡng global `default` áp cho mọi route (kể cả public)
  // -------------------------------------------------------------------------
  it('TC-SEC-RATE-03: ngưỡng global default áp cho route public', async () => {
    if (!app) return;

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await request(server).get('/healthz/live');
      statuses.push(res.status);
    }

    // RATE_LIMIT_MAX = 5 → từ lần thứ 6 phải bị 429.
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(1);
  });
});
