import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ---- Security headers (Doc02 §NFR-SEC) ----
  app.use(helmet());

  // ---- Body parser limit (Doc02 §NFR-SEC-04 — body ≤ 5 MB, file riêng /files) ----
  // Mặc định express là 100kb; nâng lên 5 MB cho JSON, raw/URL giữ mặc định.
  // (M3 sẽ thêm Multipart riêng cho /files.)

  // ---- CORS allowlist (Doc02 §NFR-SEC-02) ----
  // Dev: mở cho localhost. Prod: đặt APP_URL trong env, chỉ origin đó truy cập.
  const allowedOrigins = process.env.APP_URL
    ? process.env.APP_URL.split(',').map((s) => s.trim())
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  // ---- Global validation (class-validator) ----
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip field không khai báo trong DTO
      forbidNonWhitelisted: true, // 400 nếu có field lạ
      transform: true, // auto-cast type (string param → number)
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // ---- Swagger / OpenAPI ----
  const swagger = new DocumentBuilder()
    .setTitle('EquipCare AI API')
    .setDescription('Equipment maintenance & incident management')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', name: 'X-Request-Id', in: 'header' }, 'request-id')
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, doc);

  // ---- Graceful shutdown ----
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.info(`[api] listening on :${port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`);
}

bootstrap().catch((err) => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
