# AGENDA — Contexte complet pour le développement futur

> Ce fichier sert de mémoire de travail. Il contient tout ce qu'il faut savoir pour reprendre le développement sans relire toute la doc.
> Pour le détail exhaustif, voir `projet_bon_de_mise_a_disposition.md` et `docs/phase*.md`.

---

## 1. Qu'est-ce que ce projet

Application web interne multi-filiales qui remplace les bons papier de mise à disposition et restitution de matériel IT.

**Cycle de vie d'un bon :**
```
Technicien crée le bon → appose son cachet IT → envoie au collaborateur
→ collaborateur signe via SSO → bon actif
→ technicien initie la restitution → cachet IT → collaborateur signe
→ bon archivé avec 2 PDF snapshots immuables
```

**Utilisateurs :**
- Équipe IT (admin, technician) : crée les bons, gère tout
- Direction (lecture seule, depuis le 2026-09-17) : tableau de bord KPI (sauf onglet Aujourd'hui) et inventaire du parc prêt ; aucun accès aux bons individuels, aux utilisateurs ni à l'administration. Attribution par groupe Entra dédié (`entra.direction_group_id`) : comme pour admin/technician, le groupe Entra fait foi et écrase le rôle à **chaque** connexion SSO, sans exception. Attribution manuelle possible depuis Utilisateurs (`PATCH /admin/users/:id/role`, réservé admin) — durable uniquement pour un compte local ; pour un compte SSO, elle est écrasée dès la prochaine connexion si le compte n'est pas dans le groupe configuré.
- Collaborateurs : signent, consultent leur portail, contestent

---

## 2. Stack technique

| Couche | Techno | Version |
|--------|--------|---------|
| Backend | NestJS + TypeScript | Node 22 |
| Frontend | React + TypeScript + Vite | React 18 |
| Base de données | PostgreSQL | 16 |
| ORM | Prisma | 5.22 |
| Auth SSO | MSAL (@azure/msal-node) | Entra ID / OIDC |
| Auth tokens | JWT httpOnly cookie | access 15min / refresh 8h |
| LDAP | ldapjs | sync cron 6h |
| Email | Nodemailer (SMTP) | configurable dans admin |
| PDF | PDFKit (natif Node.js) | snapshots en Bytes PostgreSQL |
| Signature | Canvas HTML5 natif | pas de lib externe |
| UI | shadcn/ui + Tailwind CSS | |
| Rate limiting | @nestjs/throttler | 10 req/60s sur /sign |
| Chiffrement | AES-256-GCM (crypto natif Node) | signatures PNG + config DB |
| Scheduler | @nestjs/schedule | rappels lun-ven 9h |
| CI/CD | GitHub Actions | build → push ghcr.io |
| Deploy | Docker Compose + Portainer | images pré-buildées |
| SSL | Nginx Proxy Manager (externe) | pas dans le container |

---

## 3. Architecture backend — 19 modules NestJS (enregistrés dans `AppModule`)

| Module | Fichiers | Rôle |
|--------|----------|------|
| `PrismaModule` | module + service | Connexion DB |
| `ConfigModule` | module + service + encryption | Config chiffrée en DB, cache TTL 5min |
| `TemplatesModule` | module (`@Global`) + service | 9 templates email personnalisables, rendu par variables `{{...}}` |
| `AuthModule` | module + service + controller + guards + decorators + strategy | SSO Entra + login local + JWT |
| `AdminModule` | module + service + controller | CRUD config, tests connexion, monitoring SMB, changement de rôle utilisateur, état de santé de la config (`config/health`), version/tâches planifiées (`status`), diagnostic SSO |
| `LdapModule` | module + service | Sync AD, cron 6h, `entry.attributes` |
| `FilialesModule` | module + service + controller + dto | CRUD filiales + upload logo/cachet + import/export CSV |
| `EquipmentModule` | module + service + controller + dto | Catalogue + packs + import CSV en masse (export CSV géré côté frontend) |
| `UsersModule` | module + service + controller | Liste + autocomplete |
| `NotificationModule` | module + service | SMTP + cron rappels + logs |
| `SignatureModule` | module + service + controller + dto | Sign collab + cachet IT + chiffrement PNG |
| `BonsModule` | module + service + controller + dto | CRUD bons, stats, export CSV, resend |
| `AuditModule` | module + service + controller | Logs d'audit paginés |
| `ContestationModule` | module + service + controller | Workflow contestation collab |
| `AttachmentsModule` | module + service + controller | Pièces jointes (upload/téléchargement/suppression), purge par ancienneté |
| `RetentionModule` | module + service + controller | Anonymisation RGPD (plancher 60 mois, dry-run obligatoire), purge tokens/audit/pièces jointes ; endpoints `admin/retention/preview\|run\|stats\|purge` |
| `ReportingModule` | module + controller + service | **Réduit à l'inventaire** (`reporting.service.ts`/`reporting.controller.ts` supprimés, lot 5) : parc prêt filtrable, export CSV, répartition par collaborateur |
| `KpiModule` | module + controller + 3 services + cache + dto | Tableau de bord KPI : `GET /kpi/parc\|delais\|incidents` (admin, technician, direction), cache 60 s |
| `MonitoringModule` | module (`@Global`) + `JobTrackerService` + `MonitoringService` + utils | **Nouveau** — Journalise chaque passage des tâches planifiées (`ScheduledJobRun`) et sonde la disponibilité DB ; consommé par ldap/notification/retention/smb ; alimente `GET /admin/status` |

Modules imbriqués (importés par un module ci-dessus, pas directement par `AppModule`) : `PdfModule`
(PDFKit, templates PDF, snapshots — importé par Bons/Signature/Admin), `SmbModule` (export réseau —
importé par Admin). `HealthController` : controller standalone, `GET /health` (toujours « ok ») et
`GET /health/ready` (sonde réelle : vérifie la base, `503` si injoignable).

**Le nombre exact de fichiers TypeScript a évolué au fil des découpages de gros fichiers (lots
2026-09-18/19, voir [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) pour l'arborescence à jour) —
voir [CHANGELOG.md](CHANGELOG.md) pour le détail historique.

---

## 4. Modèle de données — 18 modèles Prisma

```
AppConfig, User, Filiale, EquipmentCatalog, EquipmentPack, EquipmentPackItem,
Bon, BonEquipment, Signature, Attachment, ProofArchive, PdfSnapshot, SmbExport,
Contestation, NotificationLog, AuditLog, RevokedToken, ScheduledJobRun
+ enums : BonStatus, UserRole, Civilite, EquipmentCategory, SignatureType,
          PdfSnapshotType, SmbExportStatus, ContestationStatus, NotificationType,
          NotificationStatus, ScheduledJobStatus
```

> `ScheduledJobRun` (2026-09-19, supervision) : une ligne par tâche planifiée (`job` en clé
> primaire), dernier début/fin, statut (`ScheduledJobStatus` : success/error/skipped), erreur
> tronquée, durée — jamais renseignée par la tâche elle-même, toujours par `JobTrackerService`
> (`backend/src/monitoring/job-tracker.service.ts`), qui avale ses propres erreurs d'écriture.

**BonStatus (8 valeurs) :**
`draft` → `sent_mise_dispo` → `active` → `sent_restitution` → `archived` | `partially_returned` | `cancelled` | `contested`

> Pas d'état intermédiaire `signed_*` — le bon passe directement de `sent_mise_dispo` à `active`.
> `partially_returned` : restitution partielle — le bon reste ouvert pour traiter les équipements restants.
> Signature restitution depuis `partially_returned` → reste `partially_returned` (ne passe PAS à `archived`).
> `pv_cloture` depuis `partially_returned` → `archived` (tous les équipements traités ou déclarés perdus).
>
> **Corrections 2026-09-16** : le PV de clôture est désormais **dérivé de l'état métier**
> (équipements réellement en attente au moment de l'action), plus d'indicateur séparé —
> méthode idempotente `emitPvClotureIfDue`. `markFound` (équipement retrouvé) **n'archive
> jamais** tant qu'il reste des équipements en attente ; il ne passe à `archived` (avec
> avenant) que si le bon était déjà archivé. Chaque transition vérifie le statut de départ
> dans la même transaction que la mise à jour et renvoie `409` en cas de changement d'état
> concurrent. Annulation (`DELETE /bons/:id`) refusée dès qu'une signature de mise à
> disposition est signée (statuts annulables : `draft`, `sent_mise_dispo`).

**SignatureType (4 valeurs) :** `mise_disposition`, `restitution`, `it_cachet`, `pv_cloture`

---

## 5. Pages frontend — 16 pages React

> **2026-09-17** : `DashboardIT.tsx` et la page admin `Reports.tsx` sont supprimées, remplacées
> par `pages/dashboard/DashboardPage.tsx` (voir ci-dessous). `/admin/reports` redirige vers
> `/dashboard?tab=parc`.
>
> **2026-09-19** : `Configuration.tsx` (monolithique) est supprimée, remplacée par 10 sous-pages
> indépendantes (`pages/admin/configuration/Config*Page.tsx`, chargées à la demande), chacune sa
> propre route sous `/admin/configuration/...` (`general` par défaut). `Templates.tsx` et
> `PdfTemplates.tsx` sont désormais routées sous `/admin/templates/email` et `/admin/templates/pdf`
> (`/admin/email-templates` et `/admin/pdf-templates` redirigent). `LdapSync.tsx` est routée sous
> `/admin/ldap-sync` (`/admin/ldap` redirige). Voir [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)
> pour le détail des sous-pages.

| Page | Route | Rôle |
|------|-------|------|
| Login | `/login` | SSO Entra + login local |
| DashboardPage | `/dashboard` | À onglets : Aujourd'hui (IT seulement, contenu ex-DashboardIT), Parc, Délais, Incidents. Période (`from`/`to`) et filiale (`filialeId`) dans l'URL ; admin/technician/direction, direction arrive sur Parc |
| BonsList | `/bons` | Liste filtrable + export CSV + `useSearchParams` |
| BonCreate | `/bons/new` | Formulaire création (packs, catalogue, libre) |
| BonDetail | `/bons/:id` | Actions IT, cachet intégré (`PendingItAction`), PDF, renvoyer lien |
| SignaturePage | `/signer/:token` | Canvas signature collab (publique, SSO obligatoire) |
| PortailCollaborateur | `/mes-bons` | Bons perso, signer, contester, PDF |
| BonDetailCollaborateur | `/mes-bons/:id` | Détail bon pour collaborateur |
| Configuration (10 sous-pages) | `/admin/configuration/*` | Général (dont état de santé), LDAP, Entra (dont Groupe Direction), SMTP (avec tests), Rappels (dont seuil de retard), Tokens, SMB, Horodatage, Rétention, Monitoring (tâches planifiées) |
| LdapSync | `/admin/ldap-sync` | Statut sync + resync manuelle |
| Filiales | `/admin/filiales` | CRUD + upload (adresse, SIRET) + import/export CSV |
| Catalogue | `/admin/catalogue` | Items + packs + import/export CSV |
| Utilisateurs | `/admin/utilisateurs` | Liste users + sélecteur de rôle (admin, incl. Direction), désactivé sur sa propre ligne |
| AuditLogs | `/admin/audit` | Tableau paginé + filtres |
| Contestations | `/admin/contestations` | Workflow contestation |
| Templates | `/admin/templates/email` | Templates email (edit/preview/reset/export/import/test d'envoi) |
| PdfTemplates | `/admin/templates/pdf` | Templates PDF (4 types, couleurs/polices/marges/textes, preview) |

---

## 6. Sécurité — points critiques à ne pas oublier

### Chiffrement
- **Config sensible en DB** : `encrypted=true` sur chaque `AppConfig` → AES-256-GCM via `EncryptionService`
- **Signatures PNG** : chiffrées `.enc` sur disque dans `data/signatures/`
- **Clé maîtresse** : unique env var `ENCRYPTION_KEY` (64 hex) → **ne jamais changer** après 1er lancement
- **API GET config** : `maskSecrets: true` → renvoie `"••••••••"` au frontend, jamais le secret déchiffré
- **Frontend** : masquage côté client aussi (double protection), `onFocus` vide le champ masqué

### Auth
- **JWT httpOnly secure cookies** : access 15min (`path: /api`), refresh 8h (`path: /api/auth/refresh`)
- **Guards NestJS** : `@Roles('admin')`, `@Roles('admin', 'technician')`, `@UseGuards(JwtAuthGuard, RolesGuard)`
- **mustChangePassword enforced serveur** : `JwtAuthGuard.handleRequest()` retourne `403` pour tout endpoint sauf `/auth/change-password`, `/auth/logout`, `/auth/me`, `/auth/refresh`
- **SSO Entra ID** : vérification email obligatoire à la signature (sauf mode présentiel)
- **Visibilité bons** : collaborateur ne voit que les siens (filtre par email)
- **Login local** : `admin@local` / `admin` (bcrypt), désactivable dans config

### Rate limiting
- `@nestjs/throttler` : 10 req/60s sur `POST /api/signature/:token/sign` et `POST /api/bons/:id/sign-it`
- 5 req/60s sur `PATCH /api/filiales/:id/logo` et `PATCH /api/filiales/:id/stamp` (anti-DoS upload)
- Config globale : 60 req/60s

### CSRF
- Middleware `csrfMiddleware` dans `main.ts` : exige `X-Requested-With: XMLHttpRequest` sur tous les POST/PUT/PATCH/DELETE
- Exceptions : `POST /api/auth/callback` (OAuth state param) et `POST /api/auth/local-login`
- Frontend `api.ts` : header `CSRF_HEADER` ajouté à tous les appels fetch (y compris refresh et uploads FormData)
- **Ne jamais supprimer ce header** dans de nouveaux appels fetch frontend

### Validation des entrées
- **Tout endpoint `@Body()` doit utiliser un DTO** avec décorateurs `class-validator` (`@IsString`, `@IsUUID`, `@MaxLength`, `@IsIn`, etc.)
- **Jamais** `@Body('field') field: string` sans DTO pour les opérations d'écriture
- `passwordHash` jamais retourné dans les réponses API users → utiliser `safeSelect` dans `users.service.ts`
- Pagination plafonnée à 100 (`Math.min(limit, 100)`) pour les logs d'audit

### Upload fichiers
- **SVG interdit** : risque XSS stored. Multer accepte uniquement JPEG/PNG/GIF/WebP
- Anciens SVGs servis avec `Content-Disposition: attachment` pour bloquer l'exécution
- Rate limit 5/min sur les endpoints upload

### SMB / Export partage réseau
- `isSafeExportPath()` dans `smb.service.ts` valide que le chemin n'est pas un répertoire système (`/etc`, `/proc`, `/bin`, etc.)
- Toujours appeler avant écriture fichier
- **Tracking DB** : chaque export est suivi dans la table `smb_exports` (status: pending/success/failed)
- **Monitoring admin** : widget dans Configuration > SMB affiche total/succès/échecs/pending + relance manuelle
- **Retry cron** : `cronRetryFailedExports()` relance automatiquement les exports échoués (max 5 tentatives)
- **Alerte** : log `WARN` prominent quand 3+ échecs en 24h (throttle 1h)

### Accès aux données sensibles
- **Logs d'audit** : `@Roles('admin')` uniquement (pas technician)
- **Templates email** : lecture `@Roles('admin', 'technician')`, écriture/suppression `@Roles('admin')` uniquement
- **Config sensible** (entra/ldap/smtp/smb) : lecture `@Roles('admin')` uniquement

### Docker
- Images `node:22-alpine` (surface minimale)
- Backend : user non-root (`nestjs:nodejs`)
- Frontend : user non-root (`nginx-app`), port `8080`
- Backend + DB sur réseau Docker `internal`, non exposés sur l'hôte
- Seul le frontend est exposé (port configurable, défaut `5147:8080`)
- Healthchecks sur chaque container

### Variables d'environnement requises en production
```
ENCRYPTION_KEY=<openssl rand -hex 32>   # jamais changer après 1er lancement
JWT_SECRET=<openssl rand -hex 32>       # différent de ENCRYPTION_KEY
POSTGRES_PASSWORD=<openssl rand -base64 24>
FRONTEND_URL=https://bons.exemple.local
```

---

## 7. Décisions techniques à retenir

| Décision | Pourquoi |
|----------|----------|
| Canvas HTML5 natif (pas `react-signature-canvas`) | Conflits React 18 StrictMode, double rendu |
| `entry.attributes` (pas `entry.object`) dans ldapjs | `entry.object` n'est pas fiable, attributes retourne des arrays lowercase |
| PDF snapshots en `Bytes` PostgreSQL (pas sur disque) | Immuable, pas de désync fichier/DB, backup DB = backup PDF |
| Config en DB chiffrée (pas en `.env`) | Modifiable sans restart, sécurisée, administrable via UI |
| Cachet IT intégré dans les actions (pas bouton indépendant) | L'IT signe au moment de l'action, pas en brouillon |
| `pdfType` explicite dans `signItCachet()` | Le statut du bon n'est pas fiable pour déduire le type (ex: bon `active` → IT initie restitution) |
| Double rendu signature canvas (écran vs PDF) | Écran fin (`lineWidth=3`, couleur CSS) pour lisibilité ; export PDF épais (`lineWidth=6`, noir pur) via offscreen canvas replay — facteur de réduction PDF ~0.36 |
| Restitution partielle → reste `partially_returned` | Le collaborateur signe mais des équipements restent en attente ; `pv_cloture` uniquement pour archiver |
| `REMAINING_SECTION` dans email restitution | Section HTML conditionnelle : vide si restitution complète, affiche les équipements restants si partielle |
| Export CSV : BOM UTF-8 + séparateur `;` | Compatibilité Excel FR |
| `useSearchParams` pour filtres BonsList | Synchronisation URL ↔ filtres (navigation depuis dashboard) |
| Pas de `signed_mise_dispo` / `signed_restitution` dans l'enum | Le workflow va directement sent → active / sent → archived |
| `contested` dans BonStatus | Utilisé par ContestationModule (phase 5) |

---

## 8. Endpoints API — référence rapide

### Auth
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/auth/login` | - |
| `GET` | `/api/auth/callback` | - |
| `POST` | `/api/auth/refresh` | cookie |
| `POST` | `/api/auth/logout` | cookie |
| `GET` | `/api/auth/me` | JWT |
| `POST` | `/api/auth/local-login` | - |
| `GET` | `/api/auth/dev-login` | DEV only |

### Bons
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/bons/mes-bons` | collaborator+ |
| `POST` | `/api/bons/:id/contestation` | collaborator+ |
| `POST` | `/api/bons/:id/resend` | admin/technician |
| `POST` | `/api/bons/resend-batch` | admin/technician (body `{ ids, force? }`, 10 bons max par appel, 10 appels/min ; compte rendu par bon `sent`/`skipped`/`failed`) |
| `GET` | `/api/bons/stats` | admin/technician (+ `overdueThresholdDays`, seuil configurable via `rappels.signature_overdue_days`) |
| `GET` | `/api/bons/recent` | admin/technician |
| `GET` | `/api/bons/export` | admin/technician (mêmes filtres et tri que la liste, + `ids=a,b` pour une sélection, 100 max) |
| `GET` | `/api/bons?overdue=1` | admin/technician (`overdue=1` : en retard au-delà du seuil configuré) |
| `GET` | `/api/bons` | admin/technician — filtres `status`, `excludeStatus`, `filialeId`, `search`, `overdue`, `dateFrom`/`dateTo` (mise à disposition, AAAA-MM-JJ inclus), `noReturnDate`, `createdById`, `ids` ; tri `sort` ∈ `reference`, `dateMiseDisposition`, `createdAt`, `updatedAt`, `status`, `collaborateur`, `filiale` et `order` ∈ `asc`/`desc` (autre valeur → 400, départage par id) ; projection allégée (la fiche complète reste sur `/bons/:id`) |
| `GET` | `/api/bons/:id` | admin/technician |
| `GET` | `/api/bons/:id/notifications` | tous* (historique emails du bon) |
| `GET` | `/api/bons/:id/integrity` | tous* (vérif. sceaux HMAC) |
| `POST` | `/api/bons` | admin/technician |
| `PUT` | `/api/bons/:id` | admin/technician |
| `DELETE` | `/api/bons/:id` | admin/technician (refuse si déjà signé, cf. §4) |
| `POST` | `/api/bons/:id/send` | admin/technician (body `confirmSerialConflicts`, sinon `409` si conflit) |
| `POST` | `/api/bons/:id/initiate-restitution` | admin/technician |
| `POST` | `/api/bons/:id/initiate-inperson` | admin/technician (token 2h) |
| `POST` | `/api/bons/:id/close-unilateral` | admin/technician |
| `GET` | `/api/bons/:id/pdf-snapshots` | tous* |
| `GET` | `/api/bons/:id/pdf-snapshots/missing` | tous* (`{ missing }`, cf. §16) |
| `GET` | `/api/bons/:id/pdf` | admin/technician |
| `POST` | `/api/bons/:id/sign-it` | admin/technician |

`tous*` = admin, technician, collaborateur (accès restreint à ses propres bons).

### Reporting / Inventaire
> Module réduit à l'inventaire (lot 5, 2026-09-17) : `reporting.service.ts`/`reporting.controller.ts`
> et la route `/api/reports/*` sont supprimés. `/admin/reports` (frontend) redirige vers
> `/dashboard?tab=parc`.

| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/reporting/inventory` | admin/technician/direction |
| `GET` | `/api/reporting/inventory/summary` | admin/technician/direction |
| `GET` | `/api/reporting/inventory/by-collaborateur` | admin/technician/direction (répartition du parc prêté par collaborateur) |
| `GET` | `/api/reporting/inventory/export` | admin/technician/direction |

### KPI — Tableau de bord (2026-09-17)
> Cache 60 s, clé `kpi:<endpoint>:<from>:<to>:<filialeId|''>`, indépendante du rôle appelant.

| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/kpi/parc?from=&to=&filialeId=` | admin/technician/direction |
| `GET` | `/api/kpi/delais?from=&to=&filialeId=` | admin/technician/direction |
| `GET` | `/api/kpi/incidents?from=&to=&filialeId=` | admin/technician/direction |

`from`/`to` : `AAAA-MM-JJ` (Europe/Paris), défaut 30 derniers jours. `filialeId` : UUID optionnel.

### Signature
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/signature/:token` | JWT |
| `POST` | `/api/signature/:token/sign` | JWT + throttle |

### Admin
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/admin/config/:category` | admin/technician |
| `PUT` | `/api/admin/config/:category` | admin |
| `GET` | `/api/admin/config/health` | admin (état par rubrique — configuré/incomplet/désactivé/non configuré, aucun secret) |
| `POST` | `/api/admin/config/test/ldap` | admin |
| `POST` | `/api/admin/config/test/smtp` | admin |
| `POST` | `/api/admin/config/test/entra` | admin |
| `POST` | `/api/admin/config/test/smb` | admin |
| `GET` | `/api/admin/status` | admin (version/commit déployés, disponibilité DB, dernier passage de chaque tâche planifiée — `ScheduledJobRun`) |
| `GET` | `/api/admin/sso/diagnostic?limit=` | admin (dernières connexions SSO et rôle attribué) |
| `GET` | `/api/admin/ldap/status` | admin/technician |
| `POST` | `/api/admin/ldap/sync` | admin |
| `DELETE` | `/api/admin/ldap/users` | admin |
| `GET` | `/api/admin/smb/status` \| `/smb/failed` | admin |
| `POST` | `/api/admin/smb/retry/:id` \| `/smb/retry-all` | admin |
| `POST` | `/api/admin/users/:id/unlock` | admin |
| `PATCH` | `/api/admin/users/:id/role` | admin (refuse sur soi-même et sur le dernier admin actif ; audit `user_role_changed`) |
| `GET` | `/api/admin/notifications/failed?days=30` | admin (emails non délivrés, migré depuis l'ancien module Reporting) |
| `POST` | `/api/admin/pdf/regenerate-missing` | admin |
| `GET` | `/api/admin/retention/preview` \| `/retention/stats` | admin |
| `POST` | `/api/admin/retention/run` \| `/retention/purge` | admin |

### Audit
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/audit` | admin/technician |
| `GET` | `/api/audit/actions` | admin/technician |

### Contestations
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/contestations` | admin/technician (réponse inclut `openCount`) |
| `PATCH` | `/api/contestations/:id/review` | admin/technician |
| `PATCH` | `/api/contestations/:id/resolve` | admin/technician |

### Templates Email
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/admin/email-templates` | admin/technician |
| `GET` | `/api/admin/email-templates/export` | admin/technician |
| `POST` | `/api/admin/email-templates/import` | admin |
| `GET` | `/api/admin/email-templates/:id/html` | admin/technician |
| `GET` | `/api/admin/email-templates/:id/preview` | admin/technician |
| `PATCH` | `/api/admin/email-templates/:id` | admin |
| `DELETE` | `/api/admin/email-templates/:id` | admin (réinitialise au défaut) |
| `POST` | `/api/admin/email-templates/:id/test` | admin (envoi d'un email de test avec des variables d'exemple, ne crée ni ne modifie de bon) |

### Templates PDF
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/admin/pdf-templates` | admin/technician |
| `GET` | `/api/admin/pdf-templates/export` | admin/technician |
| `POST` | `/api/admin/pdf-templates/import` | admin |
| `GET` | `/api/admin/pdf-templates/:id/config` | admin/technician |
| `GET` | `/api/admin/pdf-templates/:id/preview` | admin/technician (10/min) |
| `PATCH` | `/api/admin/pdf-templates/:id` | admin |
| `DELETE` | `/api/admin/pdf-templates/:id` | admin |

### Autres
| Méthode | Route | Auth |
|---------|-------|------|
| `GET` | `/health` | - (toujours « ok », ne teste pas la base) |
| `GET` | `/health/ready` | - (sonde réelle : `SELECT 1` borné 2s, `503` si base injoignable) |
| CRUD | `/api/filiales` | auth (lecture) / admin, technician (écriture) / admin (suppression) |
| `GET` | `/api/filiales/export?images=1` | admin (CSV, BOM UTF-8, séparateur `;`) |
| `GET` | `/api/filiales/import/template` | admin (modèle CSV avec exemples) |
| `POST` | `/api/filiales/import` | admin (max 200 lignes) |
| CRUD | `/api/equipment` (catalogue + packs) | admin, technician (lecture et écriture, réservé — donnée IT interne) |
| `POST` | `/api/equipment/catalog/import` | admin, technician (import CSV en masse, max 500 lignes ; export CSV généré côté frontend depuis `GET /catalog`) |
| CRUD | `/api/users` (`?page=&limit=&search=` optionnel) | admin/technician |

---

## 9. Déploiement

### Architecture production
```
Internet → Nginx Proxy Manager (SSL:443)
               → host:5147
                    → [frontend nginx — SPA + proxy /api/*]
                         → backend:4000 (Docker internal)
                              → db:5432 (Docker internal)
```

### Variables d'environnement (3 obligatoires + 1 optionnelle)
| Var | Description |
|-----|-------------|
| `ENCRYPTION_KEY` | AES-256-GCM 64 hex — **immuable** |
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL |
| `FRONTEND_URL` | URL HTTPS publique (CORS + SSO + emails) |
| `FRONTEND_PORT` | Port hôte (défaut: 5147) |

### CI/CD (`.github/workflows/docker.yml`, images Node 22)
Sur push `main` ou tag `vX.Y.Z`, trois jobs conditionnent le build (jamais de tests rouges, de
typage en échec ou de schéma Prisma en dérive dans une image publiée) :
- **backend** : PostgreSQL réel en service, `prisma migrate deploy`, détection de dérive
  schéma/migrations (`prisma migrate diff`), `tsc --noEmit`, tests avec couverture, plus un
  filet `$queryRaw` contre une vraie base (casts d'enum, `GROUP BY`, fuseau — voir Style ci-dessus)
- **frontend** : `tsc --noEmit`, tests Vitest, build Vite
- **e2e** : Playwright (Chromium) contre la stack construite depuis les sources
  (`e2e/docker-compose.e2e.yml`), amorcée avec `e2e/seed/seed.sh`, attend `/api/health/ready`

Seulement si ces trois jobs passent, `build-and-push` publie les images
`ghcr.io/l4curtis/bonmiseadisposition-{backend,frontend}` : étiquette `main` (+ `latest`, alias à
retirer plus tard) sur push `main` (recette), étiquettes `X.Y.Z`/`X.Y` sur un tag `vX.Y.Z`
(préparation d'une mise en production manuelle, voir `deploy/README.md`).

### Premier lancement
1. Les migrations Prisma s'exécutent automatiquement (`prisma migrate deploy` dans le CMD du Dockerfile)
2. Le compte `admin@local` / `admin` est créé au démarrage si absent
3. Configurer LDAP + Entra + SMTP dans `/admin/configuration`
4. Créer les filiales + lancer la sync LDAP

### Environnement de développement local
`docker-compose.dev.yml` démarre uniquement **PostgreSQL et Mailpit** (faux serveur SMTP à
interface web, `http://localhost:8025`) en loopback — backend et frontend tournent sur le poste
(`npm run start:dev` / `npm run dev`). Tous les emails de dev atterrissent dans Mailpit, jamais
dans une vraie boîte. `backend/scripts/dev-scrub-secrets.js` assainit une base de dev qui
contiendrait par erreur de vrais secrets (SMTP, Entra, LDAP, SMB) : il les supprime, désactive
LDAP/SMB et repointe le SMTP vers Mailpit ; refuse de tourner hors `localhost`/`NODE_ENV=production`.
Détail complet : [README.md](README.md) (section « Environnement de développement »).

---

## 10. Fichiers clés à connaître

| Fichier | Pourquoi c'est important |
|---------|--------------------------|
| `backend/prisma/schema.prisma` | Schéma complet 18 modèles, source de vérité |
| `backend/src/bons/bons.service.ts` | Façade (jeton `BONS_SERVICE`) : délègue aux modules de `bons/workflow/`, `bons/queries/`, etc. |
| `backend/src/bons/bons.controller.ts` | 20+ routes, routing order important (`export` avant `:id`) |
| `backend/src/signature/signature.service.ts` | `signItCachet()` avec `pdfType` explicite, chiffrement PNG |
| `backend/src/config/config.service.ts` | `getAll(maskSecrets)`, cache, chiffrement |
| `backend/src/config/encryption.service.ts` | AES-256-GCM encrypt/decrypt |
| `backend/src/auth/auth.service.ts` | Façade MSAL/JWT/rôle : délègue à `role-mapping.ts`, `entra-sso.ts`, `local-login.ts`, `session-tokens.ts` |
| `backend/src/notification/notification.service.ts` | SMTP + cron rappels + contestation emails |
| `backend/src/monitoring/monitoring.service.ts` | `getAdminStatus()` : version/commit, DB, dernier passage des tâches planifiées |
| `frontend/src/pages/bons/BonDetail.tsx` | `PendingItAction` + `ItSignModal` (cachet intégré) |
| `frontend/src/pages/bons/BonsList.tsx` | `useSearchParams` filtrage URL |
| `frontend/src/types/index.ts` | `BonStatus` (8 valeurs), labels, couleurs |
| `frontend/src/lib/api.ts` | Client HTTP avec auto-refresh JWT |
| `docker-compose.prod.yml` | Deploy prod (images ghcr.io, port variable) |
| `.github/workflows/docker.yml` | CI/CD : tests backend/frontend/e2e puis build + push images |

---

## 11. Pièges connus et gotchas

| Piège | Solution |
|-------|----------|
| `entry.object` dans ldapjs | Utiliser `entry.attributes` (array lowercase) |
| `GET /api/bons/export` vs `GET /api/bons/:id` | `export` doit être déclaré AVANT `:id` dans le controller NestJS |
| `react-signature-canvas` avec React 18 StrictMode | Remplacé par Canvas HTML5 natif (`useSignatureCanvas` hook) |
| Prisma `_count` sur relations | Utiliser `include: { _count: { select: { bons: true } } }` |
| Docker image tag uppercase | `github.repository_owner` → `tr '[:upper:]' '[:lower:]'` |
| CSV Excel FR | BOM `\uFEFF` + séparateur `;` + guillemets doubles RFC 4180 |
| JWT cookie en prod | `httpOnly: true, secure: true, sameSite: 'lax'` |
| Puppeteer dans Docker Alpine | Installer Chromium via apk + `--no-sandbox` |
| `ENCRYPTION_KEY` changée | Toutes les données chiffrées sont perdues (config DB + signatures PNG) |
| Config LDAP `bind_password` dans la réponse API | `maskSecrets: true` dans `getAll()` |
| Double `@nestjs/throttler` : `@UseGuards(ThrottlerGuard)` sur une méthode en plus du guard global | Double comptage des requêtes contre le même quota → `429` prématurés. Un seul `ThrottlerGuard` global (`APP_GUARD`) ; ajuster une route via `@Throttle(...)` uniquement, jamais un guard supplémentaire |
| Champ secret masqué renvoyé vide par le front (focus sans modification) | Écraserait silencieusement un secret existant si on l'écrivait tel quel. `bulkSetConfig` ignore une clé chiffrée reçue vide (`admin.service.ts`) |
| PDFKit `doc.text()` avec le comportement par défaut (`lineBreak: true`) sur du texte destiné à tenir sur une seule ligne | Le texte peut déborder sur la ligne suivante et chevaucher le contenu qui suit. Passer `lineBreak: false` pour les libellés à une ligne (ex. user-agent tronqué) |
| Polices standard PDFKit (Helvetica, AFM) | Rendu incomplet des caractères hors jeu de base. Polices DejaVu Sans (regular + bold) embarquées dans `backend/src/pdf/fonts/` pour un rendu Unicode complet |
| `mkdir({ recursive: true })` sur la racine d'un export SMB | Créerait silencieusement un dossier local dans le conteneur si le partage réseau n'est pas monté, et l'export « réussirait » sans rien écrire sur le partage réel. La racine doit déjà exister (`fs.existsSync`) ; seuls les sous-dossiers (filiale/année/bon) sont créés à la volée |
| Déduire un état métier (ex. « PV en attente ») de la simple existence d'une ligne `Signature` non signée | Cette ligne peut être purgée par la rétention (`purgeExpiredTokens`, tokens expirés) indépendamment du statut du bon. Dériver l'état des champs métier réels (`BonEquipment.returnedAt`/`notReturned`), comme le fait `emitPvClotureIfDue` |
| Comparer une colonne enum (`b.status`, `s.type`, `nl.type`, `nl.status`, `c.status`, `ec.category`) à un paramètre texte dans un `$queryRaw` | Postgres refuse (`operator does not exist: "BonStatus" = text`, bug réel déjà rencontré, commit `a19ea00`). Caster systématiquement en `::text` côté colonne |
| `AVG`, `EXTRACT(EPOCH ...)`, `percentile_cont` dans un `$queryRaw` sans cast | Prisma renvoie un `Decimal` (non sérialisable proprement en JSON). Caster en `::float8` |
| `COUNT(*)` dans un `$queryRaw` | Renvoie un `bigint` (`5n`), non sérialisable en JSON tel quel. Convertir avec `Number()` avant de renvoyer la réponse |
| Écrire `colonne AT TIME ZONE 'Europe/Paris'` directement sur une colonne Prisma (`timestamp` SANS fuseau, valeurs stockées en UTC) | Postgres relit les chiffres UTC comme s'ils étaient déjà une heure de Paris (décalage d'1-2h, bug réel corrigé au commit `f1e3e35`). Toujours passer par les fragments de `backend/src/kpi/kpi-sql.ts` (bornes ramenées en UTC naïf, buckets convertis explicitement depuis UTC) |
| Recalculer une définition de « retard de signature » ou d'« équipement prêt » dans un nouveau service | Trois définitions divergentes existaient avant l'unification (dashboard IT, Reporting, Inventaire). Utiliser exclusivement `backend/src/common/bon-predicates.ts` (`buildOverdueSignatureWhere`/`overdueSignatureSql`, `buildLoanedEquipmentWhere`/`loanedEquipmentSql`) |
| `ALTER TYPE ... ADD VALUE` dans la même migration qu'une instruction qui utilise la nouvelle valeur | Postgres l'interdit dans la même transaction (« unsafe use of new value of enum type »). La migration `20260916110000_user_role_direction` ne contient QUE cette instruction ; toute utilisation de `'direction'` vit dans une migration postérieure |
| Interroger `/api/kpi/*` en boucle rapprochée en attendant un changement de configuration (ex. seuil de retard) | Réponse mise en cache serveur 60 s par clé `kpi:<endpoint>:<from>:<to>:<filialeId|''>` : le changement n'est visible qu'après expiration du cache |
| Tester un composant Recharts (`TimeSeriesChart`, `DonutChart`, `HorizontalBars`) sous Vitest/jsdom sans mock | `ResponsiveContainer` mesure un conteneur DOM réel (largeur/hauteur 0 en jsdom) et ne rend rien. Mocker `ResponsiveContainer` dans le test |

---

- **Le cachet IT s'appose sur un brouillon** : le flux « Envoyer » de la fiche pose le cachet
  IT puis envoie ; refuser le cachet sur un bon `draft` côté backend bloque tout envoi depuis
  l'interface (régression vécue le 2026-09-17). Seuls `cancelled` / `archived` / `contested`
  sont refusés.
- **Audit `*_partial` = marqueur supplémentaire** : `declare_not_returned` et `mark_found` sont
  toujours journalisés ; `declare_not_returned_partial` / `mark_found_partial` s'ajoutent quand
  des équipements restent à traiter. Un compteur ne doit retenir que l'action de base.
- **Thème sombre** : n'utiliser que les couleurs sémantiques (`bg-card`, `text-muted-foreground`,
  `bg-destructive/10`, `border-input`…) ; une couleur de palette (`bg-red-50`, `bg-white`,
  `text-gray-700`) sans variante `dark:` produit un fond clair en sombre. Exceptions voulues :
  le fond blanc du QR code et le bouton de bascule. Vérification : Playwright headless avec le
  thème forcé (`localStorage.theme = 'dark'`) et inspection des `backgroundColor` calculées.
- **Chemin SMB en UNC depuis un conteneur Linux** : `\serveur\partage` n'est pas accessible
  dans le conteneur ; le partage doit être monté (volume CIFS) et `smb.path` pointer sur le
  chemin du conteneur (ex. `/mnt/export`). Un chemin absent est tracé en échec dans le
  monitoring, jamais créé localement.
- **URL publique des emails** : `general.app_url` puis repli `FRONTEND_URL` (env), même ordre
  que l'authentification et que le pré-remplissage de la page d'administration. Une garde qui
  ne lit que la base bloque tous les emails à lien sur une instance pourtant configurée
  (régression vécue le 2026-09-17).

## 12. Phase 6 — Sécurité et Hardening (Complète)

**Statut** : Tout implémenté (2026-03-21)

10 vulnérabilités critiques/haute corrigées :
- SEC-01 : IDOR contestations (verifyCollaboratorAccess)
- SEC-02 : LDAP injection (validation filtre syntaxique)
- SEC-03 : IP spoofing (X-Real-IP nginx)
- SEC-04 : Rate limit refresh (20/min)
- SEC-06 : Password policy (12+ chars, spécial, max 128)
- SEC-07 : Brute force (30 min lockout après 10 échecs)
- SEC-08 : Config admin restreint à admin (entra/ldap/smtp/smb)
- SEC-10 : CSP renforcée (frame-ancestors, connect-src)
- SEC-14 : HSTS (1 an)
- SEC-16 : Audit trail (login/logout/password)

Voir **docs/phase6-security.md** pour détails complets.

---

## 13. Évolutions futures envisagées

- Intégration GLPI (pré-remplir équipements depuis inventaire)
- Signature qualifiée (Yousign)
- PWA (meilleure UX mobile à la signature)
- Notifications Teams (webhook)
- QR Code sur le bon imprimé
- Dashboard Grafana
- Archivage légal (coffre-fort numérique)
- Multi-langue
- Signature par lot
- JWT revocation avec Redis (SEC-05 optionnel)

---

## 14. Système de notifications (toasts) — comment ça fonctionne

Les notifications visuelles dans l'app sont des **toasts** (bandeaux bas-droite, durée 3s).

### Où c'est implémenté
- **Hook** : `frontend/src/hooks/use-toast.ts` — state global, file d'attente, `dismiss()` après 3000ms
- **Composant** : `frontend/src/components/ui/toaster.tsx` — rendu, provider `duration={3000}`
- **Appel** : `import { toast } from '@/hooks/use-toast'`

### Variantes disponibles
```typescript
toast({ title: 'Succès', description: 'Message détaillé.', variant: 'success' })   // vert
toast({ title: 'Erreur', description: 'Ce qui a foiré.', variant: 'destructive' }) // rouge
toast({ title: 'Info', description: 'Info neutre.' })                              // neutre
```

### Convention dans le code
- **Succès** : `variant: 'success'` — confirmation création/sauvegarde/envoi
- **Erreur** : `variant: 'destructive'` — échec API, validation, permission
- **Neutre** : sans variant — info non critique

### Points importants
- Durée fixe 3s (non modifiable par composant)
- Pas de toast bloquant (pas de `confirm()`) — pour les actions destructives, utiliser `<ConfirmModal>`
- `ConfirmModal` : `frontend/src/pages/bons/detail/ConfirmModal.tsx` — modal avec bouton "Confirmer" + prop `danger` pour rouge
- **Ne pas abuser** : 1 toast par action utilisateur maximum

---

## 15. Panneau audit — fonctionnement et conventions

### But
Tracer toutes les actions significatives sur les bons, les connexions et les opérations admin.

### Accès
- Route : `/admin/audit`
- Auth : `@Roles('admin')` uniquement (pas les techniciens)
- Composant frontend : `frontend/src/pages/admin/AuditLogs.tsx`
- Endpoint : `GET /api/audit?page=&limit=&userEmail=&action=&dateFrom=&dateTo=`

### Structure d'un log d'audit (modèle `AuditLog`)
| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant |
| `action` | string | Code action (voir liste ci-dessous) |
| `userId` | UUID? | ID utilisateur authentifié (null si anonyme) |
| `userEmail` | string? | Email brut (pour login_failed sans userId) |
| `bonId` | UUID? | ID du bon concerné (null si action auth) |
| `ipAddress` | string? | IP réelle du client |
| `userAgent` | string? | User-agent navigateur |
| `details` | JSON? | Données contextuelles libres |
| `createdAt` | DateTime | Timestamp auto |

### Actions auditées — liste complète
**Auth :**
- `login_sso` — connexion via Entra ID (SSO)
- `login_local_success` — connexion locale réussie
- `login_local_failed` — tentative de connexion échouée (brute-force)
- `logout` — déconnexion
- `password_changed` — changement de mot de passe

**Bons — cycle de vie :**
- `bon_created` — création d'un bon (brouillon)
- `bon_sent` — bon envoyé au collaborateur (1er envoi)
- `bon_cancelled` — bon annulé
- `restitution_initiated` — restitution initiée par IT
- `declare_not_returned` — matériel déclaré non rendu
- `mark_found` — matériel retrouvé
- `reminder_sent` — lien de signature renvoyé manuellement

**Signatures :**
- `signed_it_cachet` — cachet IT apposé
- `signed_mise_disposition` — collaborateur a signé la mise à disposition
- `signed_restitution` — collaborateur a signé la restitution
- `signed_pv_cloture` — collaborateur a signé le PV de clôture

**Contestations :**
- `bon_contested` — collaborateur a créé une contestation
- `contestation_resolved` — contestation acceptée par IT
- `contestation_rejected` — contestation refusée par IT

**Admin (pas encore loguée — à implémenter) :**
- `config_updated` — configuration modifiée dans le panneau admin
- `ldap_sync` — synchronisation LDAP manuelle déclenchée

### Comment créer un audit log dans le backend
```typescript
await this.prisma.auditLog.create({
  data: {
    bonId: id,          // optionnel
    userId: user.id,    // optionnel si anonyme
    action: 'nom_action',
    details: { key: 'value' },  // optionnel, contexte
    ipAddress: ip,      // optionnel
  },
});
```

### Règles de nommage des actions
- Format `snake_case` exclusivement
- Préfixe par entité : `bon_`, `signed_`, `login_`, `contestation_`, etc.
- Pas de majuscules, pas de tirets
- Toujours ajouter le label correspondant dans `ACTION_LABELS` (`AuditLogs.tsx`) après chaque nouvelle action

### Filtres disponibles dans l'interface
- Par email utilisateur (recherche partielle)
- Par type d'action (dropdown, alimenté dynamiquement depuis `/api/audit/actions`)
- Par plage de dates (from / to)
- Pagination : 50 par page

---

## 16. Mise à jour pré-production (2026-09-16)

Revue complète pré-livraison : sécurité (verrouillage composite compte+IP, garde-fou sync LDAP,
plancher RGPD 60 mois avec dry-run obligatoire), machine à états des bons corrigée (PV dérivé
de l'état métier, annulation interdite après signature), et deux nouvelles fonctionnalités :

- **Vue Inventaire** (`/inventaire`, `GET /api/reporting/inventory*`) : parc d'équipements
  actuellement chez les collaborateurs, filtrable et exportable en CSV.
- **Rappel avant restitution** : cron quotidien, config `rappels.restitution_before_days`
  (défaut 7 jours), template email `restitution_due_reminder`.

Également : historique des emails par bon (`GET /bons/:id/notifications`), régénération des
PDF manquants (`POST /admin/pdf/regenerate-missing`), purge indépendante des pièces jointes
(`retention.attachment_months`), cachet de filiale et numéros de ligne optionnels sur le PDF,
police Unicode embarquée (DejaVu Sans), 6 migrations Prisma (dont 2 qui échouent
volontairement en cas de doublons — voir [README.md](README.md)).

Détail complet des ~40 corrections par domaine : [CHANGELOG.md](CHANGELOG.md). Règles de
sécurité à jour : [docs/security.md](docs/security.md).

---

## 17. Tableau de bord KPI et rôle Direction (2026-09-17)

Remplacement du tableau de bord IT et fusion de la page Reporting dans une page unique à
onglets (`/dashboard` : Aujourd'hui, Parc, Délais, Incidents), et ouverture en lecture seule
au nouveau rôle Direction. Voir §1 (rôle), §3 (module `kpi`), §5 (page), §8 (endpoints) et §11
(pièges) ci-dessus pour le détail.

- **Nouvelles clés de configuration** : `rappels.signature_overdue_days` (seuil de retard de
  signature, défaut 7, minimum 1 — remplace la constante fixe historique) et
  `entra.direction_group_id` (groupe Entra attribué au rôle Direction).
- **2 nouvelles migrations Prisma**, toutes deux idempotentes (`ADD VALUE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`) : `20260916110000_user_role_direction` (valeur d'enum) et
  `20260916110100_kpi_indexes` (9 index pour les agrégats du tableau de bord).
- **Retrait** : `reporting.service.ts`/`reporting.controller.ts` supprimés ; `/admin/reports`
  redirige vers `/dashboard?tab=parc`.

Détail complet : [CHANGELOG.md](CHANGELOG.md) (entrée du 2026-09-17).

---

## 18. Repo et liens

- **GitHub** : https://github.com/L4Curtis/bonmiseadisposition
- **Images Docker** : `ghcr.io/l4curtis/bonmiseadisposition-backend:latest` / `frontend:latest`
- **Doc détaillée** : `projet_bon_de_mise_a_disposition.md`
- **Doc phases** : `docs/phase1.md` à `docs/phase5.md`
- **CI/CD** : `.github/workflows/docker.yml`
