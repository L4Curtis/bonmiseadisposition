/**
 * Contrôle d'accès de TOUTES les routes de l'application (refus par défaut).
 *
 * Chaque route enregistrée dans AppModule doit déclarer qui peut l'appeler :
 *  - `@Public()` : ouverte sans session (connexion, SSO, santé) ;
 *  - `@Roles(...)` : réservée aux rôles listés, derrière JwtAuthGuard puis
 *    RolesGuard (sans ces deux gardes, un @Roles ne protégerait rien).
 * Une route qui n'a ni l'un ni l'autre est refusée par RolesGuard ; ce test
 * la signale avant qu'elle n'arrive en production.
 *
 * La table complète route → rôles est comparée au fichier
 * `__snapshots__/route-access.md`, versionné : tout changement de droits se voit
 * donc dans la revue de code. Après une modification VOULUE des droits :
 *   cd backend && npx vitest run src/auth/__tests__/route-access.spec.ts -u
 */
import { UserRole } from '@prisma/client';
import { AppModule } from '../../app.module';
import { ALL_ROLES } from '../decorators/roles.decorator';
import { inventoryRoutes, RouteAccess } from './helpers/route-inventory';

const routes = inventoryRoutes(AppModule);
const key = (r: RouteAccess): string => `${r.method} ${r.path}`;
const byKey = new Map(routes.map((r) => [key(r), r]));

const PUBLIC = 'public';
const TOUS = [...ALL_ROLES];
const IT = ['admin', 'technician'];
const IT_ET_DIRECTION = ['admin', 'technician', 'direction'];
const ADMIN = ['admin'];

function access(route: RouteAccess): string | readonly string[] {
  return route.isPublic ? PUBLIC : route.roles;
}

function accessLabel(route: RouteAccess): string {
  if (route.isPublic) return 'public (sans session)';
  const roles = new Set(route.roles);
  if (ALL_ROLES.every((r) => roles.has(r))) return 'tous les rôles connectés';
  return ALL_ROLES.filter((r) => roles.has(r)).join(', ');
}

function markdownTable(list: readonly RouteAccess[]): string {
  const lines = list.map((r) => `| ${r.method} | ${r.path} | ${accessLabel(r)} | ${r.handler} |`);
  return [
    '# Accès par route',
    '',
    'Généré par `backend/src/auth/__tests__/route-access.spec.ts` : ne pas modifier à la main.',
    '',
    '| Verbe | Route | Accès | Méthode |',
    '|---|---|---|---|',
    ...lines,
    '',
  ].join('\n');
}

describe('Accès de toutes les routes', () => {
  it('trouve bien les routes de l’application (garde-fou contre un parcours vide)', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(byKey.has('GET /api/bons')).toBe(true);
    expect(byKey.has('GET /api/health')).toBe(true);
  });

  it('chaque route déclare soit @Public, soit au moins un rôle — jamais les deux', () => {
    const fautives = routes
      .filter((r) => r.isPublic === (r.roles.length > 0))
      .map((r) => `${key(r)} (${r.handler})`);
    expect(fautives).toEqual([]);
  });

  it('chaque route à rôles passe par JwtAuthGuard puis RolesGuard', () => {
    const fautives = routes
      .filter((r) => !r.isPublic)
      .filter((r) => {
        const jwt = r.guards.indexOf('JwtAuthGuard');
        const roles = r.guards.indexOf('RolesGuard');
        return jwt === -1 || roles === -1 || jwt > roles;
      })
      .map((r) => `${key(r)} (${r.handler}) : [${r.guards.join(', ')}]`);
    expect(fautives).toEqual([]);
  });

  it('aucune route publique ne réclame de session (JwtAuthGuard contredirait @Public)', () => {
    const fautives = routes.filter((r) => r.isPublic && r.guards.includes('JwtAuthGuard')).map(key);
    expect(fautives).toEqual([]);
  });

  it('le filet d’exécution (AccessDeclarationGuard, global) ne refuse aucune route livrée', () => {
    const refusees = routes.filter((r) => r.fault !== null).map((r) => `${key(r)} : ${r.fault}`);
    expect(refusees).toEqual([]);
  });

  it('les rôles cités existent dans le schéma', () => {
    const connus = new Set<string>(Object.values(UserRole));
    const fautives = routes.filter((r) => r.roles.some((role) => !connus.has(role))).map(key);
    expect(fautives).toEqual([]);
  });

  it('aucune route n’est déclarée deux fois', () => {
    const doublons = routes.map(key).filter((k, i, all) => all.indexOf(k) !== i);
    expect(doublons).toEqual([]);
  });

  it('la table route → rôles correspond au fichier versionné', async () => {
    await expect(markdownTable(routes)).toMatchFileSnapshot('./__snapshots__/route-access.md');
  });
});

describe('Décisions d’accès du propriétaire (24/09)', () => {
  const decisions: ReadonlyArray<readonly [string, string | readonly string[]]> = [
    // Ouvert sans session : connexion, SSO, santé.
    ['GET /api/health', PUBLIC],
    ['GET /api/health/ready', PUBLIC],
    ['GET /api/auth/login', PUBLIC],
    ['GET /api/auth/callback', PUBLIC],
    ['POST /api/auth/refresh', PUBLIC],
    ['POST /api/auth/local-login', PUBLIC],
    ['GET /api/auth/setup-required', PUBLIC],
    ['GET /api/auth/local-auth-status', PUBLIC],
    // Toute personne connectée : sa session, ses propres bons, la signature par jeton.
    ['GET /api/auth/me', TOUS],
    ['POST /api/auth/logout', TOUS],
    ['POST /api/auth/change-password', TOUS],
    ['GET /api/signature/:token', TOUS],
    ['GET /api/signature/:token/preview', TOUS],
    ['POST /api/signature/:token/sign', TOUS],
    ['GET /api/bons/mes-bons', TOUS],
    ['GET /api/bons/:id', TOUS],
    ['GET /api/bons/:id/pdf', TOUS],
    ['POST /api/bons/:id/contestation', TOUS],
    // Utilisateurs : la gestion est réservée à l'admin…
    ['GET /api/users', ADMIN],
    ['POST /api/users/manual', ADMIN],
    ['PATCH /api/users/:id/manual', ADMIN],
    ['GET /api/users/manual/export', ADMIN],
    ['GET /api/users/manual/import/template', ADMIN],
    ['POST /api/users/manual/import', ADMIN],
    ['PATCH /api/admin/users/:id/role', ADMIN],
    ['POST /api/admin/users/:id/unlock', ADMIN],
    // … le technicien garde la recherche du destinataire d'un bon et la fiche en lecture.
    ['GET /api/users/search', IT],
    ['GET /api/users/it-staff', IT],
    ['GET /api/users/:id', IT],
    // Filiales : gestion admin ; liste des actives pour les filtres et formulaires.
    ['GET /api/filiales', ADMIN],
    ['GET /api/filiales/:id', ADMIN],
    ['POST /api/filiales', ADMIN],
    ['POST /api/filiales/import', ADMIN],
    ['PUT /api/filiales/:id', ADMIN],
    ['PATCH /api/filiales/:id/logo', ADMIN],
    ['PATCH /api/filiales/:id/stamp', ADMIN],
    ['DELETE /api/filiales/:id', ADMIN],
    ['GET /api/filiales/export', ADMIN],
    ['GET /api/filiales/import/template', ADMIN],
    ['GET /api/filiales/active', IT_ET_DIRECTION],
    // Catalogue : le technicien garde l'écriture.
    ['POST /api/equipment/catalog', IT],
    ['POST /api/equipment/catalog/import', IT],
    ['PUT /api/equipment/catalog/:id', IT],
    ['DELETE /api/equipment/catalog/:id', IT],
    ['POST /api/equipment/packs', IT],
    ['PUT /api/equipment/packs/:id', IT],
    ['DELETE /api/equipment/packs/:id', IT],
    // Synchronisation de l'annuaire : admin seul.
    ['GET /api/admin/ldap/status', ADMIN],
    ['POST /api/admin/ldap/sync', ADMIN],
  ];

  it.each(decisions)('%s → %j', (routeKey, attendu) => {
    const route = byKey.get(routeKey);
    expect(route, `route absente : ${routeKey}`).toBeDefined();
    const obtenu = access(route as RouteAccess);
    expect(typeof obtenu === 'string' ? obtenu : [...obtenu].sort()).toEqual(
      typeof attendu === 'string' ? attendu : [...attendu].sort(),
    );
  });

  it('le service de fichiers des filiales (cachets, logos) n’existe plus', () => {
    expect(routes.filter((r) => r.path.startsWith('/api/filiales/file'))).toEqual([]);
  });

  it('aucune route des filiales n’est ouverte au collaborateur', () => {
    const ouvertes = routes
      .filter((r) => r.path.startsWith('/api/filiales') && (r.isPublic || r.roles.includes('collaborator')))
      .map(key);
    expect(ouvertes).toEqual([]);
  });

  it('l’administration (/api/admin/…) est réservée à l’administrateur', () => {
    const ouvertes = routes
      .filter((r) => r.path.startsWith('/api/admin/'))
      .filter((r) => r.isPublic || r.roles.some((role) => role !== 'admin'))
      .map(key);
    expect(ouvertes).toEqual([]);
  });

  // Routes « propriétaire » : ouvertes à tout rôle connecté, chacune limite un
  // compte non IT à SES données (verifyCollaboratorAccess, contrôle du
  // destinataire du jeton…). En ajouter une est une décision de sécurité :
  // vérifier ce contrôle, puis compléter cette liste.
  const ROUTES_PROPRIETAIRE = [
    'GET /api/auth/me',
    'POST /api/auth/logout',
    'POST /api/auth/change-password',
    'GET /api/bons/mes-bons',
    'GET /api/bons/:id',
    'GET /api/bons/:id/integrity',
    'GET /api/bons/:id/pdf',
    'GET /api/bons/:id/pdf-snapshots',
    'POST /api/bons/:id/contestation',
    'GET /api/bons/:bonId/attachments',
    'POST /api/bons/:bonId/attachments',
    'GET /api/bons/:bonId/attachments/:attachmentId',
    'DELETE /api/bons/:bonId/attachments/:attachmentId',
    'GET /api/signature/:token',
    'GET /api/signature/:token/preview',
    'POST /api/signature/:token/sign',
  ];

  it('seules les routes « propriétaire » recensées sont ouvertes à tout rôle connecté', () => {
    const ouvertesATous = routes.filter((r) => !r.isPublic && ALL_ROLES.every((role) => r.roles.includes(role)));
    expect(ouvertesATous.map(key).sort()).toEqual([...ROUTES_PROPRIETAIRE].sort());
  });

  it('le collaborateur n’a accès qu’aux routes publiques et aux routes « propriétaire »', () => {
    const enPlus = routes
      .filter((r) => r.roles.includes('collaborator') && !ROUTES_PROPRIETAIRE.includes(key(r)))
      .map(key);
    expect(enPlus).toEqual([]);
  });

  it('la direction ne fait que lire, hors routes « propriétaire »', () => {
    const ecritures = routes
      .filter((r) => r.roles.includes('direction') && r.method !== 'GET' && !ROUTES_PROPRIETAIRE.includes(key(r)))
      .map(key);
    expect(ecritures).toEqual([]);
  });

  it('le technicien n’accède à aucune route d’écriture sur les utilisateurs ni les filiales', () => {
    const ecritures = routes
      .filter((r) => r.method !== 'GET')
      .filter((r) => /^\/api\/(users|filiales|admin\/users)(\/|$)/.test(r.path))
      .filter((r) => r.roles.includes('technician'))
      .map(key);
    expect(ecritures).toEqual([]);
  });
});
