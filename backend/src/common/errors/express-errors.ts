/**
 * Erreurs produites AVANT NestJS, par les middlewares Express posés dans
 * `bootstrap/configure-app.ts` (protection CSRF, lecture du corps JSON) : le
 * filtre global ne les voit pas, elles reçoivent donc ici la même forme
 * `{ statusCode, code, message }`.
 */
import { NextFunction, Request, Response } from 'express';
import { plainErrorBody } from './error-body';

/** Envoie une erreur à la forme unique depuis un middleware Express. */
export function sendError(res: Response, status: number, code: string, message?: string): void {
  res.status(status).json(plainErrorBody(status, code, message));
}

interface BodyParserError {
  readonly type?: string;
  readonly status?: number;
}

function bodyParserError(err: unknown): BodyParserError | undefined {
  if (typeof err !== 'object' || err === null || !('type' in err)) return undefined;
  return err as BodyParserError;
}

/**
 * Gestionnaire d'erreurs Express (quatre paramètres), posé juste après la
 * lecture du corps : JSON illisible → 400 `invalid_json`, corps trop gros →
 * 413 `payload_too_large`. Toute autre erreur suit son cours.
 */
export function bodyParserErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  const parsed = bodyParserError(err);
  if (res.headersSent || !parsed) {
    next(err);
    return;
  }
  if (parsed.type === 'entity.parse.failed') {
    sendError(res, 400, 'invalid_json');
    return;
  }
  if (parsed.type === 'entity.too.large') {
    sendError(res, 413, 'payload_too_large', 'Contenu trop volumineux (2 Mo au plus).');
    return;
  }
  const status = parsed.status ?? 400;
  sendError(res, status >= 400 && status < 600 ? status : 400, status >= 500 ? 'internal_error' : 'bad_request');
}
