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
 * donc dans la revue de code. Elle se termine par les anciens chemins encore
 * servis (alias dépréciés), avec les droits de la route qui les sert. Après
 * une modification VOULUE des droits :
 *   cd backend && npx vitest run src/auth/__tests__/route-access.spec.ts -u
 */
import { UserRole } from '@prisma/client';
import { AppModule } from '../../app.module';
import { API_PREFIX } from '../../bootstrap/configure-app';
import { collectDeprecatedAliases, DeprecatedAliasRoute } from '../../common/http/deprecated-alias';
import { ALL_ROLES } from '../decorators/roles.decorator';
import { collectControllers, inventoryRoutes, RouteAccess } from './helpers/route-inventory';

const routes = inventoryRoutes(AppModule);
const key = (r: RouteAccess): string => `${r.method} ${r.path}`;
const byKey = new Map(routes.map((r) => [key(r), r]));
const aliases = [...collectDeprecatedAliases(collectControllers(AppModule), API_PREFIX)].sort(
  (a, b) => a.path.localeCompare(b.path, 'en') || a.method.localeCompare(b.method, 'en'),
);
const successorKey = (a: DeprecatedAliasRoute): string => `${a.successorMethod} ${a.successorPath}`;

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

function aliasLine(alias: DeprecatedAliasRoute): string {
  const successor = byKey.get(successorKey(alias));
  const label = successor ? accessLabel(successor) : 'ROUTE CIBLE ABSENTE';
  return `| ${alias.method} | ${alias.path} | ${successorKey(alias)} | ${label} |`;
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
    '## Anciens chemins encore servis (alias dépréciés)',
    '',
    'Chacun est réécrit vers sa route cible avant le routage : mêmes gardes, mêmes droits.',
    '',
    '| Verbe | Ancien chemin | Route cible | Accès |',
    '|---|---|---|---|',
    ...aliases.map(aliasLine),
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

  it('chaque alias déprécié mène à une route existante, dont il reprend les droits', () => {
    expect(aliases.length).toBeGreaterThan(0);
    const orphelins = aliases.filter((a) => !byKey.has(successorKey(a))).map((a) => `${a.method} ${a.path}`);
    expect(orphelins).toEqual([]);
  });

  it('aucun alias ne masque une route encore déclarée', () => {
    const masquees = aliases.map((a) => `${a.method} ${a.path}`).filter((k) => byKey.has(k));
    expect(masquees).toEqual([]);
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
    ['POST /api/signature/:token/request-new-link', TOUS],
    ['GET /api/me/bons', TOUS],
    ['GET /api/me/contestations', TOUS],
    ['GET /api/bons/:id', TOUS],
    ['GET /api/bons/:id/pdf', TOUS],
    ['POST /api/bons/:id/contestation', TOUS],
    // Gestes IT sur un bon et ses contestations : ni collaborateur ni direction.
    ['PATCH /api/bons/:id', IT],
    ['POST /api/bons/:id/cancel', IT],
    ['GET /api/bons/:id/history', IT],
    ['GET /api/contestations', IT],
    ['POST /api/contestations/:id/review', IT],
    ['POST /api/contestations/:id/resolve', IT],
    // Utilisateurs : la gestion est réservée à l'admin…
    ['GET /api/users', ADMIN],
    ['POST /api/users/manual', ADMIN],
    ['PATCH /api/users/:id/manual', ADMIN],
    ['GET /api/users/manual/export', ADMIN],
    ['GET /api/users/manual/import/template', ADMIN],
    ['POST /api/users/manual/import', ADMIN],
    ['PATCH /api/users/:id/role', ADMIN],
    ['POST /api/users/:id/unlock', ADMIN],
    ['POST /api/users/:id/deactivate', ADMIN],
    ['POST /api/users/:id/reactivate', ADMIN],
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
    ['POST /api/admin/ldap/deactivate-all', ADMIN],
    // Registre de configuration (valeurs appliquées) : admin seul.
    ['GET /api/admin/config/registry', ADMIN],
    // Exports du tableau de bord : mêmes lecteurs que les onglets exportés.
    ['GET /api/kpi/parc/export', IT_ET_DIRECTION],
    ['GET /api/kpi/delais/export', IT_ET_DIRECTION],
    ['GET /api/kpi/incidents/export', IT_ET_DIRECTION],
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

  it('les modèles d’email et de PDF, sortis de /api/admin, restent réservés à l’administrateur', () => {
    const modeles = routes.filter((r) => /^\/api\/(email|pdf)-templates(\/|$)/.test(r.path));
    expect(modeles.length).toBeGreaterThan(10);
    const ouvertes = modeles.filter((r) => r.isPublic || r.roles.some((role) => role !== 'admin')).map(key);
    expect(ouvertes).toEqual([]);
  });

  it('chaque export du tableau de bord a exactement les lecteurs de l’onglet qu’il exporte', () => {
    const exports = routes.filter((r) => /^\/api\/kpi\/[^/]+\/export$/.test(r.path));
    expect(exports.length).toBeGreaterThan(0);
    const ecarts = exports
      .filter((r) => {
        const onglet = byKey.get(`GET ${r.path.replace(/\/export$/, '')}`);
        return !onglet || [...onglet.roles].sort().join() !== [...r.roles].sort().join();
      })
      .map(key);
    expect(ecarts).toEqual([]);
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
    'GET /api/me/bons',
    'GET /api/bons/:id',
    'GET /api/bons/:id/integrity',
    'GET /api/bons/:id/pdf',
    'GET /api/bons/:id/pdf-snapshots',
    'POST /api/bons/:id/contestation',
    'GET /api/me/contestations',
    'GET /api/bons/:bonId/attachments',
    'POST /api/bons/:bonId/attachments',
    'GET /api/bons/:bonId/attachments/:attachmentId',
    'DELETE /api/bons/:bonId/attachments/:attachmentId',
    'GET /api/signature/:token',
    'GET /api/signature/:token/preview',
    'POST /api/signature/:token/sign',
    // Contrôle du destinataire du jeton (signature/link-request.ts).
    'POST /api/signature/:token/request-new-link',
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
