# Structure du Projet — Bon de Mise a Disposition

> **Mis a jour le 2026-09-17** — Tableau de bord KPI à onglets (module `kpi`), rôle Direction
> (lecture seule), seuil de retard de signature configurable, fusion du module Reporting dans
> l'inventaire. Voir [CHANGELOG.md](CHANGELOG.md) pour le détail complet.
>
> **Mise a jour le 2026-09-16** — Mise à jour pré-production : sécurité (verrouillage composite,
> garde-fou LDAP, plancher RGPD), machine à états des bons corrigée, inventaire du parc prêté,
> rappel avant restitution, historique des emails par bon, régénération des PDF manquants.

## Vue d'ensemble

Application interne pour gerer la mise a disposition d'equipements informatiques aux collaborateurs (organisation multi-filiales) : creation de bons, signature electronique, restitution, archivage PDF.

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
│   ├── INDEX.md                        # Index de navigation de toute la documentation
│   ├── phase1.md                       # Fondations : NestJS, Prisma, React, Docker, Auth
│   ├── phase2.md                       # Admin : LDAP sync, catalogue, filiales, config UI
│   ├── phase3.md                       # Coeur : bons, signatures, PDF, emails, portail collab
│   ├── phase4.md                       # Dashboard IT, audit, export CSV
│   ├── phase5.md                       # Securite, contestations, deploiement prod
│   ├── phase6.md                       # Switcher de vue utilisateur (style GLPI)
│   ├── security.md                     # Reference securite consolidee (phases 6+7, mise a jour continue)
│   ├── SAUVEGARDE-REPRISE.md           # Sauvegarde/restauration, sequestre ENCRYPTION_KEY
│   ├── testing-guide.md                # Guide de tests backend (Jest) et frontend (Vitest)
│   └── phase-legal-compliance.md       # Document de travail conformite legale (non implemente)
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
│   │       ├── 20260319153614_avenant_equipement_retrouve/     # Avenant equipement retrouve
│   │       ├── ... (voir CHANGELOG.md pour les migrations de la mise a jour 2026-09-16)
│   │       ├── 20260916110000_user_role_direction/              # ALTER TYPE UserRole ADD VALUE 'direction' (seule dans sa migration)
│   │       └── 20260916110100_kpi_indexes/                      # 9 index CREATE INDEX IF NOT EXISTS pour les agregats KPI
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
│       │   ├── templates.controller.ts # CRUD templates email (GET/PATCH/DELETE/:id, export, import)
│       │   └── pdf-templates.controller.ts # CRUD templates PDF (7 endpoints, rate limit preview)
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
│       │   ├── pdf.service.ts          # PDFKit : mise_dispo, restitution, PV cloture, avenant
│       │   ├── pdf-template-config.ts  # Interfaces config + defaults + PREVIEW_BON + deepMerge + substituteVars
│       │   ├── pdf-templates.service.ts # CRUD config PDF : getAll, getConfig, update, reset, export/import
│       │   ├── pdf-admin.controller.ts # POST /admin/pdf/regenerate-missing (admin)
│       │   ├── fonts/                  # DejaVu Sans (regular+bold) embarquee — rendu Unicode complet
│       │   └── dto/
│       │       └── update-pdf-template.dto.ts # Validation nested (couleurs hex, tailles, marges, textes)
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
│       │   ├── __tests__/
│       │   │   └── smb.service.spec.ts # 20 tests: export, tracking, retry, cron, sanitize
│       │   ├── smb.module.ts           # Module export partage reseau (imports PrismaModule)
│       │   └── smb.service.ts          # Export PDF vers UNC/montage, tracking DB, retry cron, monitoring
│       │
│       ├── audit/
│       │   ├── audit.module.ts         # Module journal d'audit
│       │   ├── audit.controller.ts     # GET /audit (filtre email/action/date), /audit/actions
│       │   └── audit.service.ts        # Recherche paginee, actions distinctes
│       │
│       ├── contestation/
│       │   ├── contestation.module.ts  # Module contestations
│       │   ├── contestation.controller.ts # GET liste (+ openCount), PATCH review/resolve
│       │   └── contestation.service.ts # Creation, review, resolution + notifications
│       │
│       ├── attachments/
│       │   ├── attachments.module.ts   # Module pieces jointes
│       │   ├── attachments.controller.ts # Upload/telechargement/suppression (restrictions par statut du bon)
│       │   └── attachments.service.ts  # Stockage chiffre, purge (retention.attachment_months)
│       │
│       ├── retention/
│       │   ├── retention.module.ts     # Module retention RGPD
│       │   └── retention.service.ts    # Anonymisation (plancher 60 mois, dry-run), purge tokens/audit/PJ
│       │
│       ├── kpi/                        # Module Tableau de bord KPI (admin, technician, direction)
│       │   ├── kpi.module.ts           # Enregistre le controller + les 3 services + le cache
│       │   ├── kpi.controller.ts       # GET /kpi/parc | /kpi/delais | /kpi/incidents
│       │   ├── kpi-period.ts           # resolvePeriod, periode precedente, granularite, buckets/fillSeries
│       │   ├── kpi-sql.ts              # Fragments Prisma.sql : bornes Paris en UTC naif, filtre filiale, bucketExpr
│       │   ├── kpi-cache.service.ts    # Cache mémoire TTL 60 s, dedoublonnage des promesses en vol, max 200 cles
│       │   ├── kpi-types.ts            # Types de reponse (sections par onglet)
│       │   ├── kpi-parc.service.ts     # Parc prete, retards de restitution, non rendus
│       │   ├── kpi-delais.service.ts   # Volumes, delais creation->envoi->signature, attente
│       │   │   └── delais/             # kpi-delais.service : requetes SQL (delais-queries.ts) + mappers (delais-mappers.ts)
│       │   ├── kpi-incidents.service.ts # Non rendus, PV, clotures, contestations, rappels, emails en echec
│       │   ├── dto/
│       │   │   └── kpi-query.dto.ts    # from?, to? (AAAA-MM-JJ), filialeId? (UUID)
│       │   └── __tests__/              # kpi-period, kpi-sql, kpi-cache.service, kpi.controller, 1 spec par service KPI
│       │
│       └── reporting/                  # Reduit a l'inventaire (reporting.service/controller supprimes, lot 5)
│           ├── reporting.module.ts     # Module inventaire — ne declare plus que InventoryController/InventoryService
│           ├── inventory.controller.ts # GET /reporting/inventory, /summary, /export (admin, technician, direction)
│           ├── inventory.service.ts    # Parc prete : equipements non retournes des bons actifs/en cours
│           └── dto/
│               └── inventory-query.dto.ts # Filtres (filiale, categorie, collaborateur, recherche, pagination, tri)
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
        ├── hooks/
        │   ├── use-api-resource.ts             # loading/error/reload + anti-course ; path=null désactive l'appel
        │   ├── use-open-contestations-count.ts # Badge Sidebar : IT seulement, au plus 1 appel/30 s, silencieux en erreur
        │   ├── use-signature-canvas.ts          # Canvas HTML5 natif de signature
        │   ├── use-toast.ts                     # Notifications toast (file d'attente, 3 s)
        │   └── use-unsaved-changes.ts           # Confirmation avant de quitter un formulaire modifie
        │
        ├── lib/
        │   ├── api.ts                  # Client HTTP : fetch + auto-refresh JWT 401
        │   ├── utils.ts                # cn() : clsx + tailwind-merge
        │   ├── labels.ts               # Libellés FR partagés (dont ROLE_LABELS avec « Direction »)
        │   ├── kpi-format.ts           # Formats FR partagés par les tuiles/graphiques KPI (formatNumber, formatPercent…)
        │   ├── kpi-period.ts           # Presets de période (7j/30j/90j/12 mois), todayInParis, calculs en Date.UTC
        │   ├── bon-helpers.ts          # Aides communes bons (labels de statut, etc.)
        │   ├── errors.ts               # errorMessage() : message d'erreur FR à partir d'une exception API
        │   └── validation.ts           # Validation de formulaires côté client
        │
        ├── contexts/
        │   ├── AuthContext.tsx          # AuthProvider + useAuth() (GET /api/auth/me)
        │   ├── ThemeContext.tsx         # ThemeProvider + useTheme() (light/dark/system)
        │   └── UiViewContext.tsx        # Vue UX active (collaborateur/technicien/administrateur/direction) — affichage uniquement, jamais un guard de sécurité
        │
        ├── components/
        │   ├── layout/
        │   │   ├── Layout.tsx          # Shell : sidebar + header + <Outlet/>
        │   │   ├── Header.tsx          # Barre sup : user info, logout, changement mdp (recherche globale masquée pour direction)
        │   │   └── Sidebar.tsx         # Nav gauche par vue UX : technicien/administrateur (Opérations/Référentiel/Système), direction (Pilotage : Tableau de bord, Inventaire), collaborateur (Mes bons)
        │   │
        │   ├── dashboard/               # Composants partagés par le tableau de bord KPI
        │   │   ├── StatCard.tsx          # Tuile unique (remplace les anciennes copies) : delta vs période précédente, format, tone, onClick
        │   │   ├── BreakdownBars.tsx     # Barres de répartition (catégorie, filiale, statut, motifs…)
        │   │   ├── ChartCard.tsx         # Cadre graphique : titre, skeleton, vide, erreur + Réessayer
        │   │   └── charts/
        │   │       ├── chart-theme.ts    # useChartTheme() : couleurs --chart-1..5 lues via getComputedStyle
        │   │       ├── TimeSeriesChart.tsx # Courbes temporelles (Recharts)
        │   │       ├── DonutChart.tsx    # Répartition en donut
        │   │       └── HorizontalBars.tsx # Barres horizontales
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
            ├── Inventaire.tsx           # Parc prete : filtres, tableau pagine, tuiles resume, export CSV (references de bon non cliquables pour direction)
            ├── PortailCollaborateur.tsx  # Vue collab : a signer, actifs, contestes, historique
            │
            ├── dashboard/               # Page « Tableau de bord » à onglets — remplace DashboardIT.tsx et admin/Reports.tsx (supprimés)
            │   ├── DashboardPage.tsx     # Onglets Aujourd'hui/Parc/Délais/Incidents ; ?tab&from&to&filialeId dans l'URL ; onglet actif seul monté
            │   ├── PeriodSelector.tsx    # Presets 7j/30j/90j/12 mois + période personnalisée
            │   ├── FilialeFilter.tsx     # Filtre filiale global
            │   ├── use-period-params.ts  # Lecture/écriture de la période et de la filiale dans l'URL
            │   ├── types/                # Types de réponse par onglet (common, parc, delais, incidents)
            │   └── tabs/
            │       ├── TodayTab.tsx      # Contenu historique du tableau de bord IT (IT uniquement)
            │       ├── ParcTab.tsx       # + parc/ParcStatCards.tsx, parc/ReturnOverdueTable.tsx
            │       ├── DelaisTab.tsx     # + delais/SignatureDelayBars.tsx, delais/SignatureModeTiles.tsx, delais/WaitingStepsTable.tsx
            │       └── IncidentsTab.tsx  # + incidents/ContestationsSummary.tsx, incidents/RemindersSection.tsx, incidents/incident-stat-cards.ts
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
                ├── Configuration.tsx    # Config : General, LDAP, SMTP, Entra (dont Groupe Direction), Rappels (dont seuil de retard de signature), Tokens
                ├── LdapSync.tsx         # Sync LDAP : statut, declenchement manuel, purge
                ├── Filiales.tsx         # CRUD filiales + upload logo/cachet
                ├── Utilisateurs.tsx     # Annuaire utilisateurs (recherche) + sélecteur de rôle (admin, incl. Direction), désactivé sur sa propre ligne et note SSO pour un compte non local
                ├── Contestations.tsx    # Gestion contestations (open/review/resolve)
                ├── Templates.tsx        # Gestion templates email (edit/apercu/reset/export/import)
                ├── PdfTemplates.tsx     # Gestion templates PDF (4 types, couleurs/polices/marges/textes, preview PDF)
                └── detail/
                    ├── Configuration.tsx # (alias)
                    ├── LdapSync.tsx     # (alias)
                    └── Filiales.tsx     # (alias)
```

---

## Base de donnees (Prisma)

### Modeles (17)

| Modele | Role | Champs cles |
|--------|------|-------------|
| **AppConfig** | Config applicative chiffree | category, key, value, encrypted |
| **Filiale** | Entite organisationnelle | name, displayName, logoPath, stampPath, siret |
| **User** | Utilisateur (LDAP ou local) | samAccountName, email, role, filialeId, passwordHash, mustChangePassword |
| **EquipmentCatalog** | Reference equipement IT | category (enum 11 valeurs), brand, model |
| **EquipmentPack** | Lot pre-configure | name, items[] |
| **EquipmentPackItem** | Element d'un pack | packId, catalogItemId, quantity |
| **Bon** | Bon de mise a disposition | reference (BON-YYYY-NNNN), status, collaborateurId, filialeId, civilite, archivedAt |
| **BonEquipment** | Ligne equipement d'un bon | serialNumber, inventoryNumber, returnedAt, notReturned, notReturnedReason |
| **Signature** | Signature electronique | type, token, signed, signatureImagePath (chiffre), signerEmail, pdfType |
| **Attachment** | Piece jointe d'un bon | bonId, stage, storedPath, mimeType, size, sha256 — purge par `retention.attachment_months` |
| **ProofArchive** | Archive probante append-only (jamais ecrasee) | bonId, type, data (BYTEA), sha256 |
| **PdfSnapshot** | Snapshot PDF « courant » par type (affichage) | type, data (BYTEA), filename, sha256 |
| **SmbExport** | Suivi des exports PDF vers le partage reseau | bonId, filename, status, retryCount, errorMessage |
| **Contestation** | Litige collaborateur | message, status (open→in_review→resolved/rejected) |
| **NotificationLog** | Suivi envoi emails | recipientEmail, type, status, reminderNumber |
| **AuditLog** | Journal d'activite | action, details (JSON), ipAddress |
| **RevokedToken** | Liste de revocation des refresh tokens (persistante) | tokenHash, expiresAt |

### Enums

| Enum | Valeurs |
|------|---------|
| **UserRole** | admin, technician, direction, collaborator — `direction` : lecture seule (tableau de bord KPI, inventaire), jamais `isItStaff` (migration `20260916110000_user_role_direction`, `ALTER TYPE ... ADD VALUE`) |
| **Civilite** | mme, mr |
| **BonStatus** | draft, sent_mise_dispo, active, sent_restitution, partially_returned, archived, cancelled, contested |
| **EquipmentCategory** | pc_portable, pc_fixe, ecran, souris, clavier, casque, telephone, housse, dock, cable, autre |
| **SignatureType** | mise_disposition, restitution, it_cachet, pv_cloture |
| **PdfSnapshotType** | signature_it_mise_disposition, signature_collab_mise_disposition, signature_it_restitution, signature_collab_restitution, cloture_equipements_manquants, avenant_equipement_retrouve |
| **ContestationStatus** | open, in_review, resolved, rejected |
| **NotificationType** | mise_dispo_request, restitution_request, pv_cloture_request, reminder, confirmation, contestation_alert, contestation_resolution, cancellation, mark_found, unilateral_closure, restitution_due_reminder |
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
| GET | `/smb/status` | admin | Statut monitoring SMB (total, succes, echecs, pending) |
| GET | `/smb/failed` | admin | Liste exports echoues avec reference bon |
| POST | `/smb/retry/:id` | admin | Relancer un export echoue |
| POST | `/smb/retry-all` | admin | Relancer tous les exports echoues |
| GET | `/ldap/status` | admin, tech | Statut derniere sync LDAP |
| POST | `/ldap/sync` | admin | Lancer sync LDAP manuelle (interrompue si > 20 % des comptes actifs, et au moins 5, seraient desactives) |
| DELETE | `/ldap/users` | admin | Purger utilisateurs LDAP (desactivation uniquement, jamais de suppression physique) |
| POST | `/users/:id/unlock` | admin | Deverrouiller un compte local (purge les echecs recents, journalise `user_unlocked`) |
| PATCH | `/users/:id/role` | admin | Change le role d'un utilisateur (`admin`, `technician`, `direction`, `collaborator`) ; refuse sur soi-meme et sur le dernier admin actif ; audit `user_role_changed` |
| GET | `/notifications/failed?days=30` | admin | Emails non delivres (fenetre en jours, defaut/max configurables) — migre depuis l'ancien module Reporting ; declare avant `config/:category` |
| POST | `/pdf/regenerate-missing` | admin | Regenere les PdfSnapshot manquants pour les signatures deja signees (route `admin/pdf`, controleur dedie) |

### Templates Email (`/api/admin/email-templates`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech | Liste des 9 templates (nom, categorie, variables, modifie) |
| GET | `/export` | admin, tech | Exporter tous les templates en JSON |
| POST | `/import` | admin, tech | Importer templates depuis JSON |
| GET | `/:id/html` | admin, tech | HTML courant + HTML defaut + variables |
| GET | `/:id/preview` | admin, tech | Apercu rendu avec donnees exemples |
| PATCH | `/:id` | admin, tech | Sauvegarder template personnalise |
| DELETE | `/:id` | admin, tech | Reinitialiser template au defaut |

### Templates PDF (`/api/admin/pdf-templates`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech | Liste des 4 templates (nom, type, modifie) |
| GET | `/export` | admin, tech | Exporter toutes les configs en JSON |
| POST | `/import` | admin | Importer configs depuis JSON |
| GET | `/:id/config` | admin, tech | Config actuelle + defaut + isCustomized + variables |
| GET | `/:id/preview` | admin, tech | Generer PDF apercu (rate limit 10/min) |
| PATCH | `/:id` | admin | Mettre a jour config (partiel, validation nested) |
| DELETE | `/:id` | admin | Reinitialiser au defaut |

### Users (`/api/users`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech | Liste utilisateurs actifs. Avec `?page=&limit=&search=` : reponse paginee ; sans `page`, comportement inchange (tableau complet) |
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
| GET | `/stats` | admin, tech | Compteurs (dont `overdue` via le prédicat commun, `archivedThisMonth` sur `archivedAt`, `overdueThresholdDays`), par filiale |
| GET | `/recent?limit=` | admin, tech | Bons recents |
| GET | `/export?...` | admin, tech | Export CSV (filtres statut/filiale/recherche) |
| GET | `/mes-bons` | tous | Bons du collaborateur connecte |
| GET | `/?page=&limit=&...&overdue=1` | admin, tech | Liste paginee avec filtres ; `overdue=1` : bons en attente de signature depuis plus de 7 jours |
| GET | `/:id` | admin, tech | Detail complet (equipements, signatures, etc.) |
| GET | `/:id/notifications` | tous* | Historique des emails du bon (statut envoi, erreur explicite si echec, ex. `smtp.from` absent) |
| GET | `/:id/integrity` | tous* | Verifie les sceaux HMAC des signatures (preuve d'integrite) |
| POST | `/` | admin, tech | Creer bon (optionnel : depuis un pack) ; refuse si collaborateur/filiale inactif |
| PUT | `/:id` | admin, tech | Modifier bon (statut draft uniquement) |
| DELETE | `/:id` | admin, tech | Annuler bon (status → cancelled) — **refuse (400) des qu'une signature de mise a disposition est signee** (statuts annulables : `draft`, `sent_mise_dispo`) |
| POST | `/:id/send` | admin, tech | Envoyer mise a disposition (email + token). Body optionnel `{ confirmSerialConflicts: true }` : sans lui, un conflit de numero de serie actif renvoie `409 { code: 'serial_conflicts', conflicts }` |
| POST | `/:id/initiate-restitution` | admin, tech | Lancer restitution (selection equipements) |
| POST | `/:id/initiate-inperson` | admin, tech | Signature presentiel (token valable **2h**, pas d'email) |
| POST | `/:id/declare-not-returned` | admin, tech | Declarer non restitue (PV + signature IT) |
| POST | `/:id/mark-found` | admin, tech | Equipement retrouve (avenant si archive ; MAJ du PV si equipements encore en attente — n'archive jamais tant qu'il reste des equipements non traites) |
| POST | `/:id/sign-it` | admin, tech | Cachet IT direct (rate limit 10/min) |
| POST | `/:id/resend` | admin, tech | Renvoyer lien signature |
| POST | `/:id/close-unilateral` | admin, tech | Cloture unilaterale (sans signature collaborateur) |
| GET | `/:id/pdf-snapshots` | tous* | Liste des snapshots PDF existants (tableau, contrat inchangé — consommé tel quel par le portail collaborateur) |
| GET | `/:id/pdf-snapshots/missing` | tous* | `{ missing: string[] }` — types de snapshot attendus (signature signée) mais absents, régénérables via `POST /admin/pdf/regenerate-missing` |
| GET | `/:id/pdf?type=&stage=` | tous* | Telecharger PDF |
| POST | `/:id/contestation` | collab | Creer contestation |

`tous*` = admin, technician, collaborateur (acces restreint a ses propres bons via `verifyCollaboratorAccess`).

### Signature (`/api/signature`)

| Methode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/:token` | Oui | Info bon depuis token (pending/signed/expired ; `{ status: 'cancelled' \| 'contested', reference }` si le bon a ete annule ou conteste entre-temps) |
| GET | `/:token/preview` | Oui | Apercu du PDF avant signature |
| POST | `/:token/sign` | Oui | Signer (canvas dataUrl + mention, rate limit 10/min) |

### Audit (`/api/audit`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/?bonId=&userEmail=&action=&dateFrom=&dateTo=&page=&limit=` | admin, tech | Logs pagines avec filtres |
| GET | `/actions` | admin, tech | Liste actions distinctes (pour filtres) |

### Contestations (`/api/contestations`)

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/?status=&page=&limit=` | admin, tech | Liste contestations paginee ; reponse inclut `openCount` (nombre total de contestations ouvertes, pour le badge de navigation) |
| PATCH | `/:id/review` | admin, tech | Marquer en cours d'examen |
| PATCH | `/:id/resolve` | admin, tech | Resoudre/rejeter (action + message) |

### Inventaire (`/api/reporting/inventory`)

> Module Reporting reduit a l'inventaire (lot 5) : `reporting.service.ts`/`reporting.controller.ts`
> et leur route `/api/reports/*` sont supprimes ; `/admin/reports` redirige cote frontend vers
> `/dashboard?tab=parc`.

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/` | admin, tech, direction | Equipements actuellement chez un collaborateur (bons `active`, `sent_restitution`, `partially_returned`, equipement non retourne). Filtres `filialeId`, `category`, `collaborateurId`, `search`, pagination `page`/`limit`, tri `sort` |
| GET | `/summary` | admin, tech, direction | Comptes agreges par categorie et par filiale |
| GET | `/export` | admin, tech, direction | Export CSV (mêmes filtres), en-tete `X-Truncated` si le resultat depasse la limite |

### KPI — Tableau de bord (`/api/kpi`)

> Accessible a l'IT (admin, technician) et au role Direction (lecture seule). Reponses mises en
> cache 60 s, cle `kpi:<endpoint>:<from>:<to>:<filialeId|''>`, independante du role appelant.
> Query commune : `from`/`to` (AAAA-MM-JJ, defaut 30 derniers jours), `filialeId` (UUID).

| Methode | Route | Roles | Description |
|---------|-------|-------|-------------|
| GET | `/parc` | admin, tech, direction | Parc prete (total, par categorie/filiale, top modeles, hors catalogue, couverture serie, serie historique), retards de restitution, non rendus |
| GET | `/delais` | admin, tech, direction | Volumes crees/envoyes/archives/annules, delais creation→envoi et envoi→signature par type, mode de signature, duree de pret, etapes en attente |
| GET | `/incidents` | admin, tech, direction | Non rendus, PV de cloture, clotures unilaterales, annulations, contestations, rappels par rang, emails en echec |

---

## Navigation Sidebar (Reorganisee 2026-03-21, role Direction ajoute le 2026-09-17)

La sidebar (`Sidebar.tsx`) affiche les groupes de navigation en fonction de la **vue UX active**
(`UiViewContext` — technicien/administrateur/direction/collaborateur), elle-meme derivee du role
reel de l'utilisateur (`getAvailableViews`). Chaque item peut avoir un badge optionnel.

### Structure Technicien / Administrateur (isItStaff = true)

La sidebar est organisee en **3 sections principales** :

#### Opérations
- **Vue d'ensemble** → `/dashboard` (Tableau de bord a onglets : Aujourd'hui, Parc, Delais, Incidents)
- **Bons** → `/bons` (Liste, detail, signatures)
- **Contestations** → `/admin/contestations` (Litige collaborateur, badge = contestations ouvertes)

#### Référentiel
- **Collaborateurs** → `/admin/utilisateurs` (Annuaire recherche + gestion des roles pour admin)
- **Filiales** → `/admin/filiales` (CRUD + logo/cachet)
- **Équipements** → `/admin/catalogue` (Catalogue 11 categories + packs)
- **Inventaire** → `/inventaire` (Parc prete : filtres, export CSV)

#### Système (administrateur uniquement)
- **Modèles d'emails** → `/admin/templates/email` (CRUD templates + apercu + export/import)
- **Modèles PDF** → `/admin/templates/pdf` (Config couleurs/polices/marges/textes + preview PDF)
- **Active Directory** → `/admin/ldap-sync` (Sync AD, statut, declenchement manuel)
- **Journal d'audit** → `/admin/audit` (Filtres email/action/dates)
- **Configuration** → `/admin/configuration` (LDAP, SMTP, Entra ID dont Groupe Direction, rappels dont seuil de retard, tokens)

### Structure Direction (lecture seule)

Une seule section **Pilotage** :
- **Tableau de bord** → `/dashboard` (arrivee sur l'onglet Parc, pas d'onglet Aujourd'hui, pas de bouton « Nouveau bon »)
- **Inventaire** → `/inventaire` (references de bon non cliquables)

Pas de recherche globale (Header), pas d'acces aux bons individuels ni a l'admin.

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
| `/` | redirect | auth | → /dashboard (vue non-collaborateur) ou /mes-bons (vue collaborateur) |
| `/dashboard` | DashboardPage | admin, tech, direction | Tableau de bord a onglets (Aujourd'hui*, Parc, Delais, Incidents) ; periode et filiale dans l'URL ; *Aujourd'hui masque pour direction, qui arrive sur Parc |
| `/inventaire` | InventairePage | admin, tech, direction | Parc prete : filtres, tableau pagine, export CSV (references non cliquables pour direction) |
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
| `/admin/reports` | redirect | admin, tech | → `/dashboard?tab=parc` — ancienne page Reporting, fusionnee dans le tableau de bord (lot 5) |
| `/admin/email-templates` | TemplatesPage | admin | Gestion templates email (edit/apercu/reset/export/import) |
| `/admin/pdf-templates` | PdfTemplatesPage | admin | Gestion templates PDF (couleurs/polices/marges/textes/preview) |

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

### Regles de transition (corrigees, 2026-09-16)

- **PV de cloture derive de l'etat metier** : le PV n'est plus decide par un indicateur separe
  mais recalcule a partir des equipements reellement en attente/non retournes au moment de
  l'action (`emitPvClotureIfDue`, idempotente).
- **`markFound` (equipement retrouve) n'archive jamais** tant qu'il reste des equipements en
  attente de restitution : le bon reste `partially_returned` et seul le PV est mis a jour ; il
  ne passe a `archived` (avec avenant) que si le bon etait deja archive.
- **Transitions conditionnelles** : chaque changement de statut (`initiate-restitution`,
  `declare-not-returned`, `mark-found`, `initiate-inperson`) verifie l'etat de depart dans la
  meme transaction que la mise a jour (`updateMany` avec le statut source attendu) et renvoie
  un conflit (`409`) si le bon a change d'etat entre-temps.
- **Annulation interdite apres signature** : `DELETE /:id` n'est possible que depuis `draft` ou
  `sent_mise_dispo` (voir [security.md](docs/security.md)).

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

## Systeme de templates PDF

4 templates PDF personnalisables via config JSON structuree, stockes en DB (`AppConfig`, category=`pdf_templates`).

### Templates disponibles

| ID | Nom | Type de document |
|----|-----|-----------------|
| `mise_disposition` | Bon de mise a disposition | Remise d'equipements |
| `restitution` | Bon de restitution | Retour d'equipements |
| `cloture` | Proces-verbal de cloture | Equipements non restitues |
| `avenant` | Avenant equipement retrouve | Correction post-cloture |

### Sections de configuration (8)

| Section | Proprietes | Description |
|---------|-----------|-------------|
| `colors` | primary, dark, gray, lightGray, border, headerBg, rowAlt | Schema de couleurs (hex) |
| `fonts` | titleSize, subtitleSize, bodySize, labelSize, tableHeaderSize, tableBodySize | Tailles de police (5-24) |
| `margins` | top, bottom, left, right | Marges du document (10-150) |
| `header` | showLogo, logoMaxHeight/Width, titleText, subtitleText, showReference, showDates | En-tete |
| `infoBoxes` | showCollaborateur, showEntite, collaborateurTitle, entiteTitle | Encadres d'information |
| `table` | sectionTitle, showRowNumbers, emptyMessage | Tableau des equipements |
| `signatures` | showSignatures, itTitle, itMention, collabTitle, collabMention | Blocs de signature |
| `footer` | showFooter, footerText | Pied de page |

### Architecture

- **PdfTemplatesService** : CRUD config, deep merge (defaut + custom), cache via AppConfigService
- **Variables** : syntaxe `{{NOM}}` dans les champs texte — FILIALE, REFERENCE, DATE, TIME, COLLAB_NAME, STATUS
- **Personnalisation** : seules les proprietes modifiees sont stockees ; merge avec les defauts au chargement
- **Preview** : generation PDF avec donnees fictives (PREVIEW_BON), retour binaire `application/pdf`
- **Validation** : DTOs nested avec class-validator (couleurs hex, tailles min/max, textes max 500 car)
- **Securite** : config JSON typee (pas d'eval/HTML), rate limit preview 10/min, audit log chaque modification
- **Layout dynamique** : hauteur des info boxes calculee via `heightOfString()`, multi-pages automatique pour les equipements

---

## Nouveautes (2026-09-17) — Tableau de bord KPI et role Direction

| Fonctionnalite | Description |
|-----------------|-------------|
| Tableau de bord a onglets | `/dashboard` (Aujourd'hui, Parc, Delais, Incidents) — periode (7j/30j/90j/12 mois/personnalisee) et filiale dans l'URL, comparaison a la periode precedente, graphiques Recharts |
| Module `kpi` | `GET /api/kpi/parc\|delais\|incidents` — cache 60 s, une seule definition partagee du retard de signature et du parc prete (`common/bon-predicates.ts`) |
| Role Direction | Lecture seule : tableau de bord (sauf Aujourd'hui) et inventaire ; attribution par groupe Entra (`entra.direction_group_id`) ou manuelle (comptes locaux uniquement, ecrasee par les groupes a la prochaine connexion SSO) |
| Seuil de retard configurable | `rappels.signature_overdue_days` (defaut 7, min 1) remplace la constante fixe, partagee par `/bons`, `/bons/stats` et `/kpi/delais` |
| Retrait du module Reporting | `reporting.service.ts`/`reporting.controller.ts` supprimes ; `/admin/reports` redirige vers `/dashboard?tab=parc` ; le module ne garde que l'inventaire |

Voir [CHANGELOG.md](CHANGELOG.md) (entree du 2026-09-17) pour le detail complet.

---

## Nouveautes pre-production (2026-09-16)

| Fonctionnalite | Description |
|-----------------|-------------|
| Vue Inventaire | Page `/inventaire` + `GET /api/reporting/inventory*` : parc d'equipements actuellement chez les collaborateurs |
| Rappel avant restitution | Cron quotidien (config `rappels.restitution_before_days`, defaut 7 jours, 0 = desactive) ; template email `restitution_due_reminder` |
| Historique des emails du bon | `GET /api/bons/:id/notifications` — statut d'envoi et message d'erreur explicite par email |
| Regeneration des PDF manquants | `POST /api/admin/pdf/regenerate-missing` (admin) — regenere les `PdfSnapshot` absents pour des signatures deja signees |
| Purge des pieces jointes | `retention.attachment_months` — purge independante du plancher de 60 mois de l'anonymisation |
| Cachet de filiale sur le PDF | Le `stampPath` de la filiale est imprime dans la case IT si defini |
| Numeros de ligne PDF | Colonne `#` optionnelle dans le tableau des equipements (`table.showRowNumbers`) |
| Police Unicode embarquee | DejaVu Sans (regular + bold) remplace les polices AFM (Helvetica) non Unicode de PDFKit |

Voir [CHANGELOG.md](CHANGELOG.md) pour la liste complete des corrections de cette mise a jour.

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
| `FRONTEND_URL` | Oui | URL publique HTTPS (ex: `https://bons.exemple.local`) |
| `FRONTEND_PORT` | Non | Port expose (defaut: 5147) |

> Toute la config applicative (LDAP, SMTP, Entra ID, rappels, SMB) se gere via l'interface `/admin/configuration`.

---

## Dependances principales

### Backend
`@nestjs/*`, `prisma`, `@prisma/client`, `passport`, `passport-jwt`, `@azure/msal-node`, `ldapjs`, `nodemailer`, `pdfkit`, `bcryptjs`, `class-validator`, `class-transformer`, `@nestjs/throttler`, `helmet`, `cookie-parser`

### Frontend
`react`, `react-dom`, `react-router-dom`, `tailwindcss`, `@radix-ui/*`, `lucide-react`, `clsx`, `tailwind-merge`, `vite`
