/**
 * Client HTTP des tests de contrat : de vraies requêtes (supertest) envoyées à
 * l'application montée, avec ce que le navigateur envoie réellement.
 *  - `X-Requested-With: XMLHttpRequest`, posé par `frontend/src/lib/api.ts`
 *    sur chaque appel (sans lui, la protection CSRF répond 403) ;
 *  - le cookie de session `access_token` de la personne qui appelle, émis par
 *    le vrai AuthService (même signature, même contenu qu'après connexion) ;
 *  - une adresse client (`X-Forwarded-For`) différente à chaque requête : le
 *    limiteur de débit reste actif, mais ne bloque pas une suite qui enchaîne
 *    des centaines d'appels depuis la même machine.
 */
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../../../src/auth/auth.service';
import type { UserRole } from '../../../src/contracts/common';

/** Les comptes du jeu de données qui appellent l'API. */
export type Persona = 'admin' | 'technician' | 'direction' | 'collaborator' | 'otherCollaborator';
export type Caller = Persona | 'anonymous';

export const PERSONA_ROLES: Readonly<Record<Persona, UserRole>> = {
  admin: 'admin',
  technician: 'technician',
  direction: 'direction',
  collaborator: 'collaborator',
  otherCollaborator: 'collaborator',
};

/** Une personne par rôle, pour les vérifications d'accès. */
export const ONE_PERSONA_PER_ROLE: readonly Persona[] = ['admin', 'technician', 'direction', 'collaborator'];

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface SessionUser {
  id: string;
  email: string | null;
  role: UserRole;
}

let requestCounter = 0;

function nextClientIp(): string {
  requestCounter += 1;
  return `10.${(requestCounter >> 16) & 255}.${(requestCounter >> 8) & 255}.${requestCounter & 255}`;
}

export class ContractHttp {
  private constructor(
    private readonly app: INestApplication,
    private readonly cookies: Readonly<Record<Persona, string>>,
  ) {}

  /** Ouvre une session par personne, comme le ferait la connexion. */
  static async create(app: INestApplication, users: Readonly<Record<Persona, SessionUser>>): Promise<ContractHttp> {
    const auth = app.get(AuthService);
    const personas = Object.keys(users) as Persona[];
    const cookies = await Promise.all(
      personas.map(async (persona) => {
        const { accessToken } = await auth.createTokensForUser(users[persona]);
        return [persona, `access_token=${accessToken}`] as const;
      }),
    );
    return new ContractHttp(app, Object.fromEntries(cookies) as Record<Persona, string>);
  }

  /** Requête vers `/api${path}` au nom de `caller` (ou sans session). */
  send(method: HttpMethod, path: string, caller: Caller, body?: object): request.Test {
    const agent = request(this.app.getHttpServer());
    const test = agent[method](`/api${path}`)
      .set('X-Requested-With', 'XMLHttpRequest')
      .set('X-Forwarded-For', nextClientIp());
    const withSession = caller === 'anonymous' ? test : test.set('Cookie', this.cookies[caller]);
    return body === undefined ? withSession : withSession.send(body);
  }

  get(path: string, caller: Caller): request.Test {
    return this.send('get', path, caller);
  }

  post(path: string, caller: Caller, body: object = {}): request.Test {
    return this.send('post', path, caller, body);
  }

  put(path: string, caller: Caller, body: object = {}): request.Test {
    return this.send('put', path, caller, body);
  }

  patch(path: string, caller: Caller, body: object = {}): request.Test {
    return this.send('patch', path, caller, body);
  }

  delete(path: string, caller: Caller): request.Test {
    return this.send('delete', path, caller);
  }

  /** Requête brute, sans aucun en-tête ajouté (vérification de la protection CSRF). */
  raw(): ReturnType<typeof request> {
    return request(this.app.getHttpServer());
  }
}
