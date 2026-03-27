# Phase 2 — Administration et données de base

## Nouvelles dépendances backend
Ajoutées dans `backend/package.json` :
- `ldapjs` + `@types/ldapjs` — connexion LDAP/LDAPS
- `multer` + `@types/multer` — upload fichiers (logos, cachets)
- `nodemailer` + `@types/nodemailer` — test connexion SMTP
- `uuid` + `@types/uuid` — génération UUID pour noms de fichiers
- `dotenv` — chargement explicite du `.env`
- `bcryptjs` + `@types/bcryptjs` — hachage mots de passe comptes locaux

## Nouveaux modules backend

### AdminModule
| Fichier | Rôle |
|---|---|
| `src/admin/admin.module.ts` | Import LdapModule |
| `src/admin/admin.service.ts` | Test SMTP avec envoi email réel optionnel (`testEmail?`), test Entra ID |
| `src/admin/admin.controller.ts` | Routes admin, protégées `@Roles('admin', 'technician')` |
| `src/admin/dto/config.dto.ts` | DTOs pour la mise à jour de config |

**Routes exposées :**
| Méthode | Route | Rôle requis | Action |
|---|---|---|---|
| GET | `/api/admin/config/:category` | admin/technician | Lire une section de config (valeurs masquées si chiffrées) |
| PUT | `/api/admin/config/:category` | admin | Sauvegarder une section (body = Record<string,string>) |
| POST | `/api/admin/config/test/ldap` | admin | Test connexion LDAP |
| POST | `/api/admin/config/test/smtp` | admin | Test connexion SMTP |
| POST | `/api/admin/config/test/entra` | admin | Test token Entra ID |
| GET | `/api/admin/ldap/status` | admin/technician | Statut dernière sync LDAP |
| POST | `/api/admin/ldap/sync` | admin | Déclencher sync manuelle (async) |

**Clés chiffrées automatiquement par catégorie :**
- `ldap` : `bind_password`
- `entra` : `client_secret`
- `smtp` : `password`, `graph_client_secret`

### LdapModule
| Fichier | Rôle |
|---|---|
| `src/ldap/ldap.module.ts` | Export LdapService |
| `src/ldap/ldap.service.ts` | Connexion LDAP/LDAPS, sync users, cron 6h |

**Comportement :**
- Cron `@Cron('0 */6 * * *')` — ne s'exécute que si `ldap.enabled === 'true'` ET `ldap.url` est configuré
- `testConnection()` — bind LDAP et retourne `{success, message}`
- `syncUsers()` — search AD avec filtre configurable → upsert table `users` → mappage filiale via champ `company`
- `getSyncStatus()` — retourne lastSync, lastSyncSuccess, lastSyncCount, lastSyncError
- Attributs synchronisés : `sAMAccountName`, `displayName`, `mail`, `department`, `company`, `title`
- API ldapjs : utilise `entry.object` (ldapjs v3)
- `SyncStatus` interface exportée (requis pour AdminController)

**Clés de config utilisées (`category: ldap`) :**
- `enabled` — `true`/`false` (toggle UI) — **obligatoire, sinon cron ignoré**
- `url` — ex: `ldaps://dc.entreprise.local:636`
- `use_ssl` — `true`/`false`
- `bind_dn`, `bind_password`
- `search_base`, `user_filter`
- `sync_interval_hours` (non encore dynamique, TODO phase future)

### FilialesModule
| Fichier | Rôle |
|---|---|
| `src/filiales/filiales.module.ts` | MulterModule avec diskStorage dans `../data/uploads/` |
| `src/filiales/filiales.service.ts` | CRUD filiales + upload logo/cachet + suppression fichiers |
| `src/filiales/filiales.controller.ts` | Routes REST filiales |
| `src/filiales/dto/filiale.dto.ts` | CreateFilialeDto, UpdateFilialeDto |

**Routes exposées :**
| Méthode | Route | Rôle | Action |
|---|---|---|---|
| GET | `/api/filiales` | authentifié | Liste toutes les filiales |
| GET | `/api/filiales/active` | authentifié | Filiales actives uniquement |
| GET | `/api/filiales/:id` | authentifié | Détail filiale |
| GET | `/api/filiales/file/:filename` | authentifié | Servir un fichier uploadé (logo/cachet) |
| POST | `/api/filiales` | admin/technician | Créer une filiale |
| PUT | `/api/filiales/:id` | admin/technician | Modifier une filiale |
| PATCH | `/api/filiales/:id/logo` | admin/technician | Upload logo (multipart/form-data, champ `file`) |
| PATCH | `/api/filiales/:id/stamp` | admin/technician | Upload cachet IT |
| DELETE | `/api/filiales/:id` | admin | Supprimer (supprime aussi les fichiers) |

**Stockage fichiers :** `{racine}/data/uploads/{uuid}.{ext}` — dans le volume Docker `data`

### EquipmentModule
| Fichier | Rôle |
|---|---|
| `src/equipment/equipment.module.ts` | Module simple |
| `src/equipment/equipment.service.ts` | CRUD catalogue + packs |
| `src/equipment/equipment.controller.ts` | Routes REST catalogue + packs |
| `src/equipment/dto/equipment.dto.ts` | DTOs avec enum catégories |

**Routes catalogue :**
| Méthode | Route | Action |
|---|---|---|
| GET | `/api/equipment/catalog` | Tous les items |
| GET | `/api/equipment/catalog/active` | Items actifs |
| GET | `/api/equipment/catalog/search?q=` | Recherche full-text (brand, model, description) |
| GET | `/api/equipment/catalog/:id` | Détail item |
| POST | `/api/equipment/catalog` | Créer item |
| PUT | `/api/equipment/catalog/:id` | Modifier item |
| DELETE | `/api/equipment/catalog/:id` | Désactiver (soft delete) |

**Routes packs :**
| Méthode | Route | Action |
|---|---|---|
| GET | `/api/equipment/packs` | Tous les packs (avec items inclus) |
| GET | `/api/equipment/packs/active` | Packs actifs |
| GET | `/api/equipment/packs/:id` | Détail pack |
| POST | `/api/equipment/packs` | Créer pack (avec items optionnels) |
| PUT | `/api/equipment/packs/:id` | Modifier pack (remplace tous les items si fournis) |
| DELETE | `/api/equipment/packs/:id` | Désactiver |

**Catégories disponibles :** `pc_portable`, `pc_fixe`, `ecran`, `souris`, `clavier`, `casque`, `telephone`, `housse`, `dock`, `cable`, `autre`

### UsersModule
| Fichier | Rôle |
|---|---|
| `src/users/users.module.ts` | Module simple |
| `src/users/users.service.ts` | findAll, search (autocomplete), findOne |
| `src/users/users.controller.ts` | Routes REST users (admin/technician uniquement) |

**Routes exposées :**
| Méthode | Route | Action |
|---|---|---|
| GET | `/api/users` | Liste tous les users actifs (filtres: filialeId, role) |
| GET | `/api/users/search?q=` | Recherche autocomplete (nom, email, sAMAccountName) — max 15 résultats |
| GET | `/api/users/:id` | Détail user |

## Modifications fichiers existants

### `backend/prisma/schema.prisma`
Ajout sur le modèle `User` :
- `passwordHash String? @map("password_hash")` — hash bcrypt pour comptes locaux
- `isLocalAccount Boolean @default(false) @map("is_local_account")` — flag compte local

Migration appliquée : `add-local-auth`

### `src/main.ts`
- Ajout `mkdirSync(../data/uploads, { recursive: true })` au démarrage
- Appel `authService.ensureDefaultAdmin()` après `app.listen()` — crée le compte local par défaut et initialise `local_auth_enabled = true` en DB

### `src/app.module.ts`
Ajout des 5 nouveaux modules : `AdminModule`, `LdapModule`, `FilialesModule`, `EquipmentModule`, `UsersModule`.

### `src/config/config.service.ts`
`isSetupRequired()` — retourne `false` si un compte local admin actif existe en DB (évite la redirection vers /setup quand Entra ID n'est pas encore configuré).

### `src/auth/auth.service.ts`
- Ajout `createTokensForUser(user)` — factorise la création de paire access/refresh tokens
- Ajout `localLogin(email, password)` — vérifie bcrypt, lève 401 si KO
- Ajout `changePassword(userId, currentPwd, newPwd)` — vérifie mdp actuel, hash le nouveau
- Ajout `ensureDefaultAdmin()` — appelé au démarrage :
  - Initialise `general.local_auth_enabled = true` si absent en DB
  - Crée `admin@local` / `admin` (hash bcrypt) si aucun compte local admin n'existe
  - Si un user avec `email = admin@local` existe sans flag `isLocalAccount`, il est upgradé

### `src/auth/auth.controller.ts`
- Ajout `POST /api/auth/dev-login` (DEV uniquement, `NODE_ENV=development`)
- Ajout `POST /api/auth/local-login` — auth locale (bloquée si `local_auth_enabled = false`)
- Ajout `POST /api/auth/change-password` — JWT-guarded, comptes locaux uniquement
- Ajout `GET /api/auth/local-auth-status` — retourne `{ enabled: boolean }` (public)
- Suppression redirection vers `/setup` — redirige vers `/login?error=entra_config_missing`

## Page /setup supprimée
- `frontend/src/pages/Setup.tsx` supprimé
- Route `/setup` redirige vers `/login` (évite toute faille d'accès en prod)
- `AuthContext` et `Login.tsx` ne redirigent plus jamais vers `/setup`

## Nouveaux composants UI frontend

### Composants shadcn/ui créés
`src/components/ui/` :
- `button.tsx` — variantes : default, destructive, outline, secondary, ghost, link
- `input.tsx`
- `label.tsx` (Radix)
- `badge.tsx` — variantes supplémentaires : success, warning, error
- `select.tsx` (Radix)
- `card.tsx` — Card, CardHeader, CardTitle, CardContent
- `separator.tsx` (Radix)

## Panel admin frontend

### Layout admin
`src/pages/admin/AdminLayout.tsx` — routing pour pages admin (rôles `admin` et `technician`).

**Routes admin** (toutes sous `/admin`) :
| Route | Composant | Rôle | Contenu |
|---|---|---|---|
| `/admin/configuration` | `Configuration.tsx` | admin, tech | 6 sections de config avec toggles et boutons test |
| `/admin/ldap` | `LdapSync.tsx` | admin, tech | Statut sync + bouton sync manuelle |
| `/admin/filiales` | `Filiales.tsx` | admin, tech | CRUD filiales + upload logo/cachet |
| `/admin/utilisateurs` | `Utilisateurs.tsx` | admin, tech | Liste + recherche autocomplete |
| `/admin/contestations` | `Contestations.tsx` | admin, tech | Gestion contestations |
| `/admin/email-templates` | `Templates.tsx` | admin, tech | Gestion templates email |
| `/admin/audit` | `AuditLogs.tsx` | admin, tech | Journal d'audit |

**Navigation sidebar principale** (réorganisée Phase 2026-03-21) :
- Structure en 3 sections pour rôle IT staff (Opérations, Référentiel, Système)
- Section Opérations : Vue d'ensemble, Bons, Contestations
- Section Référentiel : Collaborateurs, Filiales, Équipements
- Section Système : Modèles d'emails, Active Directory, Journal d'audit, Configuration
- Support de badges optionnels sur les items (ex: nb contestations non lues)

### Page Configuration (`/admin/configuration`)
Composant réutilisable `ConfigSection` avec :
- Chargement automatique des valeurs depuis `GET /api/admin/config/:category`
- **Toggle switch** (composant inline Tailwind) pour les champs booléens — stocke `'true'`/`'false'` en DB
- `defaultValue` par champ — le toggle "Connexion locale activée" s'affiche ON même si la DB est vide
- Masquage des champs chiffrés (`••••••••`), effacé au focus
- Sauvegarde via `PUT /api/admin/config/:category`
- Composant `TestButton` : appel API + affichage résultat succès/échec avec icône

**Sections configurables :**
1. **Paramètres généraux** — `local_auth_enabled` (toggle, défaut ON)
2. **LDAP/AD** — `enabled` (toggle), `use_ssl` (toggle), url, bind_dn, bind_password, search_base, user_filter, sync_interval_hours
3. **Entra ID** — tenant_id, client_id, client_secret, redirect_uri, admin_group_id, technician_group_id
4. **SMTP** — `secure` (toggle), host, port, user, password, from + `SmtpTestButton` (champ email → envoi réel)
5. **Rappels** — `enabled` (toggle), delay_1, delay_2, delay_3
6. **Tokens** — expiry_days

### Page Filiales (`/admin/filiales`)
- Liste toutes les filiales avec preview logo inline
- Formulaire création/édition inline (sans modal)
- Upload logo et cachet IT par bouton fichier
- Activation/désactivation, suppression avec confirmation

### Page Catalogue (`/admin/catalogue`)
- **Onglet Catalogue** : tableau avec formulaire inline création/édition, désactivation soft
- **Onglet Packs** : liste accordéon avec items, création par nom + Entrée
- `PackItemAdder` : recherche client-side sur `allItems` (déjà chargés) — évite les conflits de routing NestJS `catalog/search` vs `catalog/:id`. Dropdown max 15 résultats, add/remove/quantité par item.

### Page Utilisateurs (`/admin/utilisateurs`)
- Tableau complet avec colonnes nom/email/service/filiale/rôle/statut
- Recherche autocomplete avec debounce 300ms
- Message d'aide si table vide (sync LDAP requise)

### Header (`src/components/layout/Header.tsx`)
- Badge `local` affiché pour les comptes locaux
- Bouton "Mot de passe" visible uniquement pour les comptes locaux → ouvre `ChangePasswordModal`
- `ChangePasswordModal` : mdp actuel + nouveau + confirmation → `POST /api/auth/change-password`

### Page Login (`src/pages/Login.tsx`)
- Bouton SSO Microsoft (toujours affiché)
- Section collapsible "Connexion avec un compte local" — visible uniquement si `local_auth_enabled = true`
- Compte par défaut indiqué : `admin@local` / `admin`

### `src/App.tsx` mis à jour
- Routes imbriquées admin sous `<AdminLayout>`
- `/setup` → redirect vers `/login`

## Compte local par défaut
| Champ | Valeur |
|---|---|
| Email | `admin@local` |
| Mot de passe | `admin` |
| Rôle | `admin` |
| samAccountName | `admin_local` |

**À changer dès le premier démarrage** via le bouton "Mot de passe" dans le header.

## Bugs corrigés en phase 2
- **TS4053 `SyncStatus` non exporté** : interface rendue `export` dans `ldap.service.ts`
- **TS2339 `entry.pojo` inexistant** : ldapjs v3 → remplacé par `entry.object`
- **LDAP cron erreur si non configuré** : check `ldap.enabled === 'true'` avant toute opération
- **Redirection /setup en boucle** : `isSetupRequired()` retourne `false` si un admin local existe
- **Unique constraint `sam_account_name`** : `ensureDefaultAdmin` utilise `samAccountName = 'admin_local'` et gère l'upsert proprement
- **Pack item search vide** : recherche client-side sur `allItems` prop au lieu d'appel API `catalog/search`
- **Toggle booléen affiché OFF** : ajout `defaultValue` sur les champs toggle + initialisation en DB au démarrage

## Commandes après phase 2
```bash
cd backend && npm install                            # installe bcryptjs + autres
npx prisma migrate dev --name add-local-auth         # ajoute password_hash, is_local_account
npm run start:dev                                    # crée admin@local au premier démarrage

cd frontend && npm run dev
```

## Login (sans SSO configuré)
`http://localhost:5173/login` → "Connexion avec un compte local" → `admin@local` / `admin`
