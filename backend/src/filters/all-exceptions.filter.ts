import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

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
