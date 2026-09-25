# Sécurité — Référence complète

> Document consolidé issu des phases 6 et 7 (2026-03-21), mis à jour le 2026-09-16 (revue
> pré-production), le 2026-09-17 (rôle Direction, tableau de bord KPI) et le 2026-09-24 (modèle d'accès :
> refus par défaut, droits du technicien, cachet des filiales). Contient toutes les
> corrections implémentées, les règles non-négociables pour le développement futur, et les
> checklists de validation.

---

## Modèle d'accès (depuis le 2026-09-24) — refus par défaut

### La règle

Chaque route de l'API déclare qui peut l'appeler, **sinon elle est refusée** :

| Déclaration | Effet | Gardes |
|---|---|---|
| `@Public()` (`auth/decorators/public.decorator.ts`) | ouverte **sans session** | aucune garde de session (`JwtAuthGuard` interdit) |
| `@Roles('admin', …)` (`auth/decorators/roles.decorator.ts`) | réservée aux rôles listés | `@UseGuards(JwtAuthGuard, RolesGuard)`, dans cet ordre |
| `@Roles(...ALL_ROLES)` | toute personne connectée | idem |
| rien | **refusée** (`403`) même pour un administrateur | — |

- `RolesGuard` (`auth/guards/roles.guard.ts`) lit d'abord `@Roles` (celui de la méthode remplace celui de la
  classe), puis `@Public`, et refuse tout le reste. Une déclaration contradictoire (`@Public` et `@Roles`)
  se ferme : les rôles s'appliquent. Le refus répond **« Droits insuffisants pour cette action »** et une
  route oubliée est signalée dans les journaux du serveur.
- **Filet d'exécution** : `RolesGuard` ne protège que les contrôleurs qui le déclarent. `AccessDeclarationGuard`
  (`auth/guards/access-declaration.guard.ts`), enregistré **globalement** par `AuthModule`, refuse donc en `403`,
  avant les gardes du contrôleur, toute route qui n'est ni `@Public()` ni `@Roles(...)` derrière `JwtAuthGuard`
  puis `RolesGuard` — même dans un contrôleur qui n'a déclaré aucune garde. Il ne lit que des métadonnées.
- `@Roles` est typé sur l'énumération Prisma `UserRole` : une faute de frappe ne compile pas.
- **Garde-fou automatique** : `backend/src/auth/__tests__/route-access.spec.ts` parcourt toutes les routes
  de `AppModule` et échoue si l'une n'a ni `@Public` ni rôle, si une route à rôles ne passe pas par
  `JwtAuthGuard` puis `RolesGuard`, si une route publique exige une session, ou si le filet d'exécution
  refuserait une route livrée. Il vérifie aussi les décisions du propriétaire (ci-dessous) et quatre
  invariants : `/admin/…` réservé à l'administrateur ; seules les routes « propriétaire » recensées sont
  ouvertes à tout rôle connecté ; le collaborateur n'a rien d'autre ; la direction ne fait que lire en dehors
  d'elles. Il compare enfin la table complète route → rôles au fichier versionné
  [`backend/src/auth/__tests__/__snapshots__/route-access.md`](../backend/src/auth/__tests__/__snapshots__/route-access.md) :
  **c'est la référence à jour des droits**, et tout changement de droits apparaît dans la revue de code.
  Après une modification voulue : `cd backend && npx vitest run src/auth/__tests__/route-access.spec.ts -u`.

### Routes publiques (sans session)

Connexion locale et Microsoft (`GET /auth/login`, `GET /auth/callback`, `POST /auth/local-login`),
rafraîchissement de session par cookie (`POST /auth/refresh`), informations lues par la page de connexion
(`GET /auth/setup-required`, `GET /auth/local-auth-status`) et santé (`GET /health`, `GET /health/ready`).
Rien d'autre.

La **signature par jeton** (`/signature/:token…`) n'est pas publique : elle exige une session (tout rôle),
puis le service vérifie que la personne connectée est bien le destinataire du lien (sauf en présentiel,
où le technicien tend son appareil).

### Qui fait quoi

| Domaine | `admin` | `technician` | `direction` | `collaborator` |
|---|---|---|---|---|
| Bons : créer, envoyer, restituer, clôturer, annuler ; contestations : décider | oui | oui | non | non |
| **Ses propres** bons : consulter, PDF, pièces jointes, contester, signer | oui | oui | oui | oui |
| Catalogue (articles, packs) : lire et **modifier** | oui | oui | non | non |
| Recherche du destinataire d'un bon (`GET /users/search`), fiche d'une personne en lecture (`GET /users/:id`), liste des comptes IT pour le filtre « Créé par » (`GET /users/it-staff`) | oui | oui | non | non |
| **Gestion des utilisateurs** : liste de l'écran Utilisateurs (`GET /users`), comptes manuels (création — y compris depuis le formulaire de bon —, modification, désactivation, import, export), rôle, déverrouillage | oui | **non** | non | non |
| **Gestion des filiales** : liste complète, création, modification, logo, cachet, désactivation, import, export | oui | **non** | non | non |
| Liste des filiales actives, réduite à `{ id, name, displayName, active }` (`GET /filiales/active`) | oui | oui | oui | non |
| Tableau de bord, inventaire, historique d'un équipement | oui | oui | lecture | non |
| Administration : paramètres, annuaire (synchronisation LDAP), modèles d'email et de PDF, supervision, rétention, journal d'audit | oui | non | non | non |

Sur les routes « propriétaire » (ouvertes à tout rôle connecté : `GET /bons/mes-bons`, `GET /bons/:id`,
`/bons/:id/pdf`, `/pdf-snapshots`, `/integrity`, `POST /bons/:id/contestation`, pièces jointes), un compte non
IT n'atteint **que ses propres bons** (`bons/bons-access.ts`, `attachments.controller.ts`). La direction y a
accès comme tout le monde : elle peut, elle aussi, recevoir du matériel.

### Cachet de la filiale

- Aucune route ne sert les fichiers déposés (logos, cachets) : `GET /filiales/file/:filename`, qui n'était
  appelée par aucun écran et laissait un collaborateur télécharger le cachet d'une filiale, est **supprimée**.
  Un cachet ne quitte le serveur qu'imprimé sur un PDF.
- Le chemin du cachet (`stampPath`) n'est jamais renvoyé à un collaborateur ni à la direction :
  `FilialeStampRedactionInterceptor` (`auth/interceptors/`, enregistré globalement par `AuthModule`) le
  retire de toutes leurs réponses, quelle que soit la profondeur. Les réponses envoyées à l'IT ne sont pas
  touchées.
- À la source : la session (`GET /auth/me`) et les lectures d'utilisateurs ne chargent de la filiale que son
  identité ; `GET /filiales/active` ne renvoie que `{ id, name, displayName, active }`.
- Pourquoi un intercepteur et pas seulement la source : la fiche d'un bon, « Mes bons » et la page de
  signature chargent la filiale complète (`BON_SELECT_SHAPE.filiale` dans `common/types.ts`), et **la
  génération des PDF lit le cachet dans ce même objet** (`pdf.service.ts`, une dizaine d'appelants dans
  `bons/` et `signature/`). Retirer `stampPath` de ce select effacerait le cachet des PDF. La correction à la
  source (le PDF charge lui-même le cachet de la filiale ; le select n'expose plus que l'identité, l'adresse,
  le SIRET et le logo) relève du lot PDF ; l'intercepteur restera ensuite comme filet. Il renvoie une copie
  et ne modifie jamais l'objet lu par la génération des PDF (vérifié sur une vraie réponse Prisma :
  `filiale-stamp-redaction.real-db.spec.ts`).

### Retour à la page demandée après une connexion Microsoft

`GET /auth/login?returnTo=…` garde la page demandée dans le cookie `auth_return_to` (httpOnly,
`SameSite=Lax`, `Secure` en production, 10 minutes). Seul un **chemin interne** est accepté
(`isSafeReturnTo`, `auth.controller.ts`) : une chaîne de 2 048 caractères au plus, commençant par un seul `/`,
sans `\` ni caractère de contrôle, qui reste sur l'origine du front une fois résolue. Sinon, aucun cookie
n'est posé et celui d'une tentative précédente est effacé. `GET /auth/callback` lit puis efface le cookie
**quelle que soit l'issue**, et le revalide avant de rediriger (un cookie peut être forgé) : à défaut, retour
à l'accueil. Tests : `auth/__tests__/auth-return-to.spec.ts` (vraies requêtes HTTP).

### Alertes IT

Les alertes de contestation et de départ d'un collaborateur qui détient du matériel partent à **tous les
administrateurs et techniciens actifs**, choisis par leur **rôle** (`notification/it-alert-recipients.ts`),
avec une adresse délivrable. La colonne `isItStaff` n'est plus lue pour cela ; elle reste écrite, en
attendant son retrait (vague 5).

### Ajouter une route

1. Poser `@Public()` (rare : uniquement pour ce qui précède toute session) **ou** `@Roles(...)` au niveau de la
   classe ou de la méthode, avec `@UseGuards(JwtAuthGuard, RolesGuard)` sur la classe.
2. Préférer au niveau de la classe le rôle le plus restrictif, et ouvrir route par route.
3. Sur une route ouverte à un compte non IT, vérifier la propriété de la donnée dans la route ou le service,
   puis l'ajouter à `ROUTES_PROPRIETAIRE` dans `route-access.spec.ts`.
4. Relancer `route-access.spec.ts` avec `-u`, relire la table générée, la committer avec le code.

---

## Mise à jour 2026-09-17 — rôle Direction (lecture seule)

> Complété le 2026-09-24 : la direction consulte aussi **ses propres** bons (voir « Modèle d'accès »).

- **Périmètre** : le rôle `direction` n'a accès qu'au tableau de bord KPI (`GET /api/kpi/*`,
  hors onglet Aujourd'hui côté frontend) et à l'inventaire (`GET /api/reporting/inventory*`,
  y compris l'export CSV). Aucun accès aux bons individuels, aux utilisateurs, aux
  contestations ni à l'administration — ces routes restent réservées à l'IT (depuis le 2026-09-24 :
  utilisateurs, filiales et administration à l'administrateur seul).
- **`isItStaff` toujours faux** : contrairement à `admin` et `technician`, le rôle `direction`
  ne donne jamais `isItStaff = true`, y compris lorsqu'il est attribué manuellement.
- **Contrôles d'accès** : les vérifications historiquement écrites « tout ce qui n'est pas
  `collaborator` est IT » (`user.role !== 'collaborator'`) ont été remplacées par
  `isItRole(user.role)` (`common/roles.ts`, `IT_ROLES = ['admin', 'technician']`) avant
  d'introduire le rôle `direction`, pour qu'un nouveau rôle non-IT n'élargisse pas
  silencieusement l'accès à une route réservée à l'IT.
- **Attribution** : par groupe Entra ID dédié (clé `entra.direction_group_id`) — comme pour
  `admin`/`technician`, le groupe Entra fait foi et le rôle est recalculé et écrasé à **chaque**
  connexion SSO, sans exception. L'attribution manuelle (`PATCH /admin/users/:id/role`, réservée
  à `admin`) reste utile pour les comptes locaux ; pour un compte SSO, elle est écrasée à la
  prochaine connexion si le compte n'est pas dans le groupe Entra configuré.
- **Garde-fous sur le changement de rôle** : refusé sur son propre compte, et refusé si la cible
  est le dernier administrateur actif (les administrateurs désactivés ne comptent pas). Chaque
  changement est journalisé (`user_role_changed`, avec l'ancien et le nouveau rôle).
- **Seuil de retard de signature** : configurable (`rappels.signature_overdue_days`, défaut 7,
  minimum 1 — 0 est rejeté), une définition unique partagée par `/bons`, `/bons/stats` et
  `/kpi/delais`.

## Mise à jour 2026-09-16 — règles modifiées ou précisées

Ces points remplacent ou complètent les règles historiques ci-dessous (issues des phases 6/7)
là où elles ont changé depuis.

### Rate limiting — un seul ThrottlerGuard global

- Un unique `ThrottlerGuard` global est enregistré (`APP_GUARD`). **Ne jamais ajouter
  `@UseGuards(ThrottlerGuard)` sur une méthode de contrôleur** : le guard global s'applique déjà
  partout, en rajouter un sur une méthode double-compte les requêtes contre le même quota et
  peut déclencher des `429` prématurés. Utiliser uniquement `@Throttle({ default: { limit, ttl } })`
  pour ajuster la limite d'une route précise.
- `POST /api/auth/refresh` est limité **par utilisateur** (`UserThrottlerGuard`, tracker basé sur
  le `sub` du refresh token) plutôt que par IP : plusieurs postes derrière un même NAT
  (agence, VPN) ne se pénalisent plus mutuellement, tout en gardant une limite par compte.

### Brute-force — verrouillage composite compte + IP

- **Verrou de compte** : ≥ 10 échecs `login_local_failed` pour le même couple (email, IP) en
  30 minutes.
- **Verrou d'IP** : ≥ 30 échecs `login_local_failed` depuis la même IP, toutes cibles (emails)
  confondues, en 30 minutes — protège contre un balayage d'emails depuis une même source.
- Les rejets pendant un verrou sont journalisés en `login_local_locked` (pas `login_local_failed`)
  pour qu'une tentative sur un compte déjà verrouillé ne prolonge pas indéfiniment la fenêtre.
- **Déverrouillage manuel** : `POST /admin/users/:id/unlock` (bouton « Déverrouiller » sur la
  page Admin → Utilisateurs, visible sur un compte verrouillé). Supprime les `login_local_failed`
  des 30 dernières minutes pour l'email ciblé et journalise `user_unlocked`.
- **Si `admin@local` lui-même est verrouillé ou son mot de passe perdu** : procédure côté
  serveur (réinitialisation du hash depuis le conteneur backend, levée du verrou en SQL) dans
  le README, section « Réinitialiser le mot de passe admin@local ». Remplace la
  procédure manuelle par requête SQL décrite plus bas dans ce document (toujours valable si
  besoin, mais l'endpoint est la voie recommandée).

### Cookies — refresh_token path `/api/auth`

- `refresh_token` a pour path `/api/auth` (et non `/api/auth/refresh`) : ce chemin couvre aussi
  `/api/auth/logout`, ce qui garantit que le logout peut effectivement lire et révoquer le
  cookie. `access_token` garde son path `/api`.

### returnTo — validation par comparaison d'origine

- La validation de `returnTo` (redirection post-login) se fait **par comparaison d'origine**
  (`new URL(returnTo, base).origin === new URL(base).origin`), backend (`isSafeReturnTo` dans
  `auth.controller.ts`) et frontend (`safeReturnTo` dans `lib/safe-return-to.ts`, utilisé par la
  connexion, le changement de mot de passe, la signature, la garde des routes et le client API),
  jamais par une simple regex de préfixe (`/^\/[^/]/`) : une regex seule reste contournable par des
  variantes d'encodage. Les deux côtés refusent en plus, avant toute résolution, une valeur qui ne
  commence pas par `/`, qui commence par `//`, ou qui contient `\` ou un caractère de contrôle.
- Un lien profond ouvert sans session (`ProtectedRoute`) mène à `/login?returnTo=<chemin et
  paramètres>` ; pour Microsoft, le serveur garde l'adresse dans le cookie `auth_return_to` pendant
  l'aller-retour et la revalide au retour.

### Emails — normalisation systématique

- Tous les emails utilisateurs sont normalisés en minuscules (+ trim) à l'écriture : sync LDAP,
  callback SSO, création admin locale, `users.service`. Un index unique fonctionnel
  `lower(email)` empêche deux comptes différant seulement par la casse.

### Signature en présentiel — validité 2 heures

- Un token de signature généré en mode présentiel (`isInPerson=true`) est valable **2 heures**,
  quelle que soit la durée configurée (`tokens.expiry_days`) pour les liens envoyés par email.

### Annulation d'un bon — interdite après signature de mise à disposition

- `DELETE /api/bons/:id` (annulation) n'est possible que si le bon est au statut `draft` ou
  `sent_mise_dispo`. Dès qu'une signature de mise à disposition est apposée (statut `active` ou
  au-delà), l'annulation est refusée (`400`) : passer par la restitution ou la clôture
  unilatérale. Le chemin interne de résolution de contestation n'est pas concerné par cette
  règle.

### Anonymisation RGPD — plancher et dry-run obligatoires

- `retention.anonymize_months` ne peut pas être configuré en dessous de **60 mois** (plancher
  légal, refusé à la fois côté validation de configuration et côté service).
- Un run réel d'anonymisation (hors cron) exige qu'un **dry-run de moins de 24h** ait été
  exécuté au préalable ; sinon la requête est refusée.
- Sont **anonymisés** (bons éligibles) : l'identité du collaborateur (transférée vers un compte
  technique `anonymise@rgpd.local`), l'email destinataire dans `NotificationLog`, les champs
  utilisateur/IP/user-agent et certains détails (nom de fichier, email du titulaire) dans
  `AuditLog`, le message de contestation, le nom de fichier d'export SMB, et les sceaux de
  signature (`seal`, `sealedAt`, `tsToken`).
- Sont **conservés** : les snapshots PDF (preuve contractuelle), les références de bon, les
  dates et statuts.
- Purge indépendante des pièces jointes après `retention.attachment_months` (fichiers sur disque
  + lignes en base), déconnectée du plancher des 60 mois de l'anonymisation.

### Garde-fou synchronisation LDAP

- Une synchronisation LDAP qui désactiverait plus de **20 % des comptes LDAP actifs** (et au
  moins 5 comptes) est **interrompue** avant toute désactivation : la passe est journalisée
  (`ldap_sync_aborted`, audit + log d'erreur) et aucun compte n'est désactivé. Symptôme probable :
  `search_base` ou `user_filter` mal configuré, ou base LDAP temporairement inaccessible.

---

## Résumé : ce qui a été corrigé

### Phase 6 — Hardening initial (10 corrections)

| ID | Sévérité | Correction | Fichier |
|----|----------|------------|---------|
| SEC-01 | Critique | IDOR : `verifyCollaboratorAccess()` sur `POST /bons/:id/contestation` | `bons.controller.ts` |
| SEC-02 | Critique | LDAP injection : validation syntaxique du `user_filter` | `ldap.service.ts` |
| SEC-03 | Critique | IP spoofable : `X-Real-IP` (nginx) au lieu de `X-Forwarded-For` | `nginx.conf` + controllers |
| SEC-04 | Haute | Rate limit : `@Throttle(20/min)` sur `POST /auth/refresh` | `auth.controller.ts` |
| SEC-06 | Haute | Password policy : min 12 chars, maj+min+spécial, max 128 | `auth.service.ts` |
| SEC-07 | Haute | Brute force : verrouillage 30 min après 10 échecs | `auth.service.ts` |
| SEC-08 | Haute | Config sensible (ldap/smtp/entra/smb) restreinte à `@Roles('admin')` | `admin.controller.ts` |
| SEC-10 | Moyenne | CSP : `frame-ancestors 'none'`, `connect-src`, `font-src` | `bootstrap/configure-app.ts` |
| SEC-14 | Basse | HSTS : `maxAge 31536000 + includeSubDomains` | `bootstrap/configure-app.ts` |
| SEC-16 | Basse | Audit trail : `login_success/failed`, `logout`, `password_changed` | `auth.controller.ts` |

### Phase 7 — Audit OWASP complet (22 corrections supplémentaires)

| ID | Sévérité | Correction | Fichier(s) |
|----|----------|------------|-----------|
| C-01 | Critique | `.gitignore` couvre `**/.env` et `backend/.env` | `.gitignore` |
| C-02 | Critique | `JWT_SECRET` dans `docker-compose.prod.yml` | `docker-compose.prod.yml` |
| C-03 | Critique | `mustChangePassword` enforced serveur dans `JwtAuthGuard` | `jwt-auth.guard.ts` |
| H-01 | Haute | `CreateContestationDto` avec `@MaxLength(2000)` | `bons/dto/actions.dto.ts` |
| H-02 | Haute | DTOs validés pour toutes les actions bons (`@IsUUID`, `@Matches`, etc.) | `bons/dto/actions.dto.ts` |
| H-03 | Haute | SVG retiré des uploads ; anciens SVGs en `Content-Disposition: attachment` | `filiales.module.ts` |
| H-04 | Haute | Audit logs restreints à `@Roles('admin')` | `audit.controller.ts` |
| H-05 | Haute | Templates PATCH/DELETE/POST restreints à `@Roles('admin')` | `templates.controller.ts` |
| H-06 | Haute | CSRF middleware `X-Requested-With` sur POST/PUT/PATCH/DELETE | `bootstrap/configure-app.ts`, `api.ts` |
| H-07 | Haute | SMB path validation `isSafeSmbExportPath()` | `smb/smb-path-safety.ts` |
| M-01 | Moyenne | Brute-force persisté en DB via `AuditLog` (survit aux redémarrages) | `auth.service.ts` |
| M-02 | Moyenne | `passwordHash` exclu de toutes les réponses API users | `users.service.ts` |
| M-03 | Moyenne | Open redirect : `/^\/[^/]/` (bloque `//evil.com`) | `auth.controller.ts` |
| M-04 | Moyenne | Rate limit 5/min sur upload logo/stamp | `filiales.controller.ts` |
| M-07 | Moyenne | `X-Forwarded-For: $remote_addr` dans nginx frontend | `frontend/nginx.conf` |
| M-08 | Moyenne | Pagination audit logs plafonnée à 100 | `audit.controller.ts` |
| M-09 | Moyenne | `ResolveContestationDto` avec `@IsIn(['resolved', 'rejected'])` | `contestation.controller.ts` |
| L-01 | Basse | Cookie `access_token` path restreint à `/api` | `auth.service.ts` |
| L-02 | Basse | CSP header complet dans `frontend/nginx.conf` | `frontend/nginx.conf` |
| L-03 | Basse | Dockerfile frontend : `USER nginx-app` (non-root, port 8080) | `frontend/Dockerfile` |
| L-04 | Basse | Docker-compose mis à jour pour le port 8080 | `docker-compose.*.yml` |
| L-05 | Basse | Token présentiel (`isInPerson`) limité à 2h (vs 7j configurable pour email) | `signature.service.ts` |

---

## OWASP Top 10 — Statut actuel

| # | Catégorie | Statut |
|---|-----------|--------|
| A01 | Broken Access Control | ✅ `mustChangePassword` server-side, IDOR fixé, audit admin-only |
| A02 | Cryptographic Failures | ✅ `JWT_SECRET` en prod, cookie path restreint, `ENCRYPTION_KEY` canari |
| A03 | Injection | ✅ DTOs validés (`@IsUUID`, `@IsIn`, `@MaxLength`), LDAP filter validé |
| A04 | Insecure Design | ✅ Brute-force persisté en DB, CSRF middleware |
| A05 | Security Misconfiguration | ✅ SVG bloqué, `X-Forwarded-For` corrigé, CSP frontend+backend |
| A06 | Vulnerable Components | ⚠️ Lancer `npm audit` régulièrement |
| A07 | Auth Failures | ✅ `mustChangePassword` serveur, brute-force DB, password policy 12 chars |
| A08 | Data Integrity | ✅ `@IsIn`, `@IsEnum` sur toutes les actions sensibles |
| A09 | Security Logging | ✅ Audit admin-only, login/logout/password tracés, pagination plafonnée |
| A10 | SSRF | ✅ SMB path validation, aucune URL utilisateur vers serveur |

---

## Ce qui est volontairement non implémenté

| ID | Raison |
|----|--------|
| SEC-05 | **JWT revocation** : nécessite Redis. Access tokens à durée courte (15 min). Rapport effort/risque défavorable pour système interne. |
| SEC-09 | **SameSite strict** : casse les liens email → app. `lax` suffisant en interne. |
| SEC-11 | **MaxLength signatureDataUrl** : validation globale 2MB déjà présente (suffisant). |
| SEC-15 | **Cookie `__Host-` prefix** : gain marginal sur domaine unique interne. |

---

## Règles non-négociables pour le développement futur

### 1. Tout endpoint `@Body()` doit utiliser un DTO validé
```typescript
// INTERDIT
@Body('message') message: string
// OBLIGATOIRE
@Body() dto: CreateXxxDto  // avec @IsString() @MaxLength(...)
```

### 2. Le header CSRF doit être présent sur tous les appels frontend
```typescript
// frontend/src/lib/api.ts — ne pas supprimer
headers: { 'X-Requested-With': 'XMLHttpRequest', ... }
```

### 3. Les réponses API users n'incluent jamais `passwordHash`
```typescript
// INTERDIT
prisma.user.findMany({ include: { filiale: true } })
// OBLIGATOIRE — utiliser safeSelect dans users.service.ts
prisma.user.findMany({ select: this.safeSelect })
```

### 4. Uploads : SVG interdit, rate limit 5/min obligatoire
```typescript
const allowedMime = /^image\/(jpeg|png|gif|webp)$/;
@Throttle({ default: { limit: 5, ttl: 60000 } })
```

### 5. Les cookies d'auth ont un path restreint
```typescript
// access_token  → path: '/api'
// refresh_token → path: '/api/auth'   (couvre aussi /api/auth/logout — révocation au logout)
```

### 6. Le SMB path est validé avant écriture
```typescript
if (!isSafeSmbExportPath(smbPath)) return;   // smb/smb-path-safety.ts
```

### 7. Les logs d'audit sont réservés à `@Roles('admin')`

### 8. Les modèles d'email et de PDF (lecture comme modification) sont réservés à `@Roles('admin')`

### 9. Chaque route déclare son accès : `@Public()` ou `@Roles(...)`, sinon elle est refusée
```typescript
// INTERDIT — refusée par RolesGuard, signalée par route-access.spec.ts
@Get('nouvelle')
// OBLIGATOIRE
@Get('nouvelle')
@Roles('admin', 'technician')
```

### 10. Aucune réponse n'expose le cachet d'une filiale à un collaborateur
Aucune route ne sert `data/uploads` ; `stampPath` est retiré des réponses non IT (voir « Modèle d'accès »).

---

## Checklist post-déploiement

### Critique
- [ ] `backend/.env` absent du dépôt git (`git log --all -- backend/.env` → vide)
- [ ] `JWT_SECRET` défini dans Portainer avant déploiement
- [ ] Login avec `mustChangePassword=true` → API `403` sauf `/auth/change-password`

### Haute
- [ ] `POST /api/bons/:id/contestation` avec message > 2000 chars → `400`
- [ ] Upload SVG via `/api/filiales/:id/logo` → rejeté
- [ ] `GET /api/audit` avec compte technician → `403`
- [ ] `PATCH /api/admin/email-templates/:id` avec compte technician → `403`
- [ ] `POST /api/users/manual`, `PATCH /api/users/:id/manual`, `GET /api/users`, `POST /api/filiales`,
      `PUT /api/filiales/:id`, `PATCH /api/filiales/:id/stamp` avec compte technician → `403`
      « Droits insuffisants pour cette action »
- [ ] `GET /api/users/search?q=…`, `GET /api/users/it-staff`, `POST /api/equipment/catalog` avec compte
      technician → `200` / `201`
- [ ] `GET /api/filiales/file/<nom>` → `404` (route supprimée)
- [ ] `GET /api/auth/me`, `GET /api/bons/mes-bons` avec compte collaborator → aucune clé `stampPath`
- [ ] `GET /api/filiales/active` avec compte collaborator → `403`
- [ ] `POST /api/bons/:id/sign-it` sans header `X-Requested-With` → `403`
- [ ] SMB path `/etc` dans config → rejeté
- [ ] `POST /api/bons/:id/contestation` par collaborateur sur un bon d'autrui → `403`
- [ ] Filtre LDAP invalide (`(|(objectClass=*))`) → `400`

### Moyenne
- [ ] 10 `login_local_failed` pour le même (email, IP) en 30 min → verrouillage de compte
- [ ] 30 `login_local_failed` depuis la même IP toutes cibles en 30 min → verrouillage d'IP
- [ ] `POST /admin/users/:id/unlock` sur un compte verrouillé → débloque, journalise `user_unlocked`
- [ ] `GET /api/users` → aucun champ `passwordHash` dans la réponse
- [ ] Redirect `returnTo=//evil.com` → redirige vers `/` uniquement (comparaison d'origine)
- [ ] Upload logo 6 fois en 1 min → `429`
- [ ] `GET /api/audit?limit=999999` → retourne max 100 entrées
- [ ] Aucune méthode de contrôleur ne porte `@UseGuards(ThrottlerGuard)` (double comptage) — seul le guard global compte
- [ ] `DELETE /api/bons/:id` sur un bon `active` (déjà signé) → `400`
- [ ] `retention.anonymize_months` réglé à une valeur < 60 → rejeté
- [ ] Anonymisation réelle sans dry-run < 24h → rejetée
- [ ] Sync LDAP simulée avec > 20 % de comptes actifs absents → interrompue, `ldap_sync_aborted` journalisé
- [ ] Un compte `direction` → `403` sur `GET /api/bons/stats`, `GET /api/bons/:id` d'un bon dont il n'est pas le destinataire, `GET /api/contestations`, `GET /api/users` et toute route `/api/admin/*`
- [ ] Un compte `direction` → `200` sur `GET /api/kpi/parc` (et `/kpi/delais`, `/kpi/incidents`, `/api/reporting/inventory*`)
- [ ] `PATCH /api/admin/users/:id/role` refusé sur son propre compte (`400`) et sur le dernier administrateur actif (`400`)
- [ ] `PUT /api/admin/config/rappels` avec `signature_overdue_days=0` → rejeté (minimum 1)

### Infrastructure
- [ ] Header `Content-Security-Policy` présent sur toutes les réponses
- [ ] Container frontend tourne en user `nginx-app` (`docker exec <frontend> whoami`)
- [ ] `X-Forwarded-For` = IP réelle (non spoofable via nginx)
- [ ] `Strict-Transport-Security` présent sur les réponses HTTPS
- [ ] Cookie `refresh_token` a pour path `/api/auth` (vérifiable dans les headers `Set-Cookie` au login)

---

## Troubleshooting sécurité

### Compte verrouillé
**Symptôme** : `403 — Compte temporairement verrouillé`
- Attendre 30 minutes (automatique, compteur en DB sur `AuditLog`)
- Ou redémarrer le backend **ne suffit plus** (brute-force persisté en DB depuis M-01)
- Déverrouillage recommandé : bouton « Déverrouiller » sur la fiche utilisateur, page
  Admin → Utilisateurs (`POST /admin/users/:id/unlock`)
- Déverrouillage manuel alternatif : supprimer les `AuditLog` `login_local_failed` des 30
  dernières minutes pour cet email

### Filtre LDAP rejeté
**Symptôme** : `400 — LDAP filter contains invalid characters`
- Valides : `(objectClass=person)`, `(&(objectClass=person)(cn=*))`, `(|(cn=*)(mail=*))`
- Interdits : caractères spéciaux non-échappés, injections type `(|(objectClass=*))`

### Monitoring à surveiller
- `login_local_failed` → tentatives brute force en cours
- `account_locked` → comptes verrouillés
- `ldap_validation_failed` → filtres LDAP rejetés
