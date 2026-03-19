import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';

async function bootstrap() {
  // Ensure upload directory exists
  mkdirSync(join(process.cwd(), 'data', 'uploads'), { recursive: true });

  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  await app.listen(4000);
  console.log('Backend running on http://localhost:4000');

  // Ensure default local admin exists
  const authService = app.get(AuthService);
  await authService.ensureDefaultAdmin();
}

bootstrap();
