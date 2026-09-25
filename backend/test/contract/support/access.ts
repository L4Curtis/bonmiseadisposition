/**
 * Vérification des droits d'accès d'une route, telle que le front l'appelle :
 *  - 401 sans session (garde JWT) ;
 *  - 403 pour chaque rôle non autorisé (garde des rôles) ;
 *  - pour une lecture, ni 401 ni 403 pour chaque rôle autorisé.
 * Les écritures ne sont pas rejouées pour les rôles autorisés (elles
 * modifieraient le jeu de données) : leur succès est vérifié à part, avec la
 * forme de la réponse. Les gardes passent avant la validation du corps : un
 * refus ne dépend donc pas du corps envoyé.
 *
 * Les règles d'accès de chaque domaine sont regroupées en tête de son fichier
 * de contrat : c'est là qu'il faut les ajuster quand un droit change.
 */
import { expect } from 'vitest';
import type { UserRole } from '../../../src/contracts/common';
import { nestError } from './common-shapes';
import { ContractHttp, HttpMethod, ONE_PERSONA_PER_ROLE, PERSONA_ROLES } from './http';
import type { SeededData } from './seed';
import { expectShape } from './shape';

export interface AccessRule {
  /** Route telle que déclarée par le contrôleur, ex. « GET /bons/:id ». */
  route: string;
  method: HttpMethod;
  /** Chemin réel appelé (sans /api), paramètres remplacés par le jeu de données. */
  path: (data: SeededData) => string;
  /** Rôles qui franchissent les gardes. */
  allowed: readonly UserRole[];
}

export const IT: readonly UserRole[] = ['admin', 'technician'];
export const ADMIN: readonly UserRole[] = ['admin'];
export const IT_AND_DIRECTION: readonly UserRole[] = ['admin', 'technician', 'direction'];
export const EVERY_ROLE: readonly UserRole[] = ['admin', 'technician', 'direction', 'collaborator'];

/**
 * Déclare une règle. Sans `path`, le chemin appelé est celui de la route
 * (route sans paramètre) : `rule('GET /bons/stats', IT)`.
 */
export function rule(route: string, allowed: readonly UserRole[], path?: (data: SeededData) => string): AccessRule {
  const [verb, routePath] = route.split(' ');
  return {
    route,
    method: verb.toLowerCase() as HttpMethod,
    path: path ?? (() => routePath),
    allowed,
  };
}

/** Libellé lisible dans la sortie de Vitest. */
export function describeRule(access: AccessRule): string {
  return `${access.route} — autorisé à : ${access.allowed.join(', ')}`;
}

function emptyBodyFor(method: HttpMethod): object | undefined {
  return method === 'get' ? undefined : {};
}

export async function expectAccessRule(http: ContractHttp, data: SeededData, access: AccessRule): Promise<void> {
  const path = access.path(data);
  const anonymous = await http.send(access.method, path, 'anonymous', emptyBodyFor(access.method));
  expect(anonymous.status, `${access.route} sans session`).toBe(401);
  expectShape(anonymous.body, nestError);

  for (const persona of ONE_PERSONA_PER_ROLE) {
    const role = PERSONA_ROLES[persona];
    if (!access.allowed.includes(role)) {
      const denied = await http.send(access.method, path, persona, emptyBodyFor(access.method));
      expect(denied.status, `${access.route} pour le rôle ${role}`).toBe(403);
      expectShape(denied.body, nestError);
    } else if (access.method === 'get') {
      const granted = await http.get(path, persona);
      expect([401, 403], `${access.route} doit être accessible au rôle ${role} (reçu ${granted.status})`)
        .not.toContain(granted.status);
    }
  }
}
