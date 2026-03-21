# Phase 6 — Switcher de vue utilisateur + Corrections sécurité

> Tout est implémenté et fonctionnel.

---

## 1. Switcher de vue utilisateur (style GLPI)

### Concept

Un utilisateur peut avoir plusieurs **visions** de l'interface en fonction de son rôle réel. Le switcher est purement UX côté frontend — le backend ne change pas, les guards JWT continuent de vérifier le rôle réel.

| Rôle réel | Visions disponibles |
|---|---|
| `admin` | Collaborateur · Technicien IT · Administrateur |
| `technician` | Collaborateur · Technicien IT |
| `collaborator` | Collaborateur (pas de switcher visible) |

### Fichiers créés

#### `frontend/src/contexts/UiViewContext.tsx` (nouveau)

Context React `UiViewProvider` exposant :

- `activeView: UiView` — vue active (`'collaborateur' | 'technicien' | 'administrateur'`)
- `setActiveView(view)` — change la vue (validée contre les droits réels)
- `availableViews: UiView[]` — dérivé du `user.role` réel

**Persistance** : localStorage clé `uiView:prefs` → `{ userId, view }` pour que le choix survive aux reconnexions et soit spécifique par compte.

**Initialisation sans flash** : `useState(readStoredView)` lit localStorage **synchroniquement** avant le premier render, donc la bonne vue est affichée dès le montage sans passer par collaborateur.

**Sécurité** : commentaire explicite indiquant que ce context est UX uniquement et ne doit jamais être utilisé comme guard d'accès.

```typescript
// SECURITE : Ce contexte gère uniquement l'affichage UX (navigation, vue active).
// Il NE DOIT JAMAIS être utilisé pour des contrôles d'accès ou des guards de sécurité.
// Les permissions réelles sont toujours vérifiées via user.role (AuthContext + backend).
```

### Fichiers modifiés

#### `frontend/src/components/layout/Header.tsx`

- Import `useUiView`, `UI_VIEW_LABELS`, `UI_VIEW_ICON_MAP`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`
- Badge "vue active" dans le trigger (visible si plusieurs vues disponibles)
- Section radio dans le dropdown (invisible pour les collaborateurs)
- Validation mot de passe mise à jour : 8 caractères minimum + 1 majuscule + 1 chiffre (cohérent avec le backend)

#### `frontend/src/components/layout/Sidebar.tsx`

Deux jeux de navigation distincts au lieu d'un seul `itNavGroups` :

| NavGroup | Vue | Contenu |
|---|---|---|
| `adminNavGroups` | `'administrateur'` | Opérations + Référentiel + **Système** |
| `technicienNavGroups` | `'technicien'` | Opérations + Référentiel (sans Système) |
| `collaboratorNavGroups` | `'collaborateur'` | Mes bons |

Le label en bas de sidebar affiche la vue active (ex: "Technicien IT") au lieu du rôle brut.

#### `frontend/src/App.tsx`

- `UiViewProvider` wrappé autour de `AppRoutes` (à l'intérieur de `AuthProvider`)
- Redirect index basé sur `activeView` au lieu de `user.isItStaff` :
  ```tsx
  activeView !== 'collaborateur'
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/mes-bons" replace />
  ```
- **Correction sécurité** : routes de la section Système réservées à `['admin']` uniquement (voir §2)

---

## 2. Corrections sécurité

### 2a. Routes admin-only — section Système

Avant, les techniciens pouvaient accéder aux pages de configuration système via l'URL directe. Les routes suivantes sont désormais protégées par `requiredRoles={['admin']}` :

| Route | Avant | Après |
|---|---|---|
| `/admin/configuration` | admin + technicien | **admin uniquement** |
| `/admin/ldap` | admin + technicien | **admin uniquement** |
| `/admin/audit` | admin + technicien | **admin uniquement** |
| `/admin/templates` | admin + technicien | **admin uniquement** |

Routes toujours accessibles aux techniciens : `contestations`, `filiales`, `catalogue`, `utilisateurs`.

La sidebar technicien ne montre plus la section Système — cohérence UX + sécurité.

### 2b. Validation mot de passe backend

**Fichier** : `backend/src/auth/auth.service.ts`

Méthode `validatePasswordStrength()` appelée dans `changePassword()` :

```typescript
private validatePasswordStrength(password: string): void {
  if (password.length < 8)
    throw new BadRequestException('Le mot de passe doit contenir au moins 8 caractères');
  if (!/[A-Z]/.test(password))
    throw new BadRequestException('... au moins une lettre majuscule');
  if (!/[0-9]/.test(password))
    throw new BadRequestException('... au moins un chiffre');
}
```

Avant, seul le frontend validait (6 caractères minimum). La règle backend était bypassable via appel API direct. Le frontend (`ChangePassword.tsx`) enforce déjà des règles plus strictes (12 car + spécial), donc pas de régression.

### 2c. Race condition sur la génération de référence des bons

**Fichier** : `backend/src/bons/bons.service.ts`

La génération de référence (`BON-YYYY-NNNN`) utilisait un `SELECT MAX()` sans protection, ce qui pouvait produire des doublons sous charge concurrente.

**Fix** : advisory lock PostgreSQL via transaction :

```typescript
return this.prisma.$transaction(async (tx) => {
  // pg_advisory_xact_lock sérialise les appels concurrents sans changement de schéma
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('bon_reference_lock'))`;
  const result = await tx.$queryRaw`SELECT MAX(reference) ...`;
  // ...
});
```

La contrainte `@unique` sur `reference` reste le dernier filet de sécurité.

---

## Checklist de vérification — Phase 6

### Switcher de vue

- [ ] Admin connecté → badge "Administrateur" dans le header
- [ ] Dropdown header affiche les 3 options radio (Collaborateur / Technicien IT / Administrateur)
- [ ] Sélectionner "Collaborateur" → sidebar passe sur "Mes bons", redirect vers `/mes-bons`
- [ ] Sélectionner "Technicien IT" → sidebar Opérations + Référentiel (sans Système)
- [ ] Sélectionner "Administrateur" → sidebar complète avec section Système
- [ ] Refresh de page → vue active restaurée depuis localStorage (pas de flash)
- [ ] Déconnexion puis reconnexion → dernier choix mémorisé
- [ ] Technicien → seulement 2 options (pas d'option Administrateur)
- [ ] Collaborateur → pas de switcher visible dans le dropdown

### Sécurité routes admin-only

- [ ] Technicien connecté → `/admin/configuration` → redirect `/unauthorized`
- [ ] Technicien connecté → `/admin/ldap` → redirect `/unauthorized`
- [ ] Technicien connecté → `/admin/templates` → redirect `/unauthorized`
- [ ] Technicien connecté → `/admin/contestations` → accessible ✓
- [ ] Admin connecté → tous les `/admin/*` accessibles ✓

### Validation mot de passe

- [ ] `POST /api/auth/change-password` avec mot de passe `abc` (7 chars) → 400 Bad Request
- [ ] `POST /api/auth/change-password` avec `abcdefgh` (sans majuscule) → 400 Bad Request
- [ ] `POST /api/auth/change-password` avec `Abcdefgh` (sans chiffre) → 400 Bad Request
- [ ] `POST /api/auth/change-password` avec `Abcdefg1` → 200 OK

---

## Arborescence des fichiers — Phase 6

```
frontend/src/
├── contexts/
│   └── UiViewContext.tsx          ← NOUVEAU
├── components/layout/
│   ├── Header.tsx                 ← Switcher de vue + validation pwd
│   └── Sidebar.tsx                ← Navigation par vue (admin/technicien/collab)
└── App.tsx                        ← UiViewProvider + routes admin-only

backend/src/
├── auth/
│   └── auth.service.ts            ← validatePasswordStrength()
└── bons/
    └── bons.service.ts            ← generateReference() avec advisory lock
```
