import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import * as path from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix('api', { exclude: ['health', 'uploads/(.*)'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Serve local uploads in dev so the mobile app can fetch them.
  if (String(process.env.ENV_DEV ?? 'true').toLowerCase() === 'true') {
    const uploadDir = path.resolve(process.env.LOCAL_UPLOAD_DIR ?? './uploads');
    app.useStaticAssets(uploadDir, { prefix: '/uploads/' });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const config = new DocumentBuilder()
    .setTitle('Warehouse Inventory API')
    .setDescription('OCR + AI parsing + Zoho sync for warehouse inventory')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  console.log(`API listening on http://localhost:${port}  (docs: /docs)`);
}

bootstrap();
