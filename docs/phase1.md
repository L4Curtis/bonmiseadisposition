# Phase 1 — Fondations

## Fichiers créés

### Racine
| Fichier | Rôle |
|---|---|
| `.gitignore` | Ignore node_modules, dist, .env, data, uploads |
| `.env.example` | Template des 3 variables d'env requises |
| `docker-compose.yml` | Stack production (db + backend + frontend) |
| `docker-compose.dev.yml` | PostgreSQL exposé sur port 5432 pour le dev local |

### Backend — structure NestJS
| Fichier | Rôle |
|---|---|
| `backend/package.json` | Dépendances : NestJS, Prisma, MSAL, passport-jwt, helmet, cookie-parser, dotenv |
| `backend/tsconfig.json` / `tsconfig.build.json` | Config TypeScript |
| `backend/nest-cli.json` | Config CLI NestJS |
| `backend/Dockerfile` | Build multi-stage node:20-alpine, user non-root |
| `backend/.env` | Variables dev (DATABASE_URL avec 127.0.0.1, ENCRYPTION_KEY, NODE_ENV, FRONTEND_URL) |

### Prisma — schéma complet
Fichier : `backend/prisma/schema.prisma`

13 modèles créés :
- `AppConfig` — configuration chiffrée en base (category + key unique)
- `Filiale` — 14 filiales avec logo/cachet
- `User` — utilisateurs synchronisés LDAP
- `EquipmentCatalog` — catalogue d'équipements
- `EquipmentPack` / `EquipmentPackItem` — packs globaux
- `Bon` — bon de mise à disposition (cœur métier)
- `BonEquipment` — lignes d'équipements d'un bon
- `Signature` — tokens de signature + image PNG
- `Contestation` — contestations collaborateur
- `NotificationLog` — log des emails envoyés
- `AuditLog` — audit trail complet

8 enums : `UserRole`, `EquipmentCategory`, `BonStatus`, `Civilite`, `SignatureType`, `ContestationStatus`, `NotificationType`, `NotificationStatus`

### Modules backend
| Module | Fichiers | Rôle |
|---|---|---|
| `PrismaModule` | `prisma.module.ts`, `prisma.service.ts` | Client Prisma global injectable |
| `ConfigModule` | `config.module.ts`, `config.service.ts`, `encryption.service.ts` | Config depuis DB, chiffrement AES-256-GCM, cache 5 min TTL |
| `AuthModule` | `auth.module.ts`, `auth.service.ts`, `auth.controller.ts` | SSO Entra ID via MSAL (config dynamique depuis DB), JWT httpOnly cookies |
| Auth — stratégies/guards | `jwt.strategy.ts`, `jwt-auth.guard.ts`, `roles.guard.ts` | Validation JWT, guard par rôle |
| Auth — decorators | `roles.decorator.ts`, `current-user.decorator.ts` | `@Roles()`, `@CurrentUser()` |
| Health | `health.controller.ts` | `GET /api/health` |

### Points clés du backend
- **Aucune config en variable d'environnement** sauf `DATABASE_URL`, `ENCRYPTION_KEY`, `NODE_ENV`
- ENCRYPTION_KEY → hash SHA-256 → clé AES-256 pour chiffrer les valeurs sensibles en DB
- MSAL lit `tenant_id`, `client_id`, `client_secret`, `redirect_uri` depuis la table `app_config` à chaque requête
- JWT : access token 15 min + refresh token 8h, stockés en httpOnly cookies
- Mapping groupes Entra → rôles via `admin_group_id` / `technician_group_id` en DB
- `GET /api/auth/dev-login` → **DEV uniquement** : crée/met à jour un user et pose les cookies JWT sans SSO

### ⚠️ Prérequis Entra ID — Token configuration (obligatoire pour le mapping des rôles)

Dans **Azure Portal → App Registrations → [ton app] → Token configuration** :
1. Cliquer **"Add groups claim"**
2. Sélectionner **Security groups**
3. Cocher **"ID"** dans la colonne **ID token**
4. Sauvegarder

> Sans cette étape, le claim `groups` est absent du token → tous les utilisateurs SSO sont `collaborator` quel que soit leur groupe Entra.

**Dans l'app** (`/admin/configuration` → Entra ID) :
- `admin_group_id` → Object ID du groupe de sécurité des admins (Azure AD → Groups → [groupe] → Overview → Object ID)
- `technician_group_id` → Object ID du groupe des techniciens
- Tout utilisateur SSO hors de ces groupes → rôle `collaborator` automatiquement

### Frontend — structure React + Vite
| Fichier | Rôle |
|---|---|
| `frontend/package.json` | React 18, React Router, Tailwind, shadcn/ui (Radix), Lucide |
| `frontend/vite.config.ts` | Proxy `/api` → `localhost:4000` |
| `frontend/tailwind.config.ts` | CSS variables pour le thème shadcn |
| `frontend/index.html` | Titre "Bons de Mise à Disposition — Groupe Livio" |
| `frontend/Dockerfile` | Build Vite → Nginx alpine |
| `frontend/nginx.conf` | SPA routing + proxy `/api` → backend |

### Modules frontend
| Fichier | Rôle |
|---|---|
| `src/contexts/AuthContext.tsx` | État global auth, `useAuth()`, `logout()`. Utilise `fetch` direct (pas le wrapper api) pour éviter les boucles de redirect |
| `src/lib/api.ts` | Wrapper fetch avec auto-refresh token sur 401 |
| `src/lib/utils.ts` | `cn()` (clsx + tailwind-merge) |
| `src/types/index.ts` | Types TS : `User`, `Filiale`, `BonStatus` avec labels/couleurs FR |
| `src/App.tsx` | Routing protégé par rôle (IT → `/dashboard`, collaborateur → `/mes-bons`) |

### Pages frontend
| Page | Route | Notes |
|---|---|---|
| `Login.tsx` | `/login` | Bouton "Se connecter avec Microsoft", détecte si setup requis |
| `Setup.tsx` | `/setup` | Placeholder (wizard Phase 2) |
| `DashboardIT.tsx` | `/dashboard` | Cartes stats vides (placeholder Phase 3+) |
| `PortailCollaborateur.tsx` | `/mes-bons` | Placeholder Phase 6 |
| `Unauthorized.tsx` | `/unauthorized` | Page 403 |
| `Layout.tsx` | — | Shell avec Sidebar + Header |
| `Sidebar.tsx` | — | Nav différente selon rôle IT vs collaborateur |
| `Header.tsx` | — | Email user + bouton déconnexion |

## Bugs corrigés en cours de phase
- **Boucle redirect /login ↔ /setup** : `AuthContext` utilisait le wrapper `api` qui redirige sur 401 → remplacé par `fetch` direct
- **DATABASE_URL non trouvée** : NestJS ne charge pas `.env` automatiquement → ajout de `import 'dotenv/config'` en tête de `main.ts`
- **Can't reach database at localhost:5432** : Node.js v17+ résout `localhost` en IPv6 (`::1`) en priorité, Docker n'écoute qu'en IPv4 → changé en `127.0.0.1` dans `.env`
- **`version` obsolète** dans docker-compose.dev.yml : warning cosmétique, sans impact

## Commandes de démarrage dev
```bash
# 1. PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# 2. Migration initiale (une seule fois)
cd backend && npx prisma migrate dev --name init

# 3. Backend
cd backend && npm run start:dev

# 4. Frontend
cd frontend && npm run dev
```

## Login dev (sans SSO configuré)
```javascript
// Console navigateur sur http://localhost:5173
fetch('/api/auth/dev-login', {
  method: 'POST',
  headers: {'Content-Type':'application/json'},
  body: JSON.stringify({email:'admin@test.local', role:'admin'}),
  credentials: 'include'
}).then(() => location.href = '/dashboard')
```
