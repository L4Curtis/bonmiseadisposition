# Structure du Projet — Bon de Mise a Disposition

> **Mis a jour le 2026-03-21** — Refonte navigation sidebar (3 sections, renommages, support badges)

## Vue d'ensemble

Application interne **Groupe Livio** pour gerer la mise a disposition d'equipements informatiques aux collaborateurs : creation de bons, signature electronique, restitution, archivage PDF.

| Couche | Stack |
|--------|-------|
| Backend | NestJS 10 + Prisma ORM + PostgreSQL 16 |
| Frontend | React 18 + Vite + Tailwind CSS + shadcn/ui |
| Auth | JWT (cookies httpOnly) + Microsoft Entra ID SSO + auth locale bcrypt |
| PDF | PDFKit (generation serveur) |
| Infra | Docker multi-stage + Nginx reverse proxy TLS |

---

## Arborescence

```
BonDeMiseADisposition/
├── .env.example                        # Template variables d'environnement (prod)
├── .gitignore                          # Exclusions Git
├── docker-compose.yml                  # Stack complete dev (build local)
├── docker-compose.dev.yml              # PostgreSQL seul (dev local sans Docker)
├── docker-compose.prod.yml             # Stack prod (images GHCR pre-buildees)
│
├── nginx/
│   └── nginx.conf                      # Reverse proxy TLS, rate limiting, headers securite
│
├── docs/
│   ├── phase1.md                       # Fondations : NestJS, Prisma, React, Docker, Auth
│   ├── phase2.md                       # Admin : LDAP sync, catalogue, filiales, config UI
│   ├── phase3.md                       # Coeur : bons, signatures, PDF, emails, portail collab
│   ├── phase4.md                       # Dashboard IT, audit, export CSV
│   ├── phase5.md                       # Securite, contestations, deploiement prod
│   └── phase6-security.md              # Hardening : 10 vulnerabilites critiques corrigees (2026-03-21)
│
├── backend/
│   ├── Dockerfile                      # Multi-stage : build TS → prod Node.js (non-root)
│   ├── package.json                    # Dependances NestJS, Prisma, PDFKit, nodemailer
│   ├── tsconfig.json                   # Config TypeScript stricte
│   ├── tsconfig.build.json             # Config build (exclut tests/specs)
│   ├── nest-cli.json                   # Config CLI NestJS
│   │
│   ├── prisma/
│   │   ├── schema.prisma               # 13 modeles, 6 enums (voir detail ci-dessous)
│   │   └── migrations/
│   │       ├── 20260318120219_init/                            # Schema initial complet
│   │       ├── 20260318130634_add_local_auth/                  # Auth locale (password_hash)
│   │       ├── 20260318191452_add_pdf_snapshots/               # Snapshots PDF binaires
│   │       ├── 20260319000000_cleanup_bon_status/              # Nettoyage statuts inutiles
│   │       ├── 20260319100000_add_must_change_password/        # Changement mdp obligatoire
│   │       ├── 20260319110020_pdf_snapshots_partial_restitution/ # Restitution partielle
│   │       ├── 20260319150017_pv_cloture_signature/            # Signature PV cloture
│   │       └── 20260319153614_avenant_equipement_retrouve/     # Avenant equipement retrouve
│   │
│   └── src/
│       ├── main.ts                     # Bootstrap NestJS : CORS, Helmet, ValidationPipe, port 4000
│       ├── app.module.ts               # Module racine : imports tous modules, ThrottlerGuard global
│       ├── health.controller.ts        # GET /api/health (healthcheck Docker)
│       │
│       ├── filters/
│       │   └── all-exceptions.filter.ts # Filtre global : masque stack traces en prod
│       │
│       ├── prisma/
│       │   ├── prisma.module.ts        # Module Prisma (global)
│       │   └── prisma.service.ts       # Client Prisma : connect/disconnect lifecycle
│       │
│       ├── config/
│       │   ├── config.module.ts        # Module config (global)
│       │   ├── config.service.ts       # CRUD config chiffree (cache 5 min, AES-256-GCM)
│       │   └── encryption.service.ts   # Chiffrement AES-256-GCM (signatures PNG, config)
│       │
│       ├── auth/
│       │   ├── auth.module.ts          # Module auth (JWT + Passport)
│       │   ├── auth.controller.ts      # Login SSO, callback, refresh, logout, local-login
│       │   ├── auth.service.ts         # MSAL, JWT, bcrypt, gestion cookies
│       │   ├── jwt.strategy.ts         # Strategie Passport-JWT (extraction cookie)
│       │   ├── jwt-auth.guard.ts       # Guard JWT global
│       │   ├── roles.guard.ts          # Guard RBAC (admin/technician/collaborator)
│       │   ├── roles.decorator.ts      # @Roles() decorateur de metadata
│       │   ├── current-user.decorator.ts # @CurrentUser() injecte l'utilisateur courant
│       │   ├── login.dto.ts            # DTO login local (email + password)
│       │   └── change-password.dto.ts  # DTO changement mdp (current + new)
│       │
│       ├── admin/
│       │   ├── admin.module.ts         # Module administration
│       │   ├── admin.controller.ts     # Config CRUD, tests LDAP/SMTP/Entra/SMB, sync LDAP
│       │   ├── admin.service.ts        # Bulk config, test transports, purge LDAP
│       │   ├── admin.dto.ts            # DTOs config sections
│       │   └── templates.controller.ts # CRUD templates email (GET/PATCH/DELETE/:id, export, import)
│       │
│       ├── ldap/
│       │   ├── ldap.module.ts          # Module LDAP
│       │   └── ldap.service.ts         # Sync AD (cron 6h), upsert users, match filiales
│       │
│       ├── users/
│       │   ├── users.module.ts         # Module utilisateurs
│       │   ├── users.controller.ts     # GET /users, /users/search, /users/:id
│       │   └── users.service.ts        # findAll, search (displayName/email), findOne
│       │
│       ├── filiales/
│       │   ├── filiales.module.ts      # Module filiales
│       │   ├── filiales.controller.ts  # CRUD filiales + upload logo/stamp (Multer 5MB)
│       │   ├── filiales.service.ts     # Gestion filiales avec cleanup fichiers
│       │   └── filiales.dto.ts         # DTOs creation/update filiale
│       │
│       ├── equipment/
│       │   ├── equipment.module.ts     # Module equipements
│       │   ├── equipment.controller.ts # CRUD catalogue + packs
│       │   ├── equipment.service.ts    # Catalogue (11 categories) + packs pre-configures
│       │   └── equipment.dto.ts        # DTOs catalogue item + pack
│       │
│       ├── bons/
│       │   ├── bons.module.ts          # Module bons (coeur metier)
│       │   ├── bons.controller.ts      # CRUD bons, send, restitution, PV, mark-found, sign-it
│       │   ├── bons.service.ts         # Workflow complet : draft→sent→active→archived
│       │   └── bons.dto.ts             # DTOs creation/update bon + equipements
│       │
│       ├── signature/
│       │   ├── signature.module.ts     # Module signatures electroniques
│       │   ├── signature.controller.ts # GET /signature/:token, POST sign (public)
│       │   ├── signature.service.ts    # Tokens 7j, chiffrement PNG, verification email
│       │   └── signature.dto.ts        # DTOs signature (dataUrl, mention lu et approuve)
│       │
│       ├── pdf/
│       │   ├── pdf.module.ts           # Module generation PDF
│       │   └── pdf.service.ts          # PDFKit : mise_dispo, restitution, PV cloture, avenant
│       │
│       ├── templates/
│       │   ├── templates.module.ts     # Module global (@Global) — TemplatesService disponible partout
│       │   └── templates.service.ts    # 9 templates email avec variables {{PLACEHOLDER}}, rendu, DB custom
│       │
│       ├── notification/
│       │   ├── notification.module.ts  # Module notifications email
│       │   └── notification.service.ts # SMTP, rendu via TemplatesService, rappels cron (lun-ven 9h)
│       │
│       ├── smb/
│       │   ├── smb.module.ts           # Module export partage reseau
│       │   └── smb.service.ts          # Export PDF vers UNC/montage ({annee}/{ref_collab}/)
│       │
│       ├── audit/
│       │   ├── audit.module.ts         # Module journal d'audit
│       │   ├── audit.controller.ts     # GET /audit (filtre email/action/date), /audit/actions
│       │   └── audit.service.ts        # Recherche paginee, actions distinctes
│       │
│       └── contestation/
│           ├── contestation.module.ts  # Module contestations
│           ├── contestation.controller.ts # GET liste, PATCH review/resolve
│           └── contestation.service.ts # Creation, review, resolution + notifications
│
└── frontend/
    ├── Dockerfile                      # Multi-stage : build Vite → Nginx Alpine (non-root)
    ├── nginx.conf                      # Nginx interne conteneur (SPA fallback, gzip, securite)
    ├── package.json                    # Dependances React, Vite, Tailwind, Radix, Lucide
    ├── vite.config.ts                  # Alias @→src, proxy API localhost:4000
    ├── tailwind.config.ts              # Theme slate, couleurs HSL, dark mode
    ├── postcss.config.js               # PostCSS pour Tailwind
    ├── components.json                 # Config shadcn/ui (style default, TSX)
    ├── tsconfig.json                   # Config TypeScript
    ├── tsconfig.app.json               # TS config app (strict)
    ├── tsconfig.node.json              # TS config Vite/Node
    ├── index.html                      # Point d'entree SPA
    │
    └── src/
        ├── main.tsx                    # Rendu React + BrowserRouter
        ├── index.css                   # Directives Tailwind + variables CSS HSL
        ├── App.tsx                     # Routes, ProtectedRoute, redirection par role
        │
        ├── types/
        │   └── index.ts               # Types : User, Filiale, BonStatus, labels/couleurs
        │
        ├── lib/
        │   ├── api.ts                  # Client HTTP : fetch + auto-refresh JWT 401
        │   └── utils.ts                # cn() : clsx + tailwind-merge
        │
        ├── contexts/
        │   ├── AuthContext.tsx          # AuthProvider + useAuth() (GET /api/auth/me)
        │   └── ThemeContext.tsx         # ThemeProvider + useTheme() (light/dark/system)
        │
        ├── components/
        │   ├── layout/
        │   │   ├── Layout.tsx          # Shell : sidebar + header + <Outlet/>
        │   │   ├── Header.tsx          # Barre sup : user info, logout, changement mdp
        │   │   └── Sidebar.tsx         # Nav gauche : 3 sections (Opérations, Référentiel, Système)
        │   │
        │   └── ui/                     # Composants shadcn/ui (Radix + Tailwind)
        │       ├── button.tsx          # Bouton CVA (6 variants, 4 tailles)
        │       ├── card.tsx            # Card, CardHeader, CardTitle, CardContent
        │       ├── input.tsx           # Input texte avec focus ring
        │       ├── label.tsx           # Label formulaire
        │       ├── badge.tsx           # Badge colore (7 variants)
        │       ├── select.tsx          # Select Radix avec keyboard nav
        │       ├── separator.tsx       # Separateur horizontal/vertical
        │       ├── avatar.tsx          # Avatar Radix (image + fallback initiales)
        │       ├── dialog.tsx          # Dialog Radix (modale accessible)
        │       ├── dropdown-menu.tsx   # Dropdown Radix avec sous-menus
        │       ├── skeleton.tsx        # Placeholder chargement (shimmer)
        │       ├── spinner.tsx         # Indicateur de chargement rotatif
        │       ├── toast.tsx           # Notification toast (Radix)
        │       ├── toaster.tsx         # Conteneur global toasts
        │       └── tooltip.tsx         # Tooltip Radix accessible
        │
        └── pages/
            ├── Login.tsx               # SSO Entra ID + fallback auth locale
            ├── ChangePassword.tsx       # Changement mdp (12 car, majuscule, chiffre, special)
            ├── Unauthorized.tsx         # Page 403
            ├── DashboardIT.tsx          # KPIs (5 cartes), bons recents, repartition filiales
            ├── PortailCollaborateur.tsx  # Vue collab : a signer, actifs, contestes, historique
            │
            ├── bons/
            │   ├── BonsList.tsx         # Liste paginee + filtres (statut, filiale, recherche) + CSV
            │   ├── BonCreate.tsx        # Creation bon : autocomplete collab, catalogue, packs
            │   └── BonDetail.tsx        # Detail complet : signatures, restitution, PV, avenant
            │
            ├── signature/
            │   └── SignaturePage.tsx     # Page publique /signer/:token (canvas + lu et approuve)
            │
            └── admin/
                ├── AdminLayout.tsx      # Sous-nav admin avec routing
                ├── Configuration.tsx    # Config : General, LDAP, SMTP, Entra, Rappels, Tokens
                ├── LdapSync.tsx         # Sync LDAP : statut, declenchement manuel, purge
                ├── Filiales.tsx         # CRUD filiales + upload logo/cachet
                ├── Utilisateurs.tsx     # Annuaire utilisateurs (recherche)
                ├── Contestations.tsx    # Gestion contestations (open/review/resolve)
                └── detail/
                    ├── Configuration.tsx # (alias)
                    ├── LdapSync.tsx     # (alias)
                    └── Filiales.tsx     # (alias)
```

---

## Base de donnees (Prisma)

### Modeles (13)

| Modele | Role | Champs cles |
|--------|------|-------------|
| **AppConfig** | Config applicative chiffree | category, key, value, encrypted |
| **Filiale** | Entite organisationnelle | name, displayName, logoPath, stampPath, siret |
| **User** | Utilisateur (LDAP ou local) | samAccountName, email, role, filialeId, passwordHash, mustChangePassword |
| **EquipmentCatalog** | Reference equipement IT | category (enum 11 valeurs), brand, model |
| **EquipmentPack** | Lot pre-configure | name, items[] |
| **EquipmentPackItem** | Element d'un pack | packId, catalogItemId, quantity |
| **Bon** | Bon de mise a disposition | reference (BON-YYYY-NNNN), status, collaborateurId, filialeId, civilite |
| **BonEquipment** | Ligne equipement d'un bon | serialNumber, inventoryNumber, returnedAt, notReturned, notReturnedReason |
| **Signature** | Signature electronique | type, token (7j), signed, signatureImagePath (chiffre), signerEmail |
| **PdfSnapshot** | Snapshot PDF immutable | type, data (BYTEA), filename |
| **Contestation** | Litige collaborateur | message, status (open→in_review→resolved/rejected) |
| **NotificationLog** | Suivi envoi emails | recipientEmail, type, status, reminderNumber |
| **AuditLog** | Journal d'activite | action, details (JSON), ipAddress |

### Enums

| Enum | Valeurs |
|------|---------|
| **UserRole** | admin, technician, collaborator |
| **Civilite** | mme, mr |
| **BonStatus** | draft, sent_mise_dispo, active, sent_restitution, partially_returned, archived, cancelled, contested |
| **EquipmentCategory** | pc_portable, pc_fixe, ecran, souris, clavier, casque, telephone, housse, dock, cable, autre |
| **SignatureType** | mise_disposition, restitution, it_cachet, pv_cloture |
| **PdfSnapshotType** | signature_it_mise_disposition, signature_collab_mise_disposition, signature_it_restitution, signature_collab_restitution, cloture_equipements_manquants, avenant_equipement_retrouve |
| **ContestationStatus** | open, in_review, resolved, rejected |
| **NotificationType** | mise_dispo_request, restitution_request, reminder, confirmation, contestation_alert |
| **NotificationStatus** | sent, failed, bounced |

---

## API Backend — Endpoints par module

### Auth (`/api/auth`)

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/login` | Non | Redirect vers Microsoft OAuth |
| GET | `/callback` | Non | Callback OAuth, genere JWT cookies |
| POST | `/refresh` | Non | Rafraichit access token (cookie refresh) |
| POST | `/logout` | Non | Supprime cookies auth |
| GET | `/me` | Oui | Utilisateur courant |
| GET | `/setup-required` | Non | Verifie si wizard initial necessaire |
| POST | `/local-login` | Non | Auth email+mdp (rate limit 5/min) |
| POST | `/change-password` | Oui | Changement mot de passe local |
| GET | `/local-auth-status` | Non | Verifie si auth locale activee |

### Admin (`/api/admin`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/config/:category` | admin, tech | Lire config (secrets masques) |
| PUT | `/config/:category` | admin | Modifier config par categorie |
| POST | `/config/test/ldap` | admin | Tester connexion LDAP |
| POST | `/config/test/smtp` | admin | Tester SMTP (envoi test optionnel) |
| POST | `/config/test/entra` | admin | Verifier credentials Entra ID |
| POST | `/config/test/smb` | admin | Tester acces SMB |
| GET | `/ldap/status` | admin, tech | Statut derniere sync LDAP |
| POST | `/ldap/sync` | admin | Lancer sync LDAP manuelle |
| DELETE | `/ldap/users` | admin | Purger utilisateurs LDAP |

### Templates Email (`/api/admin/templates`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech | Liste des 9 templates (nom, categorie, variables, modifie) |
| GET | `/export` | admin, tech | Exporter tous les templates en JSON |
| POST | `/import` | admin, tech | Importer templates depuis JSON |
| GET | `/:id/html` | admin, tech | HTML courant + HTML defaut + variables |
| GET | `/:id/preview` | admin, tech | Apercu rendu avec donnees exemples |
| PATCH | `/:id` | admin, tech | Sauvegarder template personnalise |
| DELETE | `/:id` | admin, tech | Reinitialiser template au defaut |

### Users (`/api/users`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech | Liste utilisateurs actifs |
| GET | `/search?q=` | admin, tech | Recherche (nom/email/sam, max 15) |
| GET | `/:id` | admin, tech | Detail utilisateur |

### Filiales (`/api/filiales`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | auth | Toutes les filiales |
| GET | `/active` | auth | Filiales actives uniquement |
| GET | `/:id` | auth | Detail filiale |
| GET | `/file/:filename` | auth | Servir logo/cachet (protection path traversal) |
| POST | `/` | admin, tech | Creer filiale |
| PUT | `/:id` | admin, tech | Modifier filiale |
| PATCH | `/:id/logo` | admin, tech | Upload logo (max 5MB, JPG/PNG/GIF/SVG/WebP) |
| PATCH | `/:id/stamp` | admin, tech | Upload cachet |
| DELETE | `/:id` | admin | Supprimer filiale |

### Equipment (`/api/equipment`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/catalog` | auth | Liste catalogue complet |
| GET | `/catalog/active` | auth | Catalogue actif uniquement |
| GET | `/catalog/search?q=` | auth | Recherche catalogue (max 20) |
| GET | `/catalog/:id` | auth | Detail item catalogue |
| POST | `/catalog` | admin, tech | Creer item |
| PUT | `/catalog/:id` | admin, tech | Modifier item |
| DELETE | `/catalog/:id` | admin, tech | Desactiver item (soft delete) |
| GET | `/packs` | auth | Liste packs |
| GET | `/packs/active` | auth | Packs actifs |
| GET | `/packs/:id` | auth | Detail pack avec items |
| POST | `/packs` | admin, tech | Creer pack |
| PUT | `/packs/:id` | admin, tech | Modifier pack (remplace items) |
| DELETE | `/packs/:id` | admin, tech | Desactiver pack |

### Bons (`/api/bons`) — Module principal

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/stats` | admin, tech | KPIs dashboard (compteurs, par filiale) |
| GET | `/recent?limit=` | admin, tech | Bons recents |
| GET | `/export?...` | admin, tech | Export CSV (filtres statut/filiale/recherche) |
| GET | `/mes-bons` | tous | Bons du collaborateur connecte |
| GET | `/?page=&limit=&...` | admin, tech | Liste paginee avec filtres |
| GET | `/:id` | admin, tech | Detail complet (equipements, signatures, etc.) |
| POST | `/` | admin, tech | Creer bon (optionnel : depuis un pack) |
| PUT | `/:id` | admin, tech | Modifier bon (statut draft uniquement) |
| DELETE | `/:id` | admin, tech | Annuler bon (status → cancelled) |
| POST | `/:id/send` | admin, tech | Envoyer mise a disposition (email + token) |
| POST | `/:id/initiate-restitution` | admin, tech | Lancer restitution (selection equipements) |
| POST | `/:id/initiate-inperson` | admin, tech | Signature presentiel (token 24h, pas d'email) |
| POST | `/:id/declare-not-returned` | admin, tech | Declarer non restitue (PV + signature IT) |
| POST | `/:id/mark-found` | admin, tech | Equipement retrouve (avenant ou MAJ PV) |
| POST | `/:id/sign-it` | admin, tech | Cachet IT direct (rate limit 10/min) |
| POST | `/:id/resend` | admin, tech | Renvoyer lien signature |
| GET | `/:id/pdf-snapshots` | tous | Liste snapshots PDF |
| GET | `/:id/pdf?type=&stage=` | tous | Telecharger PDF |
| POST | `/:id/contestation` | collab | Creer contestation |

### Signature (`/api/signature`)

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/:token` | Oui | Info bon depuis token (pending/signed/expired) |
| POST | `/:token/sign` | Oui | Signer (canvas dataUrl + mention, rate limit 10/min) |

### Audit (`/api/audit`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/?bonId=&userEmail=&action=&dateFrom=&dateTo=&page=&limit=` | admin, tech | Logs pagines avec filtres |
| GET | `/actions` | admin, tech | Liste actions distinctes (pour filtres) |

### Contestations (`/api/contestations`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/?status=&page=&limit=` | admin, tech | Liste contestations paginee |
| PATCH | `/:id/review` | admin, tech | Marquer en cours d'examen |
| PATCH | `/:id/resolve` | admin, tech | Resoudre/rejeter (action + message) |

---

## Navigation Sidebar (Reorganisee 2026-03-21)

### Structure IT Staff (isItStaff = true)

La sidebar est organisee en **3 sections principales**, chaque item peut avoir un badge optionnel :

#### Opérations
- **Vue d'ensemble** → `/dashboard` (KPIs, activite recente, filiales)
- **Bons** → `/bons` (Liste, detail, signatures)
- **Contestations** → `/admin/contestations` (Litige collaborateur)

#### Référentiel
- **Collaborateurs** → `/admin/utilisateurs` (Annuaire recherche)
- **Filiales** → `/admin/filiales` (CRUD + logo/cachet)
- **Équipements** → `/admin/catalogue` (Catalogue 11 categories + packs)

#### Système
- **Modèles d'emails** → `/admin/templates` (CRUD templates + apercu + export/import)
- **Active Directory** → `/admin/ldap` (Sync AD, statut, declenchement manuel)
- **Journal d'audit** → `/admin/audit` (Filtres email/action/dates)
- **Configuration** → `/admin/configuration` (LDAP, SMTP, Entra ID, rappels, tokens)

### Structure Collaborateur (isItStaff = false)

#### Opérations
- **Mes bons** → `/mes-bons` (Bons du collaborateur connecte)

### Composants et Types

**Type NavItem** :
```typescript
type NavItem = {
  to: string;           // Route destination
  icon: React.ElementType;  // Icone lucide-react
  label: string;        // Texte affiche
  badge?: number;       // Badge optionnel (ex: nb contestations)
};
```

**Type NavGroup** :
```typescript
type NavGroup = {
  title: string;        // Titre section (Opérations, Référentiel, Système)
  items: NavItem[];     // Items de la section
};
```

**Composant SidebarSection** : Rend une section avec separateur et badge support.

---

## Routing Frontend

| Route | Composant | Roles requis | Description |
|-------|-----------|-------------|-------------|
| `/login` | LoginPage | — (public) | SSO Entra ID + auth locale |
| `/change-password` | ChangePasswordPage | auth | Changement mdp obligatoire |
| `/unauthorized` | UnauthorizedPage | auth | Page 403 |
| `/signer/:token` | SignaturePage | **public** | Signature electronique (canvas) |
| `/` | redirect | auth | → /dashboard (IT) ou /mes-bons (collab) |
| `/dashboard` | DashboardIT | admin, tech | KPIs, activite recente, filiales |
| `/mes-bons` | PortailCollaborateur | tous | Bons du collaborateur |
| `/bons` | BonsListPage | admin, tech | Liste + filtres + export CSV |
| `/bons/new` | BonCreatePage | admin, tech | Creation bon |
| `/bons/:id` | BonDetailPage | admin, tech | Detail + actions signatures |
| `/admin` | AdminLayout | admin, tech | Section administration |
| `/admin/configuration` | ConfigurationPage | admin, tech | Config systeme (6 sections) |
| `/admin/ldap` | LdapSyncPage | admin, tech | Sync LDAP |
| `/admin/filiales` | FilialesPage | admin, tech | Gestion filiales |
| `/admin/utilisateurs` | UtilisateursPage | admin, tech | Annuaire utilisateurs |
| `/admin/audit` | AuditLogsPage | admin, tech | Journal d'audit |
| `/admin/contestations` | ContestationsPage | admin, tech | Contestations |
| `/admin/templates` | TemplatesPage | admin, tech | Gestion templates email (edit/apercu/reset/export/import) |

---

## Workflow metier

```
                            ┌─────────────────────────────────────────────────┐
                            │                  CYCLE DE VIE                   │
                            └─────────────────────────────────────────────────┘

  IT cree bon          IT envoie           Collab signe           Equipement
  (equipements)        (email+token)       (canvas+mention)       en service
 ┌──────────┐        ┌──────────────┐      ┌───────────┐       ┌──────────┐
 │  draft   │───────>│sent_mise_dispo│─────>│  active   │       │  active  │
 └──────────┘        └──────────────┘      └───────────┘       └──────────┘
                                                 │                    │
                          ┌──────────────────────┘                    │
                          │                                           │
                          v                                           v
                   ┌──────────────┐                          IT lance restitution
                   │  contested   │                          (selection equipements)
                   │  (litige)    │                                    │
                   └──────────────┘                                   v
                          │                                  ┌────────────────┐
                   IT resout/rejette                         │sent_restitution │
                          │                                  └────────────────┘
                          v                                           │
                   ┌──────────┐                              Collab signe retour
                   │  active  │                                       │
                   └──────────┘                                       v
                                                             ┌──────────┐
                                              Tout rendu ───>│ archived │
                                                             └──────────┘
                                                                   ^
                                              Pas tout rendu       │
                                                    │               │
                                                    v               │
                                           ┌──────────────────┐    │
                                           │partially_returned│    │
                                           │  (PV cloture)    │────┘
                                           └──────────────────┘ Collab signe PV
                                                    │
                                           IT retrouve equip.
                                                    │
                                                    v
                                           Avenant PDF (si archive)
                                           ou MAJ PV (si PV en cours)
```

### Actions cles par etape

| Etape | Module backend | Email envoye | PDF genere |
|-------|---------------|-------------|------------|
| Creation bon | bons.service | — | — |
| Envoi mise a dispo | bons.service | mise_dispo_request | — |
| Signature collab | signature.service | confirmation | snapshot mise_dispo |
| Cachet IT | signature.service | — | snapshot mise_dispo |
| Restitution | bons.service | restitution_request | — |
| Signature retour | signature.service | confirmation | snapshot restitution |
| Declaration non-restitue | bons.service | pv_cloture_request | PV cloture |
| Signature PV collab | signature.service | confirmation | snapshot PV |
| Equipement retrouve | bons.service | — | avenant (archive) ou MAJ PV |
| Contestation | contestation.service | contestation_alert | — |
| Resolution | contestation.service | resolution notif | — |
| Rappel auto | notification.service | reminder | — |

---

## Systeme de templates email

9 templates HTML personnalisables stockes en DB (`AppConfig`, category=`email_templates`).

### Templates disponibles

| ID | Nom | Destinataire | Variables cles |
|----|-----|-------------|----------------|
| `mise_disposition_request` | Demande de signature mise a dispo | Collaborateur | COLLAB_NAME, DATE_MISE_DISPO, SIGNER_URL, EQUIP_LIST |
| `restitution_request` | Demande de signature restitution | Collaborateur | COLLAB_NAME, SIGNER_URL, EQUIP_LIST |
| `confirmation_mise_disposition` | Confirmation signature mise a dispo | Collaborateur | REFERENCE, FILIALE_NOM |
| `confirmation_restitution` | Confirmation signature restitution | Collaborateur | REFERENCE, FILIALE_NOM |
| `pv_cloture_request` | PV equipements non restitues a signer | Collaborateur | COLLAB_NAME, SIGNER_URL, NOT_RETURNED_LIST |
| `contestation_alert` | Alerte contestation | Equipe IT | USER_NAME, REFERENCE, CONTESTATION_MESSAGE |
| `contestation_resolved` | Contestation resolue | Collaborateur | REFERENCE, RESOLUTION_MESSAGE |
| `contestation_rejected` | Contestation rejetee | Collaborateur | REFERENCE, RESOLUTION_MESSAGE |
| `reminder` | Rappel signature (cron lun-ven 9h) | Collaborateur | TYPE_LABEL, REFERENCE, SIGNER_URL, REMINDER_NUMBER |

### Architecture

- **TemplatesService** (`@Global`) : service partagé, accessible dans tous les modules
- **Variables** : syntaxe `{{NOM_VARIABLE}}` — remplacées à l'envoi par les données réelles
- **Personnalisation** : stockée en DB (AppConfig) ; le defaut code-source est toujours disponible pour reset
- **Rendu** : `renderTemplate(id, vars)` — remplace les variables, retourne HTML final
- **Apercu** : `getPreviewHtml(id)` — rendu avec donnees exemples (bac à sable)

---

## Infrastructure Docker

### 3 configurations

| Fichier | Usage | Services | Port expose |
|---------|-------|----------|-------------|
| `docker-compose.dev.yml` | Dev local (backend/frontend sur host) | db seul | 5432 |
| `docker-compose.yml` | Dev complet (build local) | db + backend + frontend | 3000 |
| `docker-compose.prod.yml` | Production (images GHCR) | db + backend + frontend | 5147 |

### Production

- **Images** : `ghcr.io/l4curtis/bonmiseadisposition-backend:latest` / `-frontend:latest`
- **Limites memoire** : db non limite, backend 1GB, frontend 128MB
- **Volumes** : `pgdata` (PostgreSQL), `data` (uploads + signatures chiffrees)
- **Demarrage** : Prisma migrate deploy automatique au boot backend

### Nginx reverse proxy (`nginx/nginx.conf`)

- TLS 1.2/1.3 avec ciphers ECDHE
- HSTS 1 an + includeSubDomains
- Rate limiting : 30 req/min API, 10 req/min signatures
- Headers securite : X-Frame-Options, X-Content-Type-Options, CSP implicite

---

## Securite

| Mesure | Implementation |
|--------|---------------|
| Chiffrement secrets | AES-256-GCM (config DB + signatures PNG) |
| Auth | JWT cookies httpOnly + secure + sameSite=lax |
| Tokens access/refresh | 15 min / 8 heures |
| Mots de passe | bcrypt + regles complexite (12 car, maj, min, chiffre, special) |
| Rate limiting | NestJS ThrottlerGuard + Nginx zones |
| Validation | class-validator (whitelist + forbidNonWhitelisted) |
| Upload | MIME + extension whitelist, 5MB max |
| Path traversal | basename() sur noms de fichiers servis |
| CORS | Origin = FRONTEND_URL uniquement |
| Helmet | CSP, X-Frame-Options, X-Content-Type-Options |
| Non-root Docker | UID 1001 backend + frontend |
| Audit trail | Toute action significative loguee avec IP + User-Agent |

---

## Variables d'environnement (.env.example)

| Variable | Obligatoire | Description |
|----------|------------|-------------|
| `ENCRYPTION_KEY` | Oui | Cle AES-256 (64 hex) — ne jamais changer apres 1er lancement |
| `POSTGRES_PASSWORD` | Oui | Mot de passe PostgreSQL |
| `FRONTEND_URL` | Oui | URL publique HTTPS (ex: `https://bons.groupelivio.local`) |
| `FRONTEND_PORT` | Non | Port expose (defaut: 5147) |

> Toute la config applicative (LDAP, SMTP, Entra ID, rappels, SMB) se gere via l'interface `/admin/configuration`.

---

## Dependances principales

### Backend
`@nestjs/*`, `prisma`, `@prisma/client`, `passport`, `passport-jwt`, `@azure/msal-node`, `ldapjs`, `nodemailer`, `pdfkit`, `bcryptjs`, `class-validator`, `class-transformer`, `@nestjs/throttler`, `helmet`, `cookie-parser`

### Frontend
`react`, `react-dom`, `react-router-dom`, `tailwindcss`, `@radix-ui/*`, `lucide-react`, `clsx`, `tailwind-merge`, `vite`
