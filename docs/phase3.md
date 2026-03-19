# Phase 3 — Bons, Signature, Notifications, Portail collaborateur

> Cette phase couvre les semaines 5 à 14 du planning initial (phases 3, 4, 5 et 6 fusionnées).
> Tout est implémenté et fonctionnel.

---

## Nouvelles dépendances backend
- `puppeteer` — génération PDF headless (Chromium)
- `@nestjs/schedule` + `cron` — cron jobs (rappels, sync LDAP)
- `nodemailer` (déjà installé en phase 2, utilisé ici pour les notifications)

---

## Nouveaux modules backend

### BonsModule — `src/bons/`
| Fichier | Rôle |
|---|---|
| `bons.module.ts` | Imports : SignatureModule, NotificationModule, PdfModule |
| `bons.service.ts` | CRUD bons, envoi, restitution, présentiel, mes-bons |
| `bons.controller.ts` | Routes REST bons + téléchargement PDF |
| `dto/bon.dto.ts` | CreateBonDto, UpdateBonDto avec validation class-validator |

**Routes exposées :**
| Méthode | Route | Rôle | Action |
|---|---|---|---|
| GET | `/api/bons` | admin/technician | Liste paginée (filtres : status, filialeId, q) |
| GET | `/api/bons/mes-bons` | **admin/technician/collaborator** | Bons du collaborateur connecté |
| GET | `/api/bons/stats` | admin/technician | Compteurs dashboard |
| GET | `/api/bons/:id` | admin/technician | Détail complet d'un bon |
| GET | `/api/bons/:id/pdf?type=...` | admin/technician | Télécharger le PDF (snapshot DB ou génération à la volée) |
| POST | `/api/bons` | admin/technician | Créer un bon (draft) |
| PUT | `/api/bons/:id` | admin/technician | Modifier un bon (draft uniquement) |
| DELETE | `/api/bons/:id` | admin/technician | Annuler un bon |
| POST | `/api/bons/:id/send` | admin/technician | Envoyer pour signature (draft → sent_mise_dispo) |
| POST | `/api/bons/:id/initiate-restitution` | admin/technician | Initier restitution (active → sent_restitution) |
| POST | `/api/bons/:id/initiate-inperson` | admin/technician | Mode présentiel (retourne `{bon, token}`) |
| POST | `/api/bons/:id/sign-it` | admin/technician | Apposer le cachet IT — body : `{ signatureDataUrl, pdfType? }` |

**Constante `BON_INCLUDE`** — incluse dans toutes les requêtes :
```typescript
{ filiale, collaborateur, createdBy, equipments (+ catalogItem), signatures }
```

**Cycle de vie statuts :**
```
draft → sent_mise_dispo → active → sent_restitution → archived
                      ↘ (présentiel) ↗
```

**Flux cachet IT :**
Le cachet IT est **obligatoire et intégré** dans chaque action déclenchée depuis `BonDetail`. L'IT ne signe pas via un bouton indépendant — il signe dans une modal qui s'ouvre **avant** l'action :

```
"Envoyer" cliqué par IT
  → Modal cachet IT (pdfType=mise_disposition)
  → IT trace sa signature → POST /bons/:id/sign-it { pdfType: 'mise_disposition' }
  → Puis : POST /bons/:id/send  (email envoyé au collaborateur)

"Présentiel" cliqué par IT
  → Modal cachet IT (pdfType=mise_disposition)
  → IT signe → POST /bons/:id/sign-it
  → Puis : POST /bons/:id/initiate-inperson  (lien présentiel affiché)

"Initier restitution" cliqué par IT
  → Modal cachet IT (pdfType=restitution)
  → IT signe → POST /bons/:id/sign-it { pdfType: 'restitution' }
  → Puis : POST /bons/:id/initiate-restitution

"Restitution présentielle" cliqué par IT
  → Modal cachet IT (pdfType=restitution)
  → IT signe → Puis : POST /bons/:id/initiate-inperson
```

> Le paramètre `pdfType` transmis au body de `sign-it` détermine dans quel snapshot PDF la signature IT est intégrée.
> Si absent, le service déduit le type depuis le statut courant du bon (fallback).

---

### PdfModule — `src/pdf/`
| Fichier | Rôle |
|---|---|
| `pdf.module.ts` | Imports : PrismaModule. Exports PdfService. |
| `pdf.service.ts` | Rendu HTML+Puppeteer, génération à la demande ou snapshot DB |

**Méthodes publiques :**
| Méthode | Description |
|---|---|
| `generateBonMiseDisposition(bon, sigImages?)` | Génère PDF en mémoire (sans sauvegarder) |
| `generateAndSave(bon, type, sigImages?)` | Génère PDF + sauvegarde `Bytes` en DB + horodate |

**PDF généré :**
- Header avec logo filiale (base64 inline) ou nom filiale en texte
- Bloc collaborateur / filiale (SIRET, adresse)
- Tableau équipements numérotés (désignation, n° série, n° inventaire, remarques)
- Remarques générales (si remplies)
- Zone signatures : image PNG de signature si signée, sinon zone vierge tiretée + date
- Footer avec date/heure de génération et référence

**Snapshots PDF en base (immuables) :**
- `bon.pdfMiseDispoSnapshot Bytes?` + `bon.pdfMiseDispoSnapshotAt`
- `bon.pdfRestitutionSnapshot Bytes?` + `bon.pdfRestitutionSnapshotAt`
- Générés automatiquement (fire & forget) après chaque signature
- `GET /api/bons/:id/pdf?type=mise_disposition|restitution` sert depuis la DB si disponible

Migration : `20260318191452_add_pdf_snapshots`

---

### SignatureModule — `src/signature/`
| Fichier | Rôle |
|---|---|
| `signature.module.ts` | Imports : PrismaModule, ConfigModule, NotificationModule, PdfModule |
| `signature.service.ts` | Tokens, validation, chiffrement PNG, snapshot PDF |
| `signature.controller.ts` | Routes publiques (get info) + protégée JWT (sign) |
| `dto/sign.dto.ts` | `{ signatureDataUrl: string, mentionLuApprouve: boolean }` |

**Routes exposées :**
| Méthode | Route | Auth | Action |
|---|---|---|---|
| GET | `/api/signature/:token` | Publique | Info bon + statut token (pending / expired / already_signed) |
| POST | `/api/signature/:token/sign` | JWT | Signer le document |

**Méthodes clés de `SignatureService` :**
| Méthode | Description |
|---|---|
| `generateToken(bonId, type, initiatedById?, isInPerson?)` | Crée Signature avec UUID token 7 jours, invalide les précédents |
| `getBonInfoByToken(token)` | Retourne `{status, bon, signature}` sans auth |
| `sign(token, dataUrl, mention, email, ip, ua)` | Valide, sauvegarde PNG chiffré, met à jour statut, audit log, déclenche snapshot PDF |
| `signItCachet(bonId, dataUrl, email, ip, ua, pdfType?)` | Appose le cachet IT — `pdfType` explicite (`mise_disposition` ou `restitution`) ; si absent, déduit depuis le statut du bon |
| `getSignatureImageDecrypted(path)` | Déchiffre le PNG AES-256-GCM depuis disque |
| `generatePdfSnapshot(bon, type)` | (privé) Déchiffre images + appelle `PdfService.generateAndSave()` |

**Chiffrement PNG :**
- PNG stocké en `data/signatures/{bonId}_{type}_{timestamp}.enc`
- Chiffré avec `EncryptionService` (AES-256-GCM, même clé que config)
- Chemin relatif stocké dans `signature.signatureImagePath`

**Vérification email :**
- Mode normal : `signerEmail === bon.collaborateurEmail` (insensible à la casse) — rejeté si différent
- Mode présentiel (`isInPerson = true`) : vérification email ignorée

**Transitions de statut après signature :**
- `mise_disposition` signé → `active`
- `restitution` signé → `archived`

---

### NotificationModule — `src/notification/`
| Fichier | Rôle |
|---|---|
| `notification.module.ts` | Imports : ConfigModule, PrismaModule |
| `notification.service.ts` | Templates email HTML, cron rappels, log en DB |

**Méthodes :**
| Méthode | Déclencheur | Destinataire |
|---|---|---|
| `sendMiseDispositionRequest(bon, token)` | `BonsService.send()` | Collaborateur |
| `sendRestitutionRequest(bon, token)` | `BonsService.initiateRestitution()` | Collaborateur |
| `sendConfirmation(bon, type)` | (disponible) | Collaborateur |
| `sendReminders()` | Cron `0 9 * * 1-5` (lun-ven 9h) | Collaborateurs avec bons en attente depuis N jours |

**Rappels automatiques :**
- Cron lun-ven 9h du matin
- Délais configurables en DB : `rappels.delay_1`, `delay_2`, `delay_3` (ex: 3, 7, 14 jours)
- Activé/désactivé via `rappels.enabled`
- Log dans `NotificationLog` : type, statut (sent/failed), message erreur si KO

**Config SMTP lue dynamiquement** depuis `AppConfigService` : host, port, user, password, secure, from

---

## Modifications schema Prisma

### Modèle `Bon`
Ajout (migration `add_pdf_snapshots`) :
```prisma
pdfMiseDispoSnapshot     Bytes?    @map("pdf_mise_dispo_snapshot")
pdfMiseDispoSnapshotAt   DateTime? @map("pdf_mise_dispo_snapshot_at")
pdfRestitutionSnapshot   Bytes?    @map("pdf_restitution_snapshot")
pdfRestitutionSnapshotAt DateTime? @map("pdf_restitution_snapshot_at")
```
> Les anciens champs `pdfMiseDispoPath`/`pdfRestitutionPath` (String) ont été remplacés.

---

## Modifications modules existants

### `src/app.module.ts`
Ajout dans les imports (ordre important pour l'injection) :
```
NotificationModule, SignatureModule, BonsModule
```
`ScheduleModule.forRoot()` requis pour les crons.

### `src/auth/auth.controller.ts`
- `GET /api/auth/login` accepte `?returnTo=` → stocké en cookie httpOnly `auth_return_to` (10 min)
- `GET /api/auth/callback` lit le cookie, redirige vers `returnTo` après SSO (validation : doit commencer par `/`)

### `src/ldap/ldap.service.ts`
**Fix crash Node.js** : `createClient()` attache immédiatement `client.on('error', handler)` pour éviter l'événement non géré qui crashait le process quand le serveur LDAP était inaccessible (ENOTFOUND).

### `src/admin/admin.service.ts` + `admin.controller.ts`
`testSmtp(testEmail?: string)` : si `testEmail` fourni, envoie un vrai email HTML de test après `transporter.verify()`.

---

## Nouvelles pages frontend

### `SignaturePage` — `/signer/:token`
Fichier : `src/pages/signature/SignaturePage.tsx`

- **Route publique** (avant les routes protégées dans `App.tsx`)
- Fetche `GET /api/signature/:token` pour récupérer les infos du bon
- Vérifie la session courante via `GET /api/auth/me`
- Si non authentifié → bouton "Se connecter avec Microsoft" → `/api/auth/login?returnTo=/signer/{token}`
- Canvas HTML5 natif (pas de librairie externe) avec support souris + touch
- Avertissement non-bloquant si email SSO ≠ email du bon (mode présentiel)
- Case "Lu et approuvé" obligatoire
- POST `{signatureDataUrl, mentionLuApprouve: true}` → `/api/signature/:token/sign`
- Écrans dédiés : `expired`, `already_signed`, `success`

### `PortailCollaborateur` — `/mes-bons`
Fichier : `src/pages/PortailCollaborateur.tsx`

- Fetche `GET /api/bons/mes-bons` (accessible avec rôle `collaborator`)
- Trois sections :
  - **À signer** (orange) — bons `sent_mise_dispo` / `sent_restitution` avec lien direct `/signer/{token}`
  - **En cours** (vert) — bons `active`
  - **Historique** (gris) — tableau des bons terminés/annulés

---

## Modifications pages existantes

### `BonDetail.tsx`
- Bouton **"Envoyer"** (draft) : ouvre `ItSignModal` (pdfType=`mise_disposition`) → après cachet → `POST /bons/:id/send`
- Bouton **"Présentiel"** (draft) : ouvre `ItSignModal` → après cachet → `POST /bons/:id/initiate-inperson` → affiche `InPersonModal`
- Bouton **"Initier restitution"** (active) : ouvre `ItSignModal` (pdfType=`restitution`) → après cachet → `POST /bons/:id/initiate-restitution`
- Bouton **"Restitution présentielle"** (active) : ouvre `ItSignModal` → après cachet → `POST /bons/:id/initiate-inperson`
- Si l'utilisateur connecté n'est **pas** IT staff : les actions s'exécutent directement sans modal de cachet
- `ItSignModal` : canvas signature (identique à `SignaturePage`, même hook `useSignatureCanvas`) + contexte textuel de l'action → `POST /bons/:id/sign-it { signatureDataUrl, pdfType }` → callback `onSigned()` chaîne l'action suivante
- `InPersonModal` : affiche le lien token avec bouton copier / ouvrir
- Section **Signatures** : liste signed/pending, signerEmail, signedAt, badges `Présentiel` et `IT` (icône stamp sur les `it_cachet`)
- **Bouton PDF par étape** : chaque ligne de signature signée affiche un bouton `Download` → `GET /api/bons/:id/pdf?type=mise_disposition|restitution` selon le type de signature
- **Bouton PDF en-tête** : télécharge le PDF le plus pertinent selon le statut du bon (`mise_disposition` si actif ou antérieur, `restitution` si archivé ou en cours de restitution)

**État `pendingItAction` :**
```typescript
interface PendingItAction {
  pdfType: 'mise_disposition' | 'restitution';
  description: string;   // Texte affiché dans la modal
  onSigned: () => Promise<void>;  // Action à chaîner après le cachet
}
```

### `App.tsx`
- Route publique `/signer/:token` ajoutée **avant** le bloc de routes protégées

### `Configuration.tsx` (admin)
- Composant `SmtpTestButton` : champ `<Input type="email">` + bouton "Envoyer le test" → `POST /admin/config/test/smtp` avec `{testEmail}`
- Champ `footer?: React.ReactNode` sur `ConfigSection`
- Section SMTP utilise `footer={<SmtpTestButton>}` au lieu d'un simple `TestButton`

---

## Architecture finale des modules et dépendances

```
AppModule
├── PrismaModule (global)
├── ConfigModule
├── AuthModule → ConfigModule
├── AdminModule → LdapModule → ConfigModule
├── FilialesModule
├── EquipmentModule
├── UsersModule
├── PdfModule → PrismaModule          ← nouveau, autonome
├── NotificationModule → ConfigModule, PrismaModule
├── SignatureModule → PrismaModule, ConfigModule, NotificationModule, PdfModule
└── BonsModule → SignatureModule, NotificationModule, PdfModule
```

> **Pas de dépendance circulaire** : `PdfModule` n'importe aucun des autres modules métier.
> `JwtStrategy` enregistré globalement via `AuthModule` → pas besoin de ré-importer `AuthModule` dans `SignatureModule`.

---

## Bugs corrigés en phase 3

| Bug | Fix |
|---|---|
| LDAP crash ENOTFOUND si serveur AD inaccessible | `client.on('error', handler)` attaché immédiatement après `createClient()` |
| Post-SSO redirect perdu (revenait sur /dashboard au lieu de /signer) | Cookie `auth_return_to` + lecture dans le callback |
| Dépendance circulaire SignatureModule ↔ BonsModule | Extraction de PdfService dans un PdfModule autonome |
| `CronExpression` importé mais non utilisé dans NotificationService | Import supprimé (utilisait un string littéral) |
| Cachet IT jamais demandé à l'IT lors de la création d'un bon | Suppression du bouton "Apposer le cachet" indépendant ; remplacement par `ItSignModal` chaîné à chaque action (Envoyer, Présentiel, Initier restitution, Restitution présentielle) |
| `signItCachet` déduisait toujours le type PDF depuis le statut du bon | Ajout du paramètre `pdfType?` explicite transmis depuis le frontend ; le statut sert uniquement de fallback |

---

## Commandes après phase 3

```bash
cd backend
npm install puppeteer        # si pas encore installé
npx prisma migrate dev       # migration add_pdf_snapshots déjà appliquée
npm run start:dev

cd frontend && npm run dev
```

---

## Checklist de vérification avant phase 4

### Backend — BonsModule
- [ ] `POST /api/bons` crée un bon avec équipements (depuis catalogue ou label libre)
- [ ] `GET /api/bons` retourne la liste paginée avec filtres status / filiale / recherche
- [ ] `POST /api/bons/:id/send` passe le bon en `sent_mise_dispo` et génère un token
- [ ] `POST /api/bons/:id/initiate-restitution` passe en `sent_restitution` et génère un token
- [ ] `POST /api/bons/:id/initiate-inperson` retourne `{bon, token}` sans envoyer d'email

### Backend — PDF
- [ ] `GET /api/bons/:id/pdf` retourne un PDF valide pour un bon en draft (génération à la volée)
- [ ] Après signature : `pdfMiseDispoSnapshot` présent en DB (vérifier via Prisma Studio)
- [ ] `GET /api/bons/:id/pdf` après signature sert le snapshot DB (instantané, pas de Puppeteer)

### Backend — Signature
- [ ] `GET /api/signature/:token` retourne `{status: 'pending', bon, signature}` sur token valide
- [ ] `GET /api/signature/:token` retourne `{status: 'expired'}` sur token expiré
- [ ] `POST /api/signature/:token/sign` avec mauvais email → 403
- [ ] `POST /api/signature/:token/sign` valide → statut bon passe à `active`, PNG chiffré sur disque
- [ ] Fichier `.enc` présent dans `data/signatures/`

### Backend — Notifications
- [ ] SMTP configuré → `POST /api/admin/config/test/smtp` avec email → mail reçu
- [ ] `POST /api/bons/:id/send` → email reçu par le collaborateur avec lien de signature

### Backend — Portail collaborateur
- [ ] `GET /api/bons/mes-bons` avec token collaborateur → retourne ses bons
- [ ] Ne retourne pas les bons annulés (`cancelled` exclus)

### Frontend — SignaturePage
- [ ] `/signer/{token_valide}` → affiche le bon et le canvas
- [ ] Sans session SSO → bouton "Se connecter avec Microsoft" → SSO → retour sur `/signer/{token}`
- [ ] Canvas fonctionne souris + touch (mobile)
- [ ] Bouton "Signer" désactivé si canvas vide ou case non cochée
- [ ] Après signature → écran de succès

### Frontend — PortailCollaborateur
- [ ] `/mes-bons` avec un collaborateur → voit ses bons en attente / actifs / historique
- [ ] Lien "Signer maintenant" pointe vers `/signer/{token}`

### Frontend — Cachet IT intégré (BonDetail)
- [ ] Cliquer "Envoyer" ouvre la modal cachet IT (pdfType=`mise_disposition`)
- [ ] Cliquer "Présentiel" ouvre la modal cachet IT, puis affiche le lien présentiel
- [ ] Cliquer "Initier restitution" ouvre la modal cachet IT (pdfType=`restitution`)
- [ ] Cliquer "Restitution présentielle" ouvre la modal cachet IT, puis affiche le lien présentiel
- [ ] Signature dans la modal cachet : canvas fonctionnel souris + touch
- [ ] Bouton "Apposer et continuer" désactivé si canvas vide
- [ ] Annuler la modal cachet n'exécute pas l'action
- [ ] Après cachet IT : action chaînée automatiquement (envoi email ou lien présentiel)
- [ ] Section Signatures : badge "IT" affiché sur les lignes `it_cachet`
- [ ] Bouton PDF présent sur chaque signature signée (télécharge le bon PDF selon le type)
- [ ] Bouton PDF en en-tête télécharge le PDF correct selon le statut du bon
