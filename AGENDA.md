# AGENDA — Contexte complet pour le developpement futur

> Ce fichier sert de memoire de travail. Il contient tout ce qu'il faut savoir pour reprendre le developpement sans relire toute la doc.
> Pour le detail exhaustif, voir `projet_bon_de_mise_a_disposition.md` et `docs/phase*.md`.

---

## 1. Qu'est-ce que ce projet

Application web interne multi-filiales qui remplace les bons papier de mise a disposition et restitution de materiel IT.

**Cycle de vie d'un bon :**
```
Technicien cree le bon → appose son cachet IT → envoie au collaborateur
→ collaborateur signe via SSO → bon actif
→ technicien initie la restitution → cachet IT → collaborateur signe
→ bon archive avec 2 PDF snapshots immuables
```

**Utilisateurs :**
- Equipe IT (admin, technician) : cree les bons, gere tout
- Direction (lecture seule, depuis le 2026-09-17) : tableau de bord KPI (sauf onglet Aujourd'hui) et inventaire du parc pret ; aucun acces aux bons individuels, aux utilisateurs ni a l'administration. Attribution par groupe Entra dedie (`entra.direction_group_id`) : comme pour admin/technician, le groupe Entra fait foi et ecrase le role a **chaque** connexion SSO, sans exception. Attribution manuelle possible depuis Utilisateurs (`PATCH /admin/users/:id/role`, reserve admin) — durable uniquement pour un compte local ; pour un compte SSO, elle est ecrasee des la prochaine connexion si le compte n'est pas dans le groupe configure.
- Collaborateurs : signent, consultent leur portail, contestent

---

## 2. Stack technique

| Couche | Techno | Version |
|--------|--------|---------|
| Backend | NestJS + TypeScript | Node 20 |
| Frontend | React + TypeScript + Vite | React 18 |
| Base de donnees | PostgreSQL | 16 |
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
| Deploy | Docker Compose + Portainer | images pre-buildees |
| SSL | Nginx Proxy Manager (externe) | pas dans le container |

---

## 3. Architecture backend — 18 modules NestJS (enregistres dans `AppModule`)

| Module | Fichiers | Role |
|--------|----------|------|
| `PrismaModule` | module + service | Connexion DB |
| `ConfigModule` | module + service + encryption | Config chiffree en DB, cache TTL 5min |
| `TemplatesModule` | module (`@Global`) + service | 9 templates email personnalisables, rendu par variables `{{...}}` |
| `AuthModule` | module + service + controller + guards + decorators + strategy | SSO Entra + login local + JWT |
| `AdminModule` | module + service + controller | CRUD config, tests connexion, monitoring SMB, changement de role utilisateur |
| `LdapModule` | module + service | Sync AD, cron 6h, `entry.attributes` |
| `FilialesModule` | module + service + controller + dto | CRUD filiales + upload logo/cachet |
| `EquipmentModule` | module + service + controller + dto | Catalogue + packs |
| `UsersModule` | module + service + controller | Liste + autocomplete |
| `NotificationModule` | module + service | SMTP + cron rappels + logs |
| `SignatureModule` | module + service + controller + dto | Sign collab + cachet IT + chiffrement PNG |
| `BonsModule` | module + service + controller + dto | CRUD bons, stats, export CSV, resend |
| `AuditModule` | module + service + controller | Logs d'audit pagines |
| `ContestationModule` | module + service + controller | Workflow contestation collab |
| `AttachmentsModule` | module + service + controller | Pieces jointes (upload/telechargement/suppression), purge par anciennete |
| `RetentionModule` | module + service | Anonymisation RGPD (plancher 60 mois, dry-run obligatoire), purge tokens/audit/pieces jointes |
| `ReportingModule` | module + controller + service | **Reduit a l'inventaire** (`reporting.service.ts`/`reporting.controller.ts` supprimes, lot 5) : parc pret filtrable, export CSV |
| `KpiModule` | module + controller + 3 services + cache + dto | **Nouveau** — Tableau de bord KPI : `GET /kpi/parc\|delais\|incidents` (admin, technician, direction), cache 60 s |

Modules imbriques (importes par un module ci-dessus, pas directement par `AppModule`) : `PdfModule`
(PDFKit, templates PDF, snapshots — importe par Bons/Signature/Admin), `SmbModule` (export reseau —
importe par Admin). `HealthController` : controller standalone, `GET /health`.

**51 fichiers TypeScript backend, 32 fichiers frontend, ~5000 lignes total** (avant l'ajout du
module KPI et du tableau de bord — voir [CHANGELOG.md](CHANGELOG.md) pour le detail).

---

## 4. Modele de donnees — 17 modeles Prisma

```
AppConfig, User, Filiale, EquipmentCatalog, EquipmentPack, EquipmentPackItem,
Bon, BonEquipment, Signature, Attachment, ProofArchive, PdfSnapshot, SmbExport,
Contestation, NotificationLog, AuditLog, RevokedToken
+ enums : BonStatus, UserRole, Civilite, EquipmentCategory, SignatureType,
          PdfSnapshotType, SmbExportStatus, ContestationStatus, NotificationType,
          NotificationStatus
```

**BonStatus (8 valeurs) :**
`draft` → `sent_mise_dispo` → `active` → `sent_restitution` → `archived` | `partially_returned` | `cancelled` | `contested`

> Pas d'etat intermediaire `signed_*` — le bon passe directement de `sent_mise_dispo` a `active`.
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

> **2026-09-17** : `DashboardIT.tsx` et la page admin `Reports.tsx` sont supprimees, remplacees
> par `pages/dashboard/DashboardPage.tsx` (voir ci-dessous). `/admin/reports` redirige vers
> `/dashboard?tab=parc`.

| Page | Route | Role |
|------|-------|------|
| Login | `/login` | SSO Entra + login local |
| DashboardPage | `/dashboard` | A onglets : Aujourd'hui (IT seulement, contenu ex-DashboardIT), Parc, Delais, Incidents. Periode (`from`/`to`) et filiale (`filialeId`) dans l'URL ; admin/technician/direction, direction arrive sur Parc |
| BonsList | `/bons` | Liste filtrable + export CSV + `useSearchParams` |
| BonCreate | `/bons/new` | Formulaire creation (packs, catalogue, libre) |
| BonDetail | `/bons/:id` | Actions IT, cachet integre (`PendingItAction`), PDF, renvoyer lien |
| SignaturePage | `/signer/:token` | Canvas signature collab (publique, SSO obligatoire) |
| PortailCollaborateur | `/mes-bons` | Bons perso, signer, contester, PDF |
| BonDetailCollaborateur | `/mes-bons/:id` | Detail bon pour collaborateur |
| Configuration | `/admin/configuration` | LDAP, Entra (dont Groupe Direction), SMTP (avec tests), Rappels (dont seuil de retard) |
| LdapSync | `/admin/ldap` | Statut sync + resync manuelle |
| Filiales | `/admin/filiales` | CRUD + upload (adresse, SIRET) |
| Catalogue | `/admin/catalogue` | Items + packs |
| Utilisateurs | `/admin/utilisateurs` | Liste users + selecteur de role (admin, incl. Direction), desactive sur sa propre ligne |
| AuditLogs | `/admin/audit` | Tableau pagine + filtres |
| Contestations | `/admin/contestations` | Workflow contestation |
| Templates | `/admin/email-templates` | Templates email (edit/preview/reset/export/import) |
| PdfTemplates | `/admin/pdf-templates` | Templates PDF (4 types, couleurs/polices/marges/textes, preview) |

---

## 6. Securite — points critiques a ne pas oublier

### Chiffrement
- **Config sensible en DB** : `encrypted=true` sur chaque `AppConfig` → AES-256-GCM via `EncryptionService`
- **Signatures PNG** : chiffrees `.enc` sur disque dans `data/signatures/`
- **Cle maitre** : unique env var `ENCRYPTION_KEY` (64 hex) → **ne jamais changer** apres 1er lancement
- **API GET config** : `maskSecrets: true` → renvoie `"••••••••"` au frontend, jamais le secret dechiffre
- **Frontend** : masquage cote client aussi (double protection), `onFocus` vide le champ masque

### Auth
- **JWT httpOnly secure cookies** : access 15min (`path: /api`), refresh 8h (`path: /api/auth/refresh`)
- **Guards NestJS** : `@Roles('admin')`, `@Roles('admin', 'technician')`, `@UseGuards(JwtAuthGuard, RolesGuard)`
- **mustChangePassword enforced serveur** : `JwtAuthGuard.handleRequest()` retourne `403` pour tout endpoint sauf `/auth/change-password`, `/auth/logout`, `/auth/me`, `/auth/refresh`
- **SSO Entra ID** : verification email obligatoire a la signature (sauf mode presentiel)
- **Visibilite bons** : collaborateur ne voit que les siens (filtre par email)
- **Login local** : `admin@local` / `admin` (bcrypt), desactivable dans config

### Rate limiting
- `@nestjs/throttler` : 10 req/60s sur `POST /api/signature/:token/sign` et `POST /api/bons/:id/sign-it`
- 5 req/60s sur `PATCH /api/filiales/:id/logo` et `PATCH /api/filiales/:id/stamp` (anti-DoS upload)
- Config globale : 60 req/60s

### CSRF
- Middleware `csrfMiddleware` dans `main.ts` : exige `X-Requested-With: XMLHttpRequest` sur tous les POST/PUT/PATCH/DELETE
- Exceptions : `POST /api/auth/callback` (OAuth state param) et `POST /api/auth/local-login`
- Frontend `api.ts` : header `CSRF_HEADER` ajouté a tous les appels fetch (y compris refresh et uploads FormData)
- **Ne jamais supprimer ce header** dans de nouveaux appels fetch frontend

### Validation des entrees
- **Tout endpoint `@Body()` doit utiliser un DTO** avec decorateurs `class-validator` (`@IsString`, `@IsUUID`, `@MaxLength`, `@IsIn`, etc.)
- **Jamais** `@Body('field') field: string` sans DTO pour les operations d'ecriture
- `passwordHash` jamais retourné dans les reponses API users → utiliser `safeSelect` dans `users.service.ts`
- Pagination plafonnee a 100 (`Math.min(limit, 100)`) pour les logs d'audit

### Upload fichiers
- **SVG interdit** : risque XSS stored. Multer accepte uniquement JPEG/PNG/GIF/WebP
- Anciens SVGs servis avec `Content-Disposition: attachment` pour bloquer l'execution
- Rate limit 5/min sur les endpoints upload

### SMB / Export partage reseau
- `isSafeExportPath()` dans `smb.service.ts` valide que le chemin n'est pas un repertoire systeme (`/etc`, `/proc`, `/bin`, etc.)
- Toujours appeler avant ecriture fichier
- **Tracking DB** : chaque export est suivi dans la table `smb_exports` (status: pending/success/failed)
- **Monitoring admin** : widget dans Configuration > SMB affiche total/succes/echecs/pending + relance manuelle
- **Retry cron** : `cronRetryFailedExports()` relance automatiquement les exports echoues (max 5 tentatives)
- **Alerte** : log `WARN` prominent quand 3+ echecs en 24h (throttle 1h)

### Acces aux donnees sensibles
- **Logs d'audit** : `@Roles('admin')` uniquement (pas technician)
- **Templates email** : lecture `@Roles('admin', 'technician')`, ecriture/suppression `@Roles('admin')` uniquement
- **Config sensible** (entra/ldap/smtp/smb) : lecture `@Roles('admin')` uniquement

### Docker
- Images `node:20-alpine` (surface minimale)
- Backend : user non-root (`nestjs:nodejs`)
- Frontend : user non-root (`nginx-app`), port `8080`
- Backend + DB sur reseau Docker `internal`, non exposes sur l'hote
- Seul le frontend est expose (port configurable, defaut `5147:8080`)
- Healthchecks sur chaque container

### Variables d'environnement requises en production
```
ENCRYPTION_KEY=<openssl rand -hex 32>   # jamais changer apres 1er lancement
JWT_SECRET=<openssl rand -hex 32>       # different de ENCRYPTION_KEY
POSTGRES_PASSWORD=<openssl rand -base64 24>
FRONTEND_URL=https://bons.exemple.local
```

---

## 7. Decisions techniques a retenir

| Decision | Pourquoi |
|----------|----------|
| Canvas HTML5 natif (pas `react-signature-canvas`) | Conflits React 18 StrictMode, double rendu |
| `entry.attributes` (pas `entry.object`) dans ldapjs | `entry.object` n'est pas fiable, attributes retourne des arrays lowercase |
| PDF snapshots en `Bytes` PostgreSQL (pas sur disque) | Immuable, pas de desync fichier/DB, backup DB = backup PDF |
| Config en DB chiffree (pas en `.env`) | Modifiable sans restart, securisee, administrable via UI |
| Cachet IT integre dans les actions (pas bouton independant) | L'IT signe au moment de l'action, pas en brouillon |
| `pdfType` explicite dans `signItCachet()` | Le statut du bon n'est pas fiable pour deduire le type (ex: bon `active` → IT initie restitution) |
| Double rendu signature canvas (écran vs PDF) | Écran fin (`lineWidth=3`, couleur CSS) pour lisibilité ; export PDF épais (`lineWidth=6`, noir pur) via offscreen canvas replay — facteur de réduction PDF ~0.36 |
| Restitution partielle → reste `partially_returned` | Le collaborateur signe mais des équipements restent en attente ; `pv_cloture` uniquement pour archiver |
| `REMAINING_SECTION` dans email restitution | Section HTML conditionnelle : vide si restitution complète, affiche les équipements restants si partielle |
| Export CSV : BOM UTF-8 + separateur `;` | Compatibilite Excel FR |
| `useSearchParams` pour filtres BonsList | Synchronisation URL ↔ filtres (navigation depuis dashboard) |
| Pas de `signed_mise_dispo` / `signed_restitution` dans l'enum | Le workflow va directement sent → active / sent → archived |
| `contested` dans BonStatus | Utilise par ContestationModule (phase 5) |

---

## 8. Endpoints API — reference rapide

### Auth
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/auth/login` | - |
| `GET` | `/api/auth/callback` | - |
| `POST` | `/api/auth/refresh` | cookie |
| `POST` | `/api/auth/logout` | cookie |
| `GET` | `/api/auth/me` | JWT |
| `POST` | `/api/auth/local-login` | - |
| `GET` | `/api/auth/dev-login` | DEV only |

### Bons
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/bons/mes-bons` | collaborator+ |
| `POST` | `/api/bons/:id/contestation` | collaborator+ |
| `POST` | `/api/bons/:id/resend` | admin/technician |
| `GET` | `/api/bons/stats` | admin/technician (+ `overdueThresholdDays`, seuil configurable via `rappels.signature_overdue_days`) |
| `GET` | `/api/bons/recent` | admin/technician |
| `GET` | `/api/bons/export` | admin/technician |
| `GET` | `/api/bons?overdue=1` | admin/technician (`overdue=1` : en retard > 7 j) |
| `GET` | `/api/bons` | admin/technician |
| `GET` | `/api/bons/:id` | admin/technician |
| `GET` | `/api/bons/:id/notifications` | tous* (historique emails du bon) |
| `GET` | `/api/bons/:id/integrity` | tous* (verif sceaux HMAC) |
| `POST` | `/api/bons` | admin/technician |
| `PUT` | `/api/bons/:id` | admin/technician |
| `DELETE` | `/api/bons/:id` | admin/technician (refuse si deja signe, cf. §4) |
| `POST` | `/api/bons/:id/send` | admin/technician (body `confirmSerialConflicts`, sinon `409` si conflit) |
| `POST` | `/api/bons/:id/initiate-restitution` | admin/technician |
| `POST` | `/api/bons/:id/initiate-inperson` | admin/technician (token 2h) |
| `POST` | `/api/bons/:id/close-unilateral` | admin/technician |
| `GET` | `/api/bons/:id/pdf-snapshots` | tous* |
| `GET` | `/api/bons/:id/pdf-snapshots/missing` | tous* (`{ missing }`, cf. §16) |
| `GET` | `/api/bons/:id/pdf` | admin/technician |
| `POST` | `/api/bons/:id/sign-it` | admin/technician |

`tous*` = admin, technician, collaborateur (acces restreint a ses propres bons).

### Reporting / Inventaire
> Module reduit a l'inventaire (lot 5, 2026-09-17) : `reporting.service.ts`/`reporting.controller.ts`
> et la route `/api/reports/*` sont supprimes. `/admin/reports` (frontend) redirige vers
> `/dashboard?tab=parc`.

| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/reporting/inventory` | admin/technician/direction |
| `GET` | `/api/reporting/inventory/summary` | admin/technician/direction |
| `GET` | `/api/reporting/inventory/export` | admin/technician/direction |

### KPI — Tableau de bord (2026-09-17)
> Cache 60 s, cle `kpi:<endpoint>:<from>:<to>:<filialeId|''>`, independante du role appelant.

| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/kpi/parc?from=&to=&filialeId=` | admin/technician/direction |
| `GET` | `/api/kpi/delais?from=&to=&filialeId=` | admin/technician/direction |
| `GET` | `/api/kpi/incidents?from=&to=&filialeId=` | admin/technician/direction |

`from`/`to` : `AAAA-MM-JJ` (Europe/Paris), defaut 30 derniers jours. `filialeId` : UUID optionnel.

### Signature
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/signature/:token` | JWT |
| `POST` | `/api/signature/:token/sign` | JWT + throttle |

### Admin
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/admin/config/:category` | admin/technician |
| `PUT` | `/api/admin/config/:category` | admin |
| `POST` | `/api/admin/config/test/ldap` | admin |
| `POST` | `/api/admin/config/test/smtp` | admin |
| `POST` | `/api/admin/config/test/entra` | admin |
| `GET` | `/api/admin/ldap/status` | admin/technician |
| `POST` | `/api/admin/ldap/sync` | admin |
| `DELETE` | `/api/admin/ldap/users` | admin |
| `POST` | `/api/admin/users/:id/unlock` | admin |
| `PATCH` | `/api/admin/users/:id/role` | admin (refuse sur soi-meme et sur le dernier admin actif ; audit `user_role_changed`) |
| `GET` | `/api/admin/notifications/failed?days=30` | admin (emails non delivres, migre depuis l'ancien module Reporting) |
| `POST` | `/api/admin/pdf/regenerate-missing` | admin |

### Audit
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/audit` | admin/technician |
| `GET` | `/api/audit/actions` | admin/technician |

### Contestations
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/contestations` | admin/technician (reponse inclut `openCount`) |
| `PATCH` | `/api/contestations/:id/review` | admin/technician |
| `PATCH` | `/api/contestations/:id/resolve` | admin/technician |

### Templates PDF
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/admin/pdf-templates` | admin/technician |
| `GET` | `/api/admin/pdf-templates/export` | admin/technician |
| `POST` | `/api/admin/pdf-templates/import` | admin |
| `GET` | `/api/admin/pdf-templates/:id/config` | admin/technician |
| `GET` | `/api/admin/pdf-templates/:id/preview` | admin/technician (10/min) |
| `PATCH` | `/api/admin/pdf-templates/:id` | admin |
| `DELETE` | `/api/admin/pdf-templates/:id` | admin |

### Autres
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/health` | - |
| CRUD | `/api/filiales` | admin |
| CRUD | `/api/equipment` | admin |
| CRUD | `/api/users` (`?page=&limit=&search=` optionnel) | admin/technician |

---

## 9. Deploiement

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
| `FRONTEND_PORT` | Port hote (defaut: 5147) |

### CI/CD
- Push sur `main` → GitHub Actions build images → push `ghcr.io/l4curtis/bonmiseadisposition-{backend,frontend}:latest`
- Portainer : pull images → deploy (zero build sur le serveur)

### Premier lancement
1. Les migrations Prisma s'executent automatiquement (`prisma migrate deploy` dans le CMD du Dockerfile)
2. Le compte `admin@local` / `admin` est cree au demarrage si absent
3. Configurer LDAP + Entra + SMTP dans `/admin/configuration`
4. Creer les filiales + lancer la sync LDAP

---

## 10. Fichiers cles a connaitre

| Fichier | Pourquoi c'est important |
|---------|--------------------------|
| `backend/prisma/schema.prisma` | Schema complet 13 modeles, source de verite |
| `backend/src/bons/bons.service.ts` | Coeur metier : stats, export, workflow |
| `backend/src/bons/bons.controller.ts` | 12+ routes, routing order important (`export` avant `:id`) |
| `backend/src/signature/signature.service.ts` | `signItCachet()` avec `pdfType` explicite, chiffrement PNG |
| `backend/src/config/config.service.ts` | `getAll(maskSecrets)`, cache, chiffrement |
| `backend/src/config/encryption.service.ts` | AES-256-GCM encrypt/decrypt |
| `backend/src/auth/auth.service.ts` | MSAL, JWT, role mapping |
| `backend/src/notification/notification.service.ts` | SMTP + cron rappels + contestation emails |
| `frontend/src/pages/bons/BonDetail.tsx` | `PendingItAction` + `ItSignModal` (cachet integre) |
| `frontend/src/pages/bons/BonsList.tsx` | `useSearchParams` filtrage URL |
| `frontend/src/types/index.ts` | `BonStatus` (7 valeurs), labels, couleurs |
| `frontend/src/lib/api.ts` | Client HTTP avec auto-refresh JWT |
| `docker-compose.prod.yml` | Deploy prod (images ghcr.io, port variable) |
| `.github/workflows/docker.yml` | CI/CD : build + push images |

---

## 11. Pieges connus et gotchas

| Piege | Solution |
|-------|----------|
| `entry.object` dans ldapjs | Utiliser `entry.attributes` (array lowercase) |
| `GET /api/bons/export` vs `GET /api/bons/:id` | `export` doit etre declare AVANT `:id` dans le controller NestJS |
| `react-signature-canvas` avec React 18 StrictMode | Remplace par Canvas HTML5 natif (`useSignatureCanvas` hook) |
| Prisma `_count` sur relations | Utiliser `include: { _count: { select: { bons: true } } }` |
| Docker image tag uppercase | `github.repository_owner` → `tr '[:upper:]' '[:lower:]'` |
| CSV Excel FR | BOM `\uFEFF` + separateur `;` + guillemets doubles RFC 4180 |
| JWT cookie en prod | `httpOnly: true, secure: true, sameSite: 'lax'` |
| Puppeteer dans Docker Alpine | Installer Chromium via apk + `--no-sandbox` |
| `ENCRYPTION_KEY` changee | Toutes les donnees chiffrees sont perdues (config DB + signatures PNG) |
| Config LDAP `bind_password` dans la reponse API | `maskSecrets: true` dans `getAll()` |
| Double `@nestjs/throttler` : `@UseGuards(ThrottlerGuard)` sur une methode en plus du guard global | Double comptage des requetes contre le meme quota → `429` prematures. Un seul `ThrottlerGuard` global (`APP_GUARD`) ; ajuster une route via `@Throttle(...)` uniquement, jamais un guard supplementaire |
| Champ secret masque renvoye vide par le front (focus sans modification) | Ecraserait silencieusement un secret existant si on l'ecrivait tel quel. `bulkSetConfig` ignore une cle chiffree recue vide (`admin.service.ts`) |
| PDFKit `doc.text()` avec le comportement par defaut (`lineBreak: true`) sur du texte destine a tenir sur une seule ligne | Le texte peut deborder sur la ligne suivante et chevaucher le contenu qui suit. Passer `lineBreak: false` pour les libelles a une ligne (ex. user-agent tronque) |
| Polices standard PDFKit (Helvetica, AFM) | Rendu incomplet des caracteres hors jeu de base. Polices DejaVu Sans (regular + bold) embarquees dans `backend/src/pdf/fonts/` pour un rendu Unicode complet |
| `mkdir({ recursive: true })` sur la racine d'un export SMB | Creerait silencieusement un dossier local dans le conteneur si le partage reseau n'est pas monte, et l'export « reussirait » sans rien ecrire sur le partage reel. La racine doit deja exister (`fs.existsSync`) ; seuls les sous-dossiers (filiale/annee/bon) sont crees a la volee |
| Deduire un etat metier (ex. « PV en attente ») de la simple existence d'une ligne `Signature` non signee | Cette ligne peut etre purgee par la retention (`purgeExpiredTokens`, tokens expires) independamment du statut du bon. Deriver l'etat des champs metier reels (`BonEquipment.returnedAt`/`notReturned`), comme le fait `emitPvClotureIfDue` |
| Comparer une colonne enum (`b.status`, `s.type`, `nl.type`, `nl.status`, `c.status`, `ec.category`) a un parametre texte dans un `$queryRaw` | Postgres refuse (`operator does not exist: "BonStatus" = text`, bug reel deja rencontre, commit `a19ea00`). Caster systematiquement en `::text` cote colonne |
| `AVG`, `EXTRACT(EPOCH ...)`, `percentile_cont` dans un `$queryRaw` sans cast | Prisma renvoie un `Decimal` (non serialisable proprement en JSON). Caster en `::float8` |
| `COUNT(*)` dans un `$queryRaw` | Renvoie un `bigint` (`5n`), non serialisable en JSON tel quel. Convertir avec `Number()` avant de renvoyer la reponse |
| Ecrire `colonne AT TIME ZONE 'Europe/Paris'` directement sur une colonne Prisma (`timestamp` SANS fuseau, valeurs stockees en UTC) | Postgres relit les chiffres UTC comme s'ils etaient deja une heure de Paris (decalage d'1-2h, bug reel corrige au commit `f1e3e35`). Toujours passer par les fragments de `backend/src/kpi/kpi-sql.ts` (bornes ramenees en UTC naif, buckets convertis explicitement depuis UTC) |
| Recalculer une definition de « retard de signature » ou d'« equipement pret » dans un nouveau service | Trois definitions divergentes existaient avant l'unification (dashboard IT, Reporting, Inventaire). Utiliser exclusivement `backend/src/common/bon-predicates.ts` (`buildOverdueSignatureWhere`/`overdueSignatureSql`, `buildLoanedEquipmentWhere`/`loanedEquipmentSql`) |
| `ALTER TYPE ... ADD VALUE` dans la meme migration qu'une instruction qui utilise la nouvelle valeur | Postgres l'interdit dans la meme transaction (« unsafe use of new value of enum type »). La migration `20260916110000_user_role_direction` ne contient QUE cette instruction ; toute utilisation de `'direction'` vit dans une migration posterieure |
| Interroger `/api/kpi/*` en boucle rapprochee en attendant un changement de configuration (ex. seuil de retard) | Reponse mise en cache serveur 60 s par cle `kpi:<endpoint>:<from>:<to>:<filialeId|''>` : le changement n'est visible qu'apres expiration du cache |
| Tester un composant Recharts (`TimeSeriesChart`, `DonutChart`, `HorizontalBars`) sous Vitest/jsdom sans mock | `ResponsiveContainer` mesure un conteneur DOM reel (largeur/hauteur 0 en jsdom) et ne rend rien. Mocker `ResponsiveContainer` dans le test |

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

## 12. Phase 6 — Securite et Hardening (Complete)

**Status** : Tout implementé (2026-03-21)

10 vulnerabilites critiques/haute corrigees :
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

Voir **docs/phase6-security.md** pour details complets.

---

## 13. Evolutions futures envisagees

- Integration GLPI (pre-remplir equipements depuis inventaire)
- Signature qualifiee (Yousign)
- PWA (meilleure UX mobile a la signature)
- Notifications Teams (webhook)
- QR Code sur le bon imprime
- Dashboard Grafana
- Archivage legal (coffre-fort numerique)
- Multi-langue
- Signature par lot
- JWT revocation avec Redis (SEC-05 optionnel)

---

## 14. Systeme de notifications (toasts) — comment ca fonctionne

Les notifications visuelles dans l'app sont des **toasts** (bandeaux bas-droite, duree 3s).

### Ou c'est implementé
- **Hook** : `frontend/src/hooks/use-toast.ts` — state global, file d'attente, `dismiss()` apres 3000ms
- **Composant** : `frontend/src/components/ui/toaster.tsx` — rendu, provider `duration={3000}`
- **Appel** : `import { toast } from '@/hooks/use-toast'`

### Variantes disponibles
```typescript
toast({ title: 'Succes', description: 'Message detaille.', variant: 'success' })   // vert
toast({ title: 'Erreur', description: 'Ce qui a foiré.', variant: 'destructive' }) // rouge
toast({ title: 'Info', description: 'Info neutre.' })                               // neutre
```

### Convention dans le code
- **Succes** : `variant: 'success'` — confirmation creation/sauvegarde/envoi
- **Erreur** : `variant: 'destructive'` — echec API, validation, permission
- **Neutre** : sans variant — info non critique

### Points importants
- Duree fixe 3s (non modifiable par composant)
- Pas de toast bloquant (pas de `confirm()`) — pour les actions destructives, utiliser `<ConfirmModal>`
- `ConfirmModal` : `frontend/src/pages/bons/detail/ConfirmModal.tsx` — modal avec bouton "Confirmer" + prop `danger` pour rouge
- **Ne pas abuser** : 1 toast par action utilisateur maximum

---

## 15. Panneau audit — fonctionnement et conventions

### But
Tracer toutes les actions significatives sur les bons, les connexions et les operations admin.

### Acces
- Route : `/admin/audit`
- Auth : `@Roles('admin')` uniquement (pas les techniciens)
- Composant frontend : `frontend/src/pages/admin/AuditLogs.tsx`
- Endpoint : `GET /api/audit?page=&limit=&userEmail=&action=&dateFrom=&dateTo=`

### Structure d'un log d'audit (modele `AuditLog`)
| Champ | Type | Description |
|-------|------|-------------|
| `id` | UUID | Identifiant |
| `action` | string | Code action (voir liste ci-dessous) |
| `userId` | UUID? | ID utilisateur authentifie (null si anonyme) |
| `userEmail` | string? | Email brut (pour login_failed sans userId) |
| `bonId` | UUID? | ID du bon concerne (null si action auth) |
| `ipAddress` | string? | IP reelle du client |
| `userAgent` | string? | User-agent navigateur |
| `details` | JSON? | Donnees contextuelles libres |
| `createdAt` | DateTime | Timestamp auto |

### Actions auditees — liste complete
**Auth :**
- `login_sso` — connexion via Entra ID (SSO)
- `login_local_success` — connexion locale reussie
- `login_local_failed` — tentative de connexion echouee (brute-force)
- `logout` — deconnexion
- `password_changed` — changement de mot de passe

**Bons — cycle de vie :**
- `bon_created` — creation d'un bon (brouillon)
- `bon_sent` — bon envoye au collaborateur (1er envoi)
- `bon_cancelled` — bon annule
- `restitution_initiated` — restitution initiee par IT
- `declare_not_returned` — materiel declare non rendu
- `mark_found` — materiel retrouve
- `reminder_sent` — lien de signature renvoye manuellement

**Signatures :**
- `signed_it_cachet` — cachet IT appose
- `signed_mise_disposition` — collaborateur a signe la mise a disposition
- `signed_restitution` — collaborateur a signe la restitution
- `signed_pv_cloture` — collaborateur a signe le PV de cloture

**Contestations :**
- `bon_contested` — collaborateur a cree une contestation
- `contestation_resolved` — contestation acceptee par IT
- `contestation_rejected` — contestation refusee par IT

**Admin (pas encore logue — a implementer) :**
- `config_updated` — configuration modifiee dans le panneau admin
- `ldap_sync` — synchronisation LDAP manuelle declenchee

### Comment creer un audit log dans le backend
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

### Regles de nommage des actions
- Format `snake_case` exclusivement
- Prefixe par entite : `bon_`, `signed_`, `login_`, `contestation_`, etc.
- Pas de majuscules, pas de tirets
- Toujours ajouter le label correspondant dans `ACTION_LABELS` (`AuditLogs.tsx`) apres chaque nouvelle action

### Filtres disponibles dans l'interface
- Par email utilisateur (recherche partielle)
- Par type d'action (dropdown, alimente dynamiquement depuis `/api/audit/actions`)
- Par plage de dates (from / to)
- Pagination : 50 par page

---

## 16. Mise a jour pre-production (2026-09-16)

Revue complete pre-livraison : securite (verrouillage compose compte+IP, garde-fou sync LDAP,
plancher RGPD 60 mois avec dry-run obligatoire), machine a etats des bons corrigee (PV derive
de l'etat metier, annulation interdite apres signature), et deux nouvelles fonctionnalites :

- **Vue Inventaire** (`/inventaire`, `GET /api/reporting/inventory*`) : parc d'equipements
  actuellement chez les collaborateurs, filtrable et exportable en CSV.
- **Rappel avant restitution** : cron quotidien, config `rappels.restitution_before_days`
  (defaut 7 jours), template email `restitution_due_reminder`.

Egalement : historique des emails par bon (`GET /bons/:id/notifications`), regeneration des
PDF manquants (`POST /admin/pdf/regenerate-missing`), purge independante des pieces jointes
(`retention.attachment_months`), cachet de filiale et numeros de ligne optionnels sur le PDF,
police Unicode embarquee (DejaVu Sans), 6 migrations Prisma (dont 2 qui echouent
volontairement en cas de doublons — voir [README.md](README.md)).

Detail complet des ~40 corrections par domaine : [CHANGELOG.md](CHANGELOG.md). Regles de
securite a jour : [docs/security.md](docs/security.md).

---

## 17. Tableau de bord KPI et role Direction (2026-09-17)

Remplacement du tableau de bord IT et fusion de la page Reporting dans une page unique a
onglets (`/dashboard` : Aujourd'hui, Parc, Delais, Incidents), et ouverture en lecture seule
au nouveau role Direction. Voir §1 (role), §3 (module `kpi`), §5 (page), §8 (endpoints) et §11
(pieges) ci-dessus pour le detail.

- **Nouvelles cles de configuration** : `rappels.signature_overdue_days` (seuil de retard de
  signature, defaut 7, minimum 1 — remplace la constante fixe historique) et
  `entra.direction_group_id` (groupe Entra attribue au role Direction).
- **2 nouvelles migrations Prisma**, toutes deux idempotentes (`ADD VALUE IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`) : `20260916110000_user_role_direction` (valeur d'enum) et
  `20260916110100_kpi_indexes` (9 index pour les agregats du tableau de bord).
- **Retrait** : `reporting.service.ts`/`reporting.controller.ts` supprimes ; `/admin/reports`
  redirige vers `/dashboard?tab=parc`.

Detail complet : [CHANGELOG.md](CHANGELOG.md) (entree du 2026-09-17).

---

## 13. Repo et liens

- **GitHub** : https://github.com/L4Curtis/bonmiseadisposition
- **Images Docker** : `ghcr.io/l4curtis/bonmiseadisposition-backend:latest` / `frontend:latest`
- **Doc detaillee** : `projet_bon_de_mise_a_disposition.md`
- **Doc phases** : `docs/phase1.md` a `docs/phase5.md`
- **CI/CD** : `.github/workflows/docker.yml`
