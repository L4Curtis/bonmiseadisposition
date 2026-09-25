import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { isItRole } from '../../common/roles';
import { AuthUser } from '../auth-user.interface';

/** Chemin du fichier du cachet de la filiale : réservé à l'IT. */
const STAMP_KEY = 'stampPath';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * Copie de `value` sans aucune clé `stampPath`, à toutes les profondeurs. Seuls
 * les objets simples et les tableaux sont parcourus (dates, Buffer, décimaux
 * Prisma… sont repris tels quels). L'original n'est jamais modifié, et il est
 * renvoyé tel quel quand il n'y a rien à retirer.
 */
export function withoutFilialeStamp(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items = value.map(withoutFilialeStamp);
    return items.every((item, i) => item === value[i]) ? value : items;
  }
  if (!isPlainObject(value)) return value;

  let changed = STAMP_KEY in value;
  const entries = Object.entries(value)
    .filter(([key]) => key !== STAMP_KEY)
    .map(([key, child]) => {
      const cleaned = withoutFilialeStamp(child);
      if (cleaned !== child) changed = true;
      return [key, cleaned] as const;
    });
  return changed ? Object.fromEntries(entries) : value;
}

/**
 * Le cachet de la filiale (image apposée sur les PDF) ne quitte jamais le
 * serveur vers un collaborateur, ni vers la direction : leurs réponses sont
 * expurgées de tout `stampPath`, où qu'il se trouve. Plusieurs requêtes (fiche
 * d'un bon, « Mes bons », page de signature) chargent en effet la filiale
 * complète, dont la génération des PDF a besoin.
 *
 * Enregistré globalement par AuthModule (APP_INTERCEPTOR) : une nouvelle route
 * ouverte aux collaborateurs est couverte sans rien avoir à déclarer. Les
 * réponses envoyées à l'IT (admin, technicien) passent sans être parcourues.
 */
@Injectable()
export class FilialeStampRedactionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const { user } = context.switchToHttp().getRequest<{ user?: Pick<AuthUser, 'role'> }>();
    if (user && isItRole(user.role)) return next.handle();
    return next.handle().pipe(map(withoutFilialeStamp));
  }
}
