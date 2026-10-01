import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { AppException } from '../app-exception';
import { buildErrorResponse } from '../error-body';
import { DEFAULT_ERROR_MESSAGES } from '../error-codes';

const REQUEST = { method: 'GET', url: '/api/bons' };

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('détail interne', { code, clientVersion: '5.0.0' });
}

describe('buildErrorResponse — forme unique { statusCode, code, message, details? }', () => {
  it('AppException : code, message et détails tels que levés', () => {
    const error = new AppException('serial_conflicts', 'Numéros déjà prêtés.', HttpStatus.CONFLICT, {
      conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }],
    });

    expect(buildErrorResponse(error, REQUEST)).toMatchObject({
      status: 409,
      body: {
        statusCode: 409,
        code: 'serial_conflicts',
        message: 'Numéros déjà prêtés.',
        details: { conflicts: [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }] },
      },
    });
  });

  it('AppException sans détails : pas de clé details', () => {
    const { body } = buildErrorResponse(new AppException('not_found', 'Bon introuvable.', 404), REQUEST);
    expect(body).toEqual({ statusCode: 404, code: 'not_found', message: 'Bon introuvable.' });
  });

  it('exception Nest avec un message français : message conservé, code déduit du statut', () => {
    expect(buildErrorResponse(new NotFoundException('Bon introuvable'), REQUEST).body).toEqual({
      statusCode: 404,
      code: 'not_found',
      message: 'Bon introuvable',
    });
    expect(buildErrorResponse(new BadRequestException('Date invalide'), REQUEST).body.code).toBe('bad_request');
    expect(buildErrorResponse(new ConflictException('Déjà modifié'), REQUEST).body.code).toBe('conflict');
    expect(buildErrorResponse(new ForbiddenException('Accès refusé à ce bon'), REQUEST).body.code).toBe('forbidden');
  });

  it('exception Nest sans message (texte anglais par défaut) : message français', () => {
    const unauthorized = buildErrorResponse(new UnauthorizedException(), REQUEST).body;
    expect(unauthorized).toEqual({
      statusCode: 401,
      code: 'unauthorized',
      message: 'Session absente ou expirée : reconnectez-vous.',
    });
    expect(buildErrorResponse(new ForbiddenException(), REQUEST).body.message).toBe(
      'Vous n’avez pas les droits nécessaires pour cette action.',
    );
    expect(buildErrorResponse(new NotFoundException(), REQUEST).body.message).toBe('Élément introuvable.');
  });

  it('garde qui refuse sans message (« Forbidden resource ») : message français', () => {
    const body = buildErrorResponse(new ForbiddenException('Forbidden resource'), REQUEST).body;
    expect(body.message).toBe('Vous n’avez pas les droits nécessaires pour cette action.');
  });

  it('route inconnue (« Cannot GET /api/… ») : route_not_found, sans recopier l’adresse', () => {
    const body = buildErrorResponse(new NotFoundException('Cannot GET /api/inconnue'), REQUEST).body;
    expect(body).toEqual({ statusCode: 404, code: 'route_not_found', message: 'Adresse d’API inconnue.' });
  });

  it('limiteur de débit : 429 too_many_requests, message français', () => {
    const body = buildErrorResponse(new ThrottlerException(), REQUEST).body;
    expect(body).toEqual({
      statusCode: 429,
      code: 'too_many_requests',
      message: 'Trop de requêtes, réessayez dans une minute.',
    });
  });

  it('message en tableau (validation manuelle) : chaîne jointe, champs dans details', () => {
    const body = buildErrorResponse(new BadRequestException(['page must be an integer', 'limit invalide']), REQUEST).body;
    expect(body).toEqual({
      statusCode: 400,
      code: 'validation_failed',
      message: 'page must be an integer — limit invalide',
      details: {
        errors: [
          { field: null, messages: ['page must be an integer'] },
          { field: null, messages: ['limit invalide'] },
        ],
      },
    });
  });

  it('ancien corps à code métier sans message : code repris, message du statut, données dans details ET à la racine', () => {
    const conflicts = [{ serialNumber: 'SN-1', bonReference: 'BON-2026-0001' }];
    const { status, body } = buildErrorResponse(new ConflictException({ code: 'code_metier_fictif', conflicts }), REQUEST);

    expect(status).toBe(409);
    expect(body).toEqual({
      statusCode: 409,
      code: 'code_metier_fictif',
      message: DEFAULT_ERROR_MESSAGES.conflict,
      details: { conflicts },
      conflicts,
    });
  });

  it('ancien corps à code avec son propre message : message conservé', () => {
    const body = buildErrorResponse(
      new ConflictException({ code: 'token_recent', message: 'Lien récent.', sentAt: '2026-10-01T08:00:00.000Z' }),
      REQUEST,
    ).body;
    expect(body).toMatchObject({ code: 'token_recent', message: 'Lien récent.', sentAt: '2026-10-01T08:00:00.000Z' });
  });

  it('ancien corps sans code mais avec des données (sonde de santé) : code du statut, données conservées', () => {
    const body = buildErrorResponse(
      new HttpException({ status: 'error', database: 'unreachable' }, HttpStatus.SERVICE_UNAVAILABLE),
      REQUEST,
    ).body;
    expect(body).toEqual({
      statusCode: 503,
      code: 'service_unavailable',
      message: 'Service temporairement indisponible, réessayez.',
      details: { status: 'error', database: 'unreachable' },
      status: 'error',
      database: 'unreachable',
    });
  });

  it('un code mal formé n’est jamais renvoyé tel quel', () => {
    const body = buildErrorResponse(new BadRequestException({ code: 'Pas Un Code', message: 'Refusé' }), REQUEST).body;
    expect(body.code).toBe('bad_request');
  });

  it('les clés réservées du corps d’origine (statusCode, error) ne passent pas dans details', () => {
    const body = buildErrorResponse(new ServiceUnavailableException('Base indisponible'), REQUEST).body;
    expect(body).toEqual({ statusCode: 503, code: 'service_unavailable', message: 'Base indisponible' });
  });

  it.each([
    ['P2002', 409, 'already_exists', 'Conflit : valeur déjà utilisée'],
    ['P2003', 400, 'invalid_reference', 'Référence invalide'],
    ['P2025', 404, 'not_found', 'Enregistrement introuvable'],
    ['P2028', 503, 'service_unavailable', 'Service temporairement indisponible, réessayez'],
  ])('erreur Prisma %s traduite en %i %s, sans détail interne', (code, status, apiCode, message) => {
    const result = buildErrorResponse(prismaError(code), REQUEST);
    expect(result.status).toBe(status);
    expect(result.body).toEqual({ statusCode: status, code: apiCode, message });
    expect(result.log).toEqual({ level: 'warn', text: expect.stringContaining(`Prisma ${code}`) });
  });

  it('erreur Prisma non répertoriée : 500 générique', () => {
    expect(buildErrorResponse(prismaError('P2034'), REQUEST).body.code).toBe('internal_error');
  });

  it('erreur inattendue en production : 500, message générique, rien d’interne', () => {
    const result = buildErrorResponse(new Error('connexion refusée 10.0.0.5'), REQUEST, { production: true });
    expect(result.body).toEqual({ statusCode: 500, code: 'internal_error', message: 'Erreur interne du serveur.' });
    expect(result.log?.level).toBe('error');
  });

  it('erreur inattendue hors production : le texte d’origine dans details.debug', () => {
    const result = buildErrorResponse(new Error('boum'), REQUEST, { production: false });
    expect(result.body).toEqual({
      statusCode: 500,
      code: 'internal_error',
      message: 'Erreur interne du serveur.',
      details: { debug: 'boum' },
    });
  });

  it('valeur levée qui n’est pas une Error : 500 quand même', () => {
    expect(buildErrorResponse('chaîne levée', REQUEST, { production: true }).status).toBe(500);
  });

  it('une erreur HTTP ordinaire n’est pas journalisée', () => {
    expect(buildErrorResponse(new NotFoundException('Bon introuvable'), REQUEST).log).toBeUndefined();
  });

  it('une erreur HTTP 5xx levée volontairement est journalisée, sans pile', () => {
    const result = buildErrorResponse(new ServiceUnavailableException('Base indisponible'), REQUEST);
    expect(result.body.message).toBe('Base indisponible');
    expect(result.log).toEqual({ level: 'warn', text: 'Erreur 503 sur GET /api/bons : Base indisponible' });
  });

  it('NODE_ENV absent ou inconnu : traité comme la production, aucun détail interne', () => {
    const previous = process.env.NODE_ENV;
    try {
      for (const value of [undefined, 'prod', 'staging']) {
        if (value === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = value;
        expect(buildErrorResponse(new Error('requête SQL interne'), REQUEST).body).not.toHaveProperty('details');
      }
      process.env.NODE_ENV = 'development';
      expect(buildErrorResponse(new Error('boum'), REQUEST).body.details).toEqual({ debug: 'boum' });
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('messages anglais de l’envoi de fichiers et des pipes de paramètre : phrase française', () => {
    expect(buildErrorResponse(new HttpException('File too large', 413), REQUEST).body).toEqual({
      statusCode: 413,
      code: 'payload_too_large',
      message: 'Contenu trop volumineux.',
    });
    expect(buildErrorResponse(new BadRequestException('Unexpected field'), REQUEST).body.message).toBe('Requête invalide.');
    expect(
      buildErrorResponse(new BadRequestException('Validation failed (uuid is expected)'), REQUEST).body.message,
    ).toBe('Requête invalide.');
  });
});

describe('AppException', () => {
  it('statut 400 par défaut', () => {
    const error = new AppException('bad_request', 'Refusé.');
    expect(error.getStatus()).toBe(400);
    expect(error.code).toBe('bad_request');
  });

  it('refuse un code qui n’est pas en snake_case (erreur de programmation)', () => {
    expect(() => new AppException('Serial-Conflicts', 'x', 409)).toThrow('snake_case');
  });

  it('refuse un message vide : le front affiche toujours `message`', () => {
    expect(() => new AppException('conflict', '  ', 409)).toThrow('message');
  });

  it('refuse un statut qui n’est pas une erreur', () => {
    expect(() => new AppException('ok', 'Tout va bien', 200)).toThrow('4xx ou 5xx');
  });
});
