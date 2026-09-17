# Bons de mise à disposition

Application web interne de gestion des bons de mise à disposition et de restitution de matériel IT.

---

## CI/CD — Images Docker automatiques

À chaque push sur `main`, GitHub Actions build et publie automatiquement les images sur GitHub Container Registry :

```
ghcr.io/l4curtis/bonmiseadisposition-backend:latest
ghcr.io/l4curtis/bonmiseadisposition-frontend:latest
```

> Statut : [![Build](https://github.com/L4Curtis/bonmiseadisposition/actions/workflows/docker.yml/badge.svg)](https://github.com/L4Curtis/bonmiseadisposition/actions/workflows/docker.yml)

---

## Déploiement via Portainer (méthode recommandée)

> Pas de build sur le serveur, pas de fichier `.env` — tout se fait dans l'interface Portainer.

### Prérequis
- Portainer installé et accessible
- Nginx Proxy Manager en place (gère le SSL)
- Images disponibles sur ghcr.io (build automatique via GitHub Actions)

---

### Étape 1 — Générer les secrets

Sur n'importe quelle machine avec openssl :

```bash
# Clé de chiffrement AES-256 — NE JAMAIS changer après le 1er lancement
openssl rand -hex 32

# Secret JWT (doit être différent de ENCRYPTION_KEY)
openssl rand -hex 32

# Mot de passe PostgreSQL
openssl rand -base64 24
```

Copier les trois valeurs, elles seront collées dans Portainer.

> 🔐 **Conservez l'`ENCRYPTION_KEY` hors du serveur** (gestionnaire de secrets,
> coffre-fort) dès maintenant. Elle ne doit jamais changer, et **sans elle aucune
> sauvegarde n'est exploitable** (signatures, pièces jointes et secrets resteront
> chiffrés). Voir **[Sauvegarde & reprise](#sauvegarde--reprise-dactivité)**.

---

### Étape 2 — Créer la Stack dans Portainer

1. **Portainer → Stacks → Add Stack**
2. Nom : `bons-disposition`
3. Source → **Repository** :
   - URL : `https://github.com/L4Curtis/bonmiseadisposition`
   - Branche : `main`
   - Compose path : `docker-compose.prod.yml`
   - ✅ **Automatic updates** (optionnel — redéploie automatiquement après chaque push)

---

### Étape 3 — Variables d'environnement dans Portainer

Section **"Environment variables"** → **Add environment variable** :

| Nom | Valeur | Obligatoire |
|-----|--------|-------------|
| `ENCRYPTION_KEY` | *(résultat openssl rand -hex 32)* | ✅ |
| `JWT_SECRET` | *(résultat openssl rand -hex 32, différent de ENCRYPTION_KEY)* | ✅ |
| `POSTGRES_PASSWORD` | *(résultat openssl rand -base64 24)* | ✅ |
| `FRONTEND_URL` | `https://bons.exemple.local` | ✅ |
| `FRONTEND_PORT` | `5147` | optionnel (défaut: 5147) |

> ⚠️ `ENCRYPTION_KEY` ne doit jamais changer après le premier démarrage — les données chiffrées en base deviendraient illisibles.
>
> ⚠️ `JWT_SECRET` et `ENCRYPTION_KEY` doivent être **différents** pour isoler les surfaces d'attaque.

---

### Étape 4 — Deploy the stack

Portainer télécharge les images depuis ghcr.io et démarre 3 containers :
- `db` — PostgreSQL 16
- `backend` — NestJS (exécute `prisma migrate deploy` au démarrage)
- `frontend` — React SPA + nginx sur le port interne **8080** (proxy `/api/*` vers le backend)

---

### Étape 5 — Configurer Nginx Proxy Manager

Créer un **Proxy Host** :

| Champ | Valeur |
|-------|--------|
| Domain Names | `bons.exemple.local` |
| Scheme | `http` |
| Forward Hostname / IP | IP de la VM Portainer |
| Forward Port | `5147` (ou valeur de `FRONTEND_PORT`) |
| Block Common Exploits | ✅ on |
| **SSL → Certificate** | Let's Encrypt ou cert interne |
| Force SSL | ✅ on |
| HTTP/2 Support | ✅ on |

#### Configuration avancée NPM — obligatoire pour les IPs réelles dans les logs

Dans **Advanced → Custom Nginx Configuration**, ajouter :

```nginx
proxy_set_header X-Real-IP $remote_addr;
# ÉCRASER le header (jamais $proxy_add_x_forwarded_for, qui concatène la
# valeur forgeable envoyée par le client — l'IP des signatures et des logs
# d'audit doit être infalsifiable)
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

> Sans cette config, les logs d'audit afficheront l'IP du container NPM (ex: `172.19.0.x`)
> au lieu de l'IP réelle des utilisateurs.
> Le nginx du conteneur frontend transmet le `X-Real-IP` posé par NPM tel quel au
> backend. Pensez aussi à `FRONTEND_BIND=127.0.0.1` dans `.env` si NPM tourne sur
> la même machine, pour empêcher un accès direct au port 5147 (qui permettrait de
> forger ces en-têtes).

### Variante — Cloudflare Tunnel (cloudflared)

Si l'accès se fait via un **tunnel Cloudflare** pointant directement sur
`http://<ip-vm>:5147` (pas de NPM), **rien à configurer** : Cloudflare pose
l'en-tête `CF-Connecting-IP` (IP réelle du visiteur), et le nginx du conteneur
frontend la reconnaît automatiquement et la transmet au backend (ordre de
confiance : `CF-Connecting-IP` → `X-Real-IP` → connexion directe).

> 🔒 Pour que cette IP soit **infalsifiable**, le port `5147` ne doit être
> joignable que par le tunnel. Si `cloudflared` tourne sur la même VM, faites-le
> pointer sur `http://localhost:5147` et publiez le frontend sur la boucle locale
> uniquement : `FRONTEND_BIND=127.0.0.1` (ou `ports: ["127.0.0.1:5147:8080"]`).
> Sinon, un client du LAN pourrait taper `http://<ip-vm>:5147` directement et
> forger `CF-Connecting-IP`.

---

### Étape 6 — Premier accès

1. Ouvrir `https://bons.exemple.local`
2. Connexion locale : `admin@local` / mot de passe temporaire (voir ci-dessous)
3. **Changer le mot de passe immédiatement** (obligatoire au premier login)
4. **Admin → Configuration** : renseigner LDAP, Entra ID, SMTP — **et obligatoirement `smtp.from` et `general.app_url`** (voir [Configuration obligatoire après déploiement](#configuration-obligatoire-après-déploiement))
5. **Admin → Filiales** : créer les filiales
6. **Admin → Sync LDAP** : lancer la première synchronisation

### Mot de passe admin initial

Au premier démarrage, si aucun compte `admin@local` n'existe :
- Si `DEFAULT_ADMIN_PASSWORD` est défini dans l'environnement, ce mot de passe est utilisé.
- Sinon, un mot de passe aléatoire est généré et écrit dans `data/initial-admin-password.txt`
  (à la racine du volume `data/` du conteneur backend). Consultez ce fichier pour récupérer
  le mot de passe temporaire.
- Le fichier est **supprimé automatiquement** dès que le mot de passe de `admin@local` est
  changé avec succès (changement obligatoire à la première connexion). Il n'y a donc rien à
  nettoyer manuellement.

### Configuration obligatoire après déploiement

Deux clés doivent être renseignées dans **Admin → Configuration** avant toute mise en
production, sans quoi les emails de signature ne partent pas :

| Clé | Où | Sans elle… |
|-----|-----|-----------|
| `smtp.from` (section SMTP) | Admin → Configuration → SMTP | Aucun email n'est envoyé : erreur explicite « Expéditeur SMTP (smtp.from) non configuré », visible dans l'historique des emails du bon concerné |
| `general.app_url` (section Général) | Admin → Configuration → Général | Les liens de signature dans les emails sont invalides ou absents |

Ces deux valeurs ne se configurent **pas** via des variables d'environnement : uniquement
via l'interface d'administration, après le premier démarrage.

---

## Mise à jour

### Automatique (si "Automatic updates" activé dans Portainer)
Chaque push sur `main` → GitHub Actions build les images → Portainer redéploie.

### Manuelle
**Portainer → Stacks → bons-disposition → Pull and redeploy**

Les volumes `pgdata` et `data` sont conservés — aucune donnée perdue.

### Migrations de base de données

Au démarrage, le backend exécute automatiquement `prisma migrate deploy`. Au prochain
redémarrage après cette mise à jour, **6 nouvelles migrations** s'appliquent (index de
performance, normalisation de champs, contraintes d'unicité, colonnes additives).

Deux migrations supplémentaires accompagnent le tableau de bord KPI et le rôle Direction : une
nouvelle valeur d'énumération pour les rôles utilisateur (`direction`) et neuf index sur les
tables sollicitées par les agrégats du tableau de bord. Contrairement aux deux migrations
décrites ci-dessous, ces deux-là sont **entièrement idempotentes** (`ADD VALUE IF NOT EXISTS`,
`CREATE INDEX IF NOT EXISTS`) : aucune vérification préalable n'est nécessaire.

**Deux d'entre elles échouent volontairement** si des doublons existent déjà en base — pour
que le déploiement s'arrête proprement plutôt que de corrompre des données. Avant de
redéployer, vérifiez l'absence de doublons avec ces requêtes SQL (à exécuter sur la base de
production) :

```sql
-- 1. Emails différant seulement par la casse (ex. "Jean.Dupont@x" et "jean.dupont@x")
SELECT lower(trim(email)) AS email, count(*)
FROM users GROUP BY lower(trim(email)) HAVING count(*) > 1;

-- 2. Articles de catalogue identiques (même catégorie/marque/modèle)
SELECT category, brand, model, count(*)
FROM equipment_catalog GROUP BY category, brand, model HAVING count(*) > 1;

-- 3. Noms de filiale identiques à la casse près
SELECT lower(name) AS name, count(*)
FROM filiales GROUP BY lower(name) HAVING count(*) > 1;
```

Si une de ces requêtes retourne des lignes, fusionnez ou renommez les doublons **avant** de
redéployer. Sinon, `prisma migrate deploy` échoue avec un message explicite listant les
doublons détectés et le backend ne démarre pas — c'est le comportement attendu, il suffit de
corriger les données puis de relancer le déploiement.

---

## Sauvegarde & reprise d'activité

> ⚠️ **Critique.** Cette application est un système de preuve : la perte de
> données ou de la clé de chiffrement est **irréversible**. Mettez en place les
> sauvegardes dès la mise en production.

### Les 3 éléments indissociables

| Élément | Où | Sans lui… |
|---------|-----|-----------|
| **Base PostgreSQL** (`pgdata`) | volume du conteneur `db` | aucune donnée |
| **Volume `data/`** (signatures + pièces jointes chiffrées) | conteneur `backend` (`/app/data`) | signatures/photos manquantes |
| **`ENCRYPTION_KEY`** | variable d'environnement (Portainer) | base + volume **illisibles** |

> Les trois vont ensemble. Une sauvegarde de la base + `data/` **sans** la clé
> est inexploitable. **Sauvegardez `ENCRYPTION_KEY` séparément**, hors du serveur.

### Sauvegarder

Script fourni (dump PostgreSQL + archive `data/` + manifeste SHA-256). Adaptez
les noms de conteneurs à votre stack (`docker ps`) :

```bash
DB_CONTAINER=bons-disposition-db-1 \
BACKEND_CONTAINER=bons-disposition-backend-1 \
POSTGRES_USER=app POSTGRES_DB=bons_disposition \
./scripts/backup.sh /srv/backups/bons
```

À **planifier** (cron quotidien) et **répliquer hors site**. Testez
régulièrement une restauration : une sauvegarde jamais restaurée n'en est pas une.

### Restaurer

```bash
DB_CONTAINER=bons-disposition-db-1 BACKEND_CONTAINER=bons-disposition-backend-1 \
POSTGRES_USER=app POSTGRES_DB=bons_disposition \
./scripts/restore.sh /srv/backups/bons/AAAAMMJJ-HHMMSS
```

L'environnement cible doit avoir **la même `ENCRYPTION_KEY`** : sinon le **canari
de démarrage** bloque le backend (`ENCRYPTION_KEY invalide…`) au lieu de corrompre
les données — c'est volontaire, restaurez la bonne clé.

📖 **Procédure complète, RPO/RTO et séquestre de la clé : [docs/SAUVEGARDE-REPRISE.md](docs/SAUVEGARDE-REPRISE.md)**

---

## Architecture

```
Internet / Intranet
        │
[Nginx Proxy Manager :443 — SSL/TLS]
        │  proxy_pass http://<vm>:5147
        │  X-Forwarded-For: <ip-client-réelle>
        │
[frontend :5147→8080 — nginx + React SPA]     ← seul port exposé sur l'hôte
        │                                        (nginx écoute sur 8080 en interne)
        ├── /*      → fichiers statiques React
        └── /api/*  → backend:4000  (réseau Docker interne)
                            │
                     db:5432 PostgreSQL  (réseau interne, non exposé)
```

---

## Variables d'environnement — référence

| Variable | Requis | Description |
|----------|--------|-------------|
| `ENCRYPTION_KEY` | ✅ | Clé AES-256-GCM 64 hex. Chiffre signatures + pièces jointes + config DB. **Immuable** et à **sauvegarder hors serveur** (cf. [Sauvegarde](#sauvegarde--reprise-dactivité)). |
| `JWT_SECRET` | ✅ | Secret de signature JWT. Doit être différent de `ENCRYPTION_KEY`. |
| `POSTGRES_PASSWORD` | ✅ | Mot de passe PostgreSQL |
| `FRONTEND_URL` | ✅ | URL HTTPS publique sans slash. CORS + redirects SSO + liens emails |
| `FRONTEND_PORT` | — | Port hôte exposé pour NPM (défaut: `5147`). Interne: `8080`. |
| `DATABASE_URL` | auto | Construit depuis `POSTGRES_PASSWORD` dans le compose |
| `NODE_ENV` | auto | Hardcodé `production` dans le compose prod |

---

## Sécurité

Cette application a subi un audit de sécurité complet en mars 2026. **10+ vulnérabilités critiques et haute priorité ont été corrigées** :

- IDOR sur contestations (accès contrôlé par rôle)
- LDAP injection (validation du filtre de recherche)
- IP spoofing (X-Forwarded-For chaîné via NPM → nginx → backend)
- Rate limiting sur login, refresh token et endpoints sensibles
- Politique mot de passe renforcée (12+ chars, majuscule, chiffre, spécial)
- Brute force protection (verrouillage 30 min après échecs répétés)
- Config sensible restreinte au rôle admin
- CSP renforcée (frame-ancestors, connect-src, HSTS 1 an)
- Audit trail complet (login SSO, login local, logout, actions sur les bons)
- Protection CSRF (header `X-Requested-With` obligatoire sur mutations)
- Utilisateur non-root dans les containers Docker

Pour les détails complets et les règles de sécurité à jour, consulter **[docs/security.md](docs/security.md)**.

---

## Développement local

Le backend charge sa configuration depuis `backend/.env` (et non le `.env` à la racine, qui
sert uniquement à `docker-compose.yml`/`docker-compose.prod.yml`) : les deux fichiers sont à
créer séparément.

```bash
cp .env.example .env                     # variables pour docker compose (POSTGRES_PASSWORD...)
cp backend/.env.example backend/.env     # variables lues par le backend en dev local
# renseigner ENCRYPTION_KEY, JWT_SECRET, POSTGRES_PASSWORD dans les deux fichiers

docker compose up db -d            # base PostgreSQL uniquement

cd backend && npm install && npm run start:dev    # :4000
cd frontend && npm install && npm run dev         # :5173
```

> `docker compose up` (sans argument) démarre la stack complète construite localement
> (db + backend + frontend) : le frontend est alors exposé sur le port **3000** (voir
> `docker-compose.yml`), à ne pas confondre avec le port `5173` de `npm run dev` (Vite) ou le
> port `5147` de la stack de production.

## Tests

```bash
cd backend
npm test              # tests unitaires Jest
npm run test:cov      # avec rapport de couverture (backend/coverage/lcov-report/index.html)

cd frontend
npm test              # tests unitaires Vitest
```
