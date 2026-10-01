/**
 * Configuration HTTP de l'application, appliquée à l'identique par le serveur
 * (main.ts) et par les tests de contrat HTTP (test/contract/support/app.ts) :
 * préfixe `/api`, adresse du client derrière le proxy, taille des corps JSON,
 * cookies, en-têtes de sécurité, protection CSRF, alias dépréciés, CORS,
 * filtre d'erreurs et validation. Tout réglage qui change une réponse vit ici,
 * et nulle part ailleurs : les tests vérifient ainsi ce que la production sert
 * réellement.
 *
 * Toute erreur, qu'elle naisse ici (CSRF, corps JSON illisible) ou dans
 * NestJS, repart sous la forme unique `{ statusCode, code, message, details? }`
 * (voir common/errors/ et docs/api-conventions.md).
 */
import { INestApplication, Logger, Type, ValidationPipe } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
// cookie-parser exporte la fonction elle-même (`module.exports = cookieParser`) :
// `import = require` la donne telle quelle, compilé par `nest build` comme
// exécuté en ESM par Vitest (même raison que pdfkit dans pdf/pdf.service.ts).
import cookieParser = require('cookie-parser');
import * as express from 'express';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { AllExceptionsFilter } from '../common/errors/all-exceptions.filter';
import { bodyParserErrorHandler, sendError } from '../common/errors/express-errors';
import { validationException } from '../common/errors/validation-exception';
import { TRUSTED_PROXY_HOPS } from '../common/http/client-ip';
import { AliasLogger, collectDeprecatedAliases, deprecatedAliasMiddleware } from '../common/http/deprecated-alias';
import { UPLOADS_DIR } from '../common/storage-paths';

export const API_PREFIX = 'api';

/** Seul le retour OAuth est exempté (il est protégé par son paramètre `state`).
 *  La connexion locale ne l'est pas : l'exempter ouvrait la porte à une
 *  connexion forcée depuis un autre site. */
const CSRF_EXEMPT_PATHS = new Set([`/${API_PREFIX}/auth/callback`]);
const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const CSRF_ERROR_MESSAGE =
  'Requête refusée par la protection contre les requêtes d’un autre site (en-tête X-Requested-With absent).';

/** Exige `X-Requested-With: XMLHttpRequest` (posé par le front sur chaque
 *  appel) pour toute requête qui modifie l'état : un formulaire d'un autre
 *  site ne peut pas poser cet en-tête. */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!STATE_CHANGING_METHODS.has(req.method) || CSRF_EXEMPT_PATHS.has(req.path)) {
    next();
    return;
  }
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    sendError(res, 403, 'csrf_rejected', CSRF_ERROR_MESSAGE);
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

/**
 * En-têtes de sécurité des réponses de l'API. Le nginx du frontend ne les
 * double pas sur `/api/` : il ne pose les siens que sur les pages et fichiers
 * qu'il sert lui-même (frontend/nginx.conf). Chaque réponse porte donc
 * chaque en-tête une seule fois. `X-Frame-Options: DENY` s'accorde avec
 * `frame-ancestors 'none'`.
 */
function securityHeaders() {
  return helmet({
    frameguard: { action: 'deny' },
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
  /** Dossier des logos et cachets, créé au démarrage (défaut : UPLOADS_DIR). */
  uploadsDir?: string;
  /** Journal des appels aux alias dépréciés (défaut : journal Nest). */
  aliasLogger?: AliasLogger;
}

/** Contrôleurs enregistrés dans l'application, tous modules confondus. */
function registeredControllers(app: INestApplication): Type[] {
  const modules = app.get(ModulesContainer);
  return [...modules.values()].flatMap((module) =>
    [...module.controllers.values()].flatMap((wrapper) => (wrapper.metatype ? [wrapper.metatype as Type] : [])),
  );
}

/**
 * Applique la configuration HTTP, avant `app.init()`. L'ordre compte : les
 * middlewares s'exécutent dans l'ordre où ils sont posés.
 */
export function configureApp(app: INestApplication, options: ConfigureAppOptions): void {
  // Logos et cachets des filiales (data/uploads sous le répertoire de travail).
  mkdirSync(options.uploadsDir ?? UPLOADS_DIR, { recursive: true });

  // Derrière la chaîne de proxys (reverse proxy → nginx du front → backend) :
  // on ne croit que TRUSTED_PROXY_HOPS proxy(s), pour que req.ip (limiteur de
  // débit, journal d'audit, signatures, via clientIp) soit l'adresse réelle
  // du client et non celle de nginx.
  app.getHttpAdapter().getInstance().set('trust proxy', TRUSTED_PROXY_HOPS);

  // 2 Mo : les signatures arrivent en base64 dans le corps JSON. Le corps
  // d'un formulaire (retour OAuth d'Entra ID) est lu ici aussi, avec les
  // options de NestJS : un corps illisible ou trop gros, quel que soit son
  // format, reçoit ainsi la forme d'erreur unique.
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(bodyParserErrorHandler);
  app.use(cookieParser());
  app.use(securityHeaders());
  // Alias dépréciés AVANT la protection CSRF : elle juge le verbe réellement
  // servi, même quand l'alias en change (ancien GET réécrit en POST).
  const aliases = collectDeprecatedAliases(registeredControllers(app), API_PREFIX);
  app.use(deprecatedAliasMiddleware(aliases, options.aliasLogger ?? new Logger('DeprecatedAlias')));
  app.use(csrfMiddleware);
  app.enableCors({ origin: options.corsOrigin, credentials: true });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: validationException }),
  );
  app.setGlobalPrefix(API_PREFIX);
}
