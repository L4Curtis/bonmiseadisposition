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
// Exemption: OAuth callback only (uses state param). local-login is NOT exempt —
// the frontend already sends the header, and exempting it allowed login CSRF.
const CSRF_EXEMPT_PATHS = new Set(['/api/auth/callback']);
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

  // The cron package does not catch rejected promises from @Cron callbacks —
  // log them instead of letting the process die on unhandledRejection.
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason instanceof Error ? reason.stack : reason}`);
  });

  const app = await NestFactory.create(AppModule);

  // Behind the proxy chain (NPM → nginx frontend → backend): trust the first
  // proxy so req.ip (used by the throttler) is the real client IP, not the
  // nginx container address shared by every client.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

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
