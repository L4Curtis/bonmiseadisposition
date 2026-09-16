import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/** Codes d'erreur Prisma mappés vers un statut HTTP + message utilisateur.
 *  Les autres codes Prisma restent un 500 générique (pas de détail en prod). */
const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Conflit : valeur déjà utilisée' },
  P2003: { status: HttpStatus.BAD_REQUEST, message: 'Référence invalide' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Enregistrement introuvable' },
  P2028: { status: HttpStatus.SERVICE_UNAVAILABLE, message: 'Service temporairement indisponible, réessayez' },
};

/**
 * Filtre global qui intercepte toutes les exceptions non gérées.
 * En production : masque les stack traces et détails internes.
 * En développement : laisse passer les détails pour le debug.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Erreur interne du serveur';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      // Conserver le message des erreurs HTTP connues (400, 401, 403, 404, 429...)
      message = typeof exResponse === 'string' ? exResponse : exResponse;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && PRISMA_ERROR_MAP[exception.code]) {
      // Références/contraintes DB non explicitement gérées par le service
      // (P2002 unicité, P2003 clé étrangère, P2025 enregistrement introuvable,
      // P2028 timeout de transaction) : mappées en erreur utilisateur au lieu
      // d'un 500 opaque. Le détail Prisma (nom de contrainte, table…) n'est
      // jamais renvoyé au client.
      const mapped = PRISMA_ERROR_MAP[exception.code];
      status = mapped.status;
      message = mapped.message;
      this.logger.warn(
        `Prisma ${exception.code} mappé en ${status} sur ${request.method} ${request.url}: ${exception.message}`,
      );
    } else {
      // Erreur inattendue — logger le détail côté serveur, renvoyer un message générique
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}: ${err.message}`,
        err.stack,
      );

      // En dev, on peut renvoyer le message réel pour faciliter le debug
      if (process.env.NODE_ENV !== 'production') {
        message = {
          statusCode: status,
          message: err.message,
          error: 'Internal Server Error',
        };
      }
    }

    response.status(status).json(
      typeof message === 'object' ? message : { statusCode: status, message },
    );
  }
}
