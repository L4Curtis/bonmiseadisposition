import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import * as cookieParser from 'cookie-parser';
import * as express from 'express';
import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';

// CSRF mitigation: require X-Requested-With header on state-changing requests.
// Exemptions: OAuth callback (uses state param) and local-login (no auth cookie yet).
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/callback', '/api/auth/local-login']);
function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!stateChangingMethods.includes(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.has(req.path)) return next();
  const requestedWith = req.headers['x-requested-with'];
  if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'CSRF protection: header X-Requested-With manquant' });
  }
  return next();
}

const logger = new Logger('Bootstrap');

async function bootstrap() {
  // Ensure upload directory exists
  mkdirSync(join(process.cwd(), 'data', 'uploads'), { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Limite de taille des requêtes JSON (signatures base64 incluses)
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
      },
    }),
  );
  app.use(csrfMiddleware);

  const isProduction = process.env.NODE_ENV === 'production';
  const frontendUrl = process.env.FRONTEND_URL;
  if (isProduction && !frontendUrl) {
    throw new Error('FRONTEND_URL est requis en production (ex: https://bon.curtislm.xyz)');
  }
  app.enableCors({
    origin: frontendUrl || 'http://localhost:5173',
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();

  await app.listen(4000);
  logger.log('Backend running on http://localhost:4000');

  // Ensure default local admin exists
  const authService = app.get(AuthService);
  await authService.ensureDefaultAdmin();
}

bootstrap();
