# AGENDA — Contexte complet pour le developpement futur

> Ce fichier sert de memoire de travail. Il contient tout ce qu'il faut savoir pour reprendre le developpement sans relire toute la doc.
> Pour le detail exhaustif, voir `projet_bon_de_mise_a_disposition.md` et `docs/phase*.md`.

---

## 1. Qu'est-ce que ce projet

Application web interne pour le **Groupe Livio** (14 filiales) qui remplace les bons papier de mise a disposition et restitution de materiel IT.

**Cycle de vie d'un bon :**
```
Technicien cree le bon → appose son cachet IT → envoie au collaborateur
→ collaborateur signe via SSO → bon actif
→ technicien initie la restitution → cachet IT → collaborateur signe
→ bon archive avec 2 PDF snapshots immuables
```

**Utilisateurs :**
- Equipe IT (admin, technician) : cree les bons, gere tout
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
| PDF | Puppeteer (headless Chrome) | snapshots en Bytes PostgreSQL |
| Signature | Canvas HTML5 natif | pas de lib externe |
| UI | shadcn/ui + Tailwind CSS | |
| Rate limiting | @nestjs/throttler | 10 req/60s sur /sign |
| Chiffrement | AES-256-GCM (crypto natif Node) | signatures PNG + config DB |
| Scheduler | @nestjs/schedule | rappels lun-ven 9h |
| CI/CD | GitHub Actions | build → push ghcr.io |
| Deploy | Docker Compose + Portainer | images pre-buildees |
| SSL | Nginx Proxy Manager (externe) | pas dans le container |

---

## 3. Architecture backend — 15 modules NestJS

| Module | Fichiers | Role |
|--------|----------|------|
| `PrismaModule` | module + service | Connexion DB |
| `ConfigModule` | module + service + encryption | Config chiffree en DB, cache TTL 5min |
| `AuthModule` | module + service + controller + guards + decorators + strategy | SSO Entra + login local + JWT |
| `AdminModule` | module + service + controller | CRUD config, tests connexion |
| `LdapModule` | module + service | Sync AD, cron 6h, `entry.attributes` |
| `FilialesModule` | module + service + controller + dto | CRUD filiales + upload logo/cachet |
| `EquipmentModule` | module + service + controller + dto | Catalogue + packs |
| `UsersModule` | module + service + controller | Liste + autocomplete |
| `BonsModule` | module + service + controller + dto | CRUD bons, stats, export CSV, resend |
| `SignatureModule` | module + service + controller + dto | Sign collab + cachet IT + chiffrement PNG |
| `PdfModule` | module + service | Puppeteer → snapshot Bytes en DB |
| `NotificationModule` | module + service | SMTP + cron rappels + logs |
| `AuditModule` | module + service + controller | Logs d'audit pagines |
| `ContestationModule` | module + service + controller | Workflow contestation collab |
| `HealthController` | controller standalone | `GET /health` |

**51 fichiers TypeScript backend, 32 fichiers frontend, ~5000 lignes total.**

---

## 4. Modele de donnees — 13 modeles Prisma

```
AppConfig, User, Filiale, EquipmentCatalog, EquipmentPack, EquipmentPackItem,
Bon, BonEquipment, Signature, Contestation, NotificationLog, AuditLog
+ enums : BonStatus, UserRole, Civilite, EquipmentCategory, SignatureType,
          ContestationStatus, NotificationType, NotificationStatus
```

**BonStatus (7 valeurs) :**
`draft` → `sent_mise_dispo` → `active` → `sent_restitution` → `archived` | `cancelled` | `contested`

> Pas d'etat intermediaire `signed_*` — le bon passe directement de `sent_mise_dispo` a `active`.

**SignatureType (3 valeurs) :** `mise_disposition`, `restitution`, `it_cachet`

---

## 5. Pages frontend — 14 pages React

| Page | Route | Role |
|------|-------|------|
| Login | `/login` | SSO Entra + login local |
| DashboardIT | `/dashboard` | Stats, cartes cliquables, activite recente |
| BonsList | `/bons` | Liste filtrable + export CSV + `useSearchParams` |
| BonCreate | `/bons/new` | Formulaire creation (packs, catalogue, libre) |
| BonDetail | `/bons/:id` | Actions IT, cachet integre (`PendingItAction`), PDF, renvoyer lien |
| SignaturePage | `/signer/:token` | Canvas signature collab (publique, SSO obligatoire) |
| PortailCollaborateur | `/mes-bons` | Bons perso, signer, contester, PDF |
| Configuration | `/admin/configuration` | LDAP, Entra, SMTP (avec tests) |
| LdapSync | `/admin/ldap` | Statut sync + resync manuelle |
| Filiales | `/admin/filiales` | CRUD + upload |
| Catalogue | `/admin/catalogue` | Items + packs |
| Utilisateurs | `/admin/utilisateurs` | Liste users |
| AuditLogs | `/admin/audit` | Tableau pagine + filtres |
| Contestations | `/admin/contestations` | Workflow contestation |

---

## 6. Securite — points critiques a ne pas oublier

### Chiffrement
- **Config sensible en DB** : `encrypted=true` sur chaque `AppConfig` → AES-256-GCM via `EncryptionService`
- **Signatures PNG** : chiffrees `.enc` sur disque dans `data/signatures/`
- **Cle maitre** : unique env var `ENCRYPTION_KEY` (64 hex) → **ne jamais changer** apres 1er lancement
- **API GET config** : `maskSecrets: true` → renvoie `"••••••••"` au frontend, jamais le secret dechiffre
- **Frontend** : masquage cote client aussi (double protection), `onFocus` vide le champ masque

### Auth
- **JWT httpOnly secure cookies** : access 15min, refresh 8h
- **Guards NestJS** : `@Roles('admin')`, `@Roles('admin', 'technician')`, `@UseGuards(JwtAuthGuard, RolesGuard)`
- **SSO Entra ID** : verification email obligatoire a la signature (sauf mode presentiel)
- **Visibilite bons** : collaborateur ne voit que les siens (filtre par email)
- **Login local** : `admin@local` / `admin` (bcrypt), desactivable dans config

### Rate limiting
- `@nestjs/throttler` : 10 req/60s sur `POST /api/signature/:token/sign` et `POST /api/bons/:id/sign-it`
- Config globale : 60 req/60s

### Docker
- Images `node:20-alpine` (surface minimale)
- User non-root (`nestjs:nodejs`)
- Backend + DB sur reseau Docker `internal`, non exposes sur l'hote
- Seul le frontend est expose (port configurable, defaut 5147)
- Healthchecks sur chaque container

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

### Bons (12 endpoints)
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/bons/mes-bons` | collaborator+ |
| `POST` | `/api/bons/:id/contestation` | collaborator+ |
| `POST` | `/api/bons/:id/resend` | admin/technician |
| `GET` | `/api/bons/stats` | admin/technician |
| `GET` | `/api/bons/recent` | admin/technician |
| `GET` | `/api/bons/export` | admin/technician |
| `GET` | `/api/bons` | admin/technician |
| `GET` | `/api/bons/:id` | admin/technician |
| `POST` | `/api/bons` | admin/technician |
| `PUT` | `/api/bons/:id` | admin/technician |
| `DELETE` | `/api/bons/:id` | admin/technician |
| `POST` | `/api/bons/:id/send` | admin/technician |
| `POST` | `/api/bons/:id/initiate-restitution` | admin/technician |
| `POST` | `/api/bons/:id/initiate-inperson` | admin/technician |
| `GET` | `/api/bons/:id/pdf` | admin/technician |
| `POST` | `/api/bons/:id/sign-it` | admin/technician |

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

### Audit
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/audit` | admin/technician |
| `GET` | `/api/audit/actions` | admin/technician |

### Contestations
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/api/contestations` | admin/technician |
| `PATCH` | `/api/contestations/:id/review` | admin/technician |
| `PATCH` | `/api/contestations/:id/resolve` | admin/technician |

### Autres
| Methode | Route | Auth |
|---------|-------|------|
| `GET` | `/health` | - |
| CRUD | `/api/filiales` | admin |
| CRUD | `/api/equipment` | admin |
| CRUD | `/api/users` | admin/technician |

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

---

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

## 13. Repo et liens

- **GitHub** : https://github.com/L4Curtis/bonmiseadisposition
- **Images Docker** : `ghcr.io/l4curtis/bonmiseadisposition-backend:latest` / `frontend:latest`
- **Doc detaillee** : `projet_bon_de_mise_a_disposition.md`
- **Doc phases** : `docs/phase1.md` a `docs/phase5.md`
- **CI/CD** : `.github/workflows/docker.yml`
