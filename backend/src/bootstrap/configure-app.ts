/**
 * Configuration HTTP de l'application, appliquée à l'identique par le serveur
 * (main.ts) et par les tests de contrat HTTP (test/contract/support/app.ts) :
 * préfixe `/api`, adresse du client derrière le proxy, taille des corps JSON,
 * cookies, en-têtes de sécurité, protection CSRF, CORS, filtre d'erreurs et
 * validation. Tout réglage qui change une réponse vit ici, et nulle part
 * ailleurs : les tests vérifient ainsi ce que la production sert réellement.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
// cookie-parser exporte la fonction elle-même (`module.exports = cookieParser`) :
// `import = require` la donne telle quelle, compilé par `nest build` comme
// exécuté en ESM par Vitest (même raison que pdfkit dans pdf/pdf.service.ts).
import cookieParser = require('cookie-parser');
import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { AllExceptionsFilter } from '../filters/all-exceptions.filter';

export const API_PREFIX = 'api';

/** Seul le retour OAuth est exempté (il est protégé par son paramètre `state`).
 *  La connexion locale ne l'est pas : l'exempter ouvrait la porte à une
 *  connexion forcée depuis un autre site. */
const CSRF_EXEMPT_PATHS = new Set([`/${API_PREFIX}/auth/callback`]);
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_ERROR_MESSAGE = 'CSRF protection: header X-Requested-With manquant';

/** Exige `X-Requested-With: XMLHttpRequest` (posé par le front sur chaque
 *  appel) pour toute requête qui modifie l'état : un formulaire d'un autre
 *  site ne peut pas poser cet en-tête. */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    res.status(403).json({ message: CSRF_ERROR_MESSAGE });
    return;
  }
  next();
}

const DEV_FRONTEND_URL = 'http://localhost:5173';

/** Origine autorisée par CORS. En production, FRONTEND_URL est obligatoire :
 *  le serveur refuse de démarrer sans elle. */
export function resolveCorsOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const frontendUrl = env.FRONTEND_URL;
  if (env.NODE_ENV === 'production' && !frontendUrl) {
    throw new Error('FRONTEND_URL est requis en production (ex: https://bon.curtislm.xyz)');
  }
  return frontendUrl || DEV_FRONTEND_URL;
}

function securityHeaders() {
  return helmet({
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
    hsts: { maxAge: 31536000, includeSubDomains: true },
  });
}

export interface ConfigureAppOptions {
  /** Origine autorisée par CORS (voir `resolveCorsOrigin`). */
  corsOrigin: string;
}

/**
 * Applique la configuration HTTP, avant `app.init()`. L'ordre compte : les
 * middlewares s'exécutent dans l'ordre où ils sont posés.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  // Dossier des pièces jointes, relatif au répertoire de travail.
  mkdirSync(join(process.cwd(), 'data', 'uploads'), { recursive: true });

  // Derrière la chaîne de proxys (reverse proxy → nginx du front → backend) :
  // on ne croit que le premier proxy, pour que req.ip (limiteur de débit,
  // journal d'audit) soit l'adresse réelle du client et non celle de nginx.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // 2 Mo : les signatures arrivent en base64 dans le corps JSON.
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(securityHeaders());
  app.use(csrfMiddleware);
  app.enableCors({ origin: options.corsOrigin, credentials: true });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix(API_PREFIX);
}
