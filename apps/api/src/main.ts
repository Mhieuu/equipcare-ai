import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });

  const swagger = new DocumentBuilder()
    .setTitle('EquipCare AI API')
    .setDescription('Equipment maintenance & incident management')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, doc);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.info(`[api] listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error('[api] bootstrap failed', err);
  process.exit(1);
});
