import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { buildErrorResponse } from './error-body';

/**
 * Filtre global : toute exception levée dans NestJS (service, garde, pipe de
 * validation, limiteur de débit, base de données) repart sous la forme unique
 * `{ statusCode, code, message, details? }` (voir `error-body.ts`).
 * En production, aucune pile d'appels ni détail interne n'est renvoyé : ils
 * vont au journal du serveur.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body, log } = buildErrorResponse(exception, { method: request.method, url: request.url });
    if (log?.level === 'error') this.logger.error(log.text, log.stack);
    else if (log?.level === 'warn') this.logger.warn(log.text);

    response.status(status).json(body);
  }
}
