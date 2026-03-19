# Phase 5 — Sécurisation, Contestations, Déploiement

> Tout est implémenté et fonctionnel.

---

## 1. Rate limiting — `@nestjs/throttler`

### Installation

```bash
cd backend && npm install @nestjs/throttler
```

### Configuration

`app.module.ts` — `ThrottlerModule.forRoot()` avec limite globale 60 req/60s :

```typescript
ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 60 }])
```

### Application sur les endpoints sensibles

| Endpoint | Limite | Guard |
|---|---|---|
| `POST /api/signature/:token/sign` | 10 req/60s par IP | `ThrottlerGuard` + `JwtAuthGuard` |
| `POST /api/bons/:id/sign-it` | 10 req/60s par IP | `ThrottlerGuard` |

> Double défense : rate limiting NestJS (applicatif) + zone `sign_limit` dans Nginx (réseau).

---

## 2. ContestationModule — `src/contestation/`

### Modèle Prisma (existait déjà)

```
Contestation { id, bonId, userId, message, status, resolvedById, resolutionMessage, createdAt, updatedAt }
ContestationStatus { open | in_review | resolved | rejected }
```

### Fichiers créés

| Fichier | Rôle |
|---|---|
| `contestation.module.ts` | Imports PrismaModule + NotificationModule |
| `contestation.service.ts` | create, findAll, resolve, markInReview |
| `contestation.controller.ts` | Routes REST admin/technician |

### Routes exposées

| Méthode | Route | Rôle | Auth |
|---|---|---|---|
| `POST` | `/api/bons/:id/contestation` | Collaborateur conteste son bon | collaborator+ |
| `GET` | `/api/contestations` | Liste paginée IT | admin/technician |
| `PATCH` | `/api/contestations/:id/review` | Prendre en charge | admin/technician |
| `PATCH` | `/api/contestations/:id/resolve` | Résoudre ou rejeter | admin/technician |

### Workflow

1. Collaborateur clique "Contester" sur un bon `active` dans son portail
2. Modal : saisit le motif (min 10 chars, max 1000)
3. `POST /bons/:id/contestation` → bon passe en statut `contested`
4. Emails envoyés aux IT staff (isItStaff=true) via `sendContestationAlert`
5. IT prend en charge (`in_review`) → résout ou rejette
6. Bon repasse en `active` dans les deux cas
7. Email de réponse envoyé au collaborateur via `sendContestationResolution`
8. Logs d'audit : `bon_contested`, `contestation_resolved`, `contestation_rejected`

---

## 3. Renvoi manuel du lien de signature

### Backend

`BonsService.resendSignatureLink(bonId, initiatedById)` :
- Vérifie que le bon est en `sent_mise_dispo` ou `sent_restitution`
- Invalide l'ancien token (via `generateToken` qui expire les précédents)
- Génère un nouveau token valide 7 jours
- Renvoie l'email correspondant
- Log d'audit `reminder_sent` avec `{ manual: true, type }`

Endpoint : `POST /api/bons/:id/resend` (admin/technician)

### Frontend

Dans `BonDetail.tsx` : bouton **"Renvoyer le lien"** visible pour les IT staff quand le bon est en `sent_mise_dispo` ou `sent_restitution`.

---

## 4. Notifications email — nouvelles méthodes

Dans `NotificationService` :

| Méthode | Destinataire | Déclencheur |
|---|---|---|
| `sendContestationAlert(bon, user, message)` | Tous les IT staff (`isItStaff=true`) | Création contestation |
| `sendContestationResolution(bon, user, action, msg)` | Collaborateur | Résolution/rejet contestation |

---

## 5. Frontend — nouvelles fonctionnalités

### PortailCollaborateur.tsx

- **Section "En contestation"** : affiche les bons en statut `contested` avec message d'info
- **Bouton "Contester"** sur les bons actifs : ouvre une modal avec textarea (min 10 chars)
- Message de succès après soumission (auto-disparaît après 6s)
- Rechargement automatique après contestation

### BonDetail.tsx

- **Bouton "Renvoyer le lien"** visible uniquement pour IT staff + bon en `sent_*`
- `POST /api/bons/:id/resend` → alerte succès

### admin/Contestations.tsx (nouvelle page)

- Tableau paginé (20/page) avec filtres par statut (pills cliquables)
- Statuts avec couleurs : Ouverte (rouge), En examen (orange), Résolue (vert), Rejetée (gris)
- Action "Prendre en charge" (→ `in_review`)
- Action "Traiter" → modal avec choix Accepter/Rejeter + message optionnel
- Lien cliquable vers BonDetail
- Compteur de contestations ouvertes en haut

### AdminLayout.tsx + App.tsx

- Onglet **"Contestations"** ajouté dans le menu admin (icône AlertOctagon)
- Route `/admin/contestations`

---

## 6. Infrastructure Docker — Production

### Nouveaux fichiers

| Fichier | Rôle |
|---|---|
| `docker-compose.prod.yml` | Compose production avec Nginx |
| `nginx/nginx.conf` | Reverse proxy HTTPS, rate limiting réseau |
| `.env.example` | Template des variables d'environnement |

### Architecture de déploiement

```
Internet / Intranet
        │
    [Nginx :443]
    ├── /api/* → backend:4000 (rate limited)
    │   └── /api/*/sign → zone sign_limit (10 req/min)
    └── /*     → frontend:80 (SPA React)
        │
   [Réseau Docker internal]
   ├── backend:4000 (NestJS)
   └── db:5432 (PostgreSQL)
```

### Démarrage production

```bash
# 1. Configurer les secrets
cp .env.example .env
# Éditer .env avec ENCRYPTION_KEY et POSTGRES_PASSWORD

# 2. Générer le certificat TLS interne
mkdir -p nginx/certs
openssl req -x509 -newkey rsa:4096 \
  -keyout nginx/certs/key.pem \
  -out nginx/certs/cert.pem \
  -days 3650 -nodes \
  -subj "/CN=bons.groupelivio.local"

# 3. Lancer
docker compose -f docker-compose.prod.yml up -d

# 4. Vérifier
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend
```

### Variables d'environnement requises

| Variable | Description | Génération |
|---|---|---|
| `ENCRYPTION_KEY` | Clé AES-256 chiffrement signatures (64 chars hex) | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | Mot de passe base de données | `openssl rand -base64 24` |
| `FRONTEND_URL` | URL publique (dans les emails) | Ex: `https://bons.groupelivio.local` |

---

## Checklist de vérification — Phase 5

### Rate limiting

- [ ] `POST /api/signature/:token/sign` retourne 429 après 10 req/min depuis la même IP
- [ ] `POST /api/bons/:id/sign-it` retourne 429 après 10 req/min
- [ ] Les autres endpoints ne sont pas bloqués par le rate limit normal

### Contestations

- [ ] Bouton "Contester" visible dans PortailCollaborateur pour les bons actifs
- [ ] Modal s'ouvre avec textarea et validation min 10 chars
- [ ] Après soumission : bon passe en `contested`, email envoyé aux IT staff
- [ ] Message de succès s'affiche 6s dans le portail
- [ ] Page `/admin/contestations` affiche les contestations
- [ ] Filtre par statut (pills) fonctionne
- [ ] "Prendre en charge" passe la contestation en `in_review`
- [ ] "Traiter" → modal avec Accepter/Rejeter → email au collaborateur, bon repasse `active`
- [ ] Onglet "Contestations" visible dans le menu admin
- [ ] Collaborateur ne peut pas contester un bon qui n'est pas le sien → 403
- [ ] Double contestation impossible (bon déjà contesté) → 400

### Renvoi du lien

- [ ] Bouton "Renvoyer le lien" visible dans BonDetail pour IT + bon en `sent_*`
- [ ] Bouton absent pour non-IT et pour les autres statuts
- [ ] Après clic : nouveau token généré, email renvoyé, alerte succès
- [ ] Ancien lien invalide après renvoi (token expiré)
- [ ] Log d'audit `reminder_sent` avec `{ manual: true }` créé

### Docker production

- [ ] `docker compose -f docker-compose.prod.yml up -d` démarre sans erreur
- [ ] Nginx répond sur le port 443 (HTTPS)
- [ ] HTTP sur le port 80 redirige vers HTTPS
- [ ] `GET /api/health` accessible via `https://bons.groupelivio.local/api/health`
- [ ] Frontend accessible via `https://bons.groupelivio.local`
- [ ] `docker compose logs backend` → `Backend running on http://localhost:4000`

---

## Commandes après phase 5

```bash
# Backend (install @nestjs/throttler)
cd backend && npm install

# Démarrage développement (inchangé)
cd backend && npm run start:dev
cd frontend && npm run dev

# Production
docker compose -f docker-compose.prod.yml up -d
```
