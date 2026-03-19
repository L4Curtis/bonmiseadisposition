# Bons de mise à disposition — Groupe Livio

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

# Mot de passe PostgreSQL
openssl rand -base64 24
```

Copier les deux valeurs, elles seront collées dans Portainer.

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
| `POSTGRES_PASSWORD` | *(résultat openssl rand -base64 24)* | ✅ |
| `FRONTEND_URL` | `https://bons.groupelivio.local` | ✅ |
| `FRONTEND_PORT` | `5147` | optionnel (défaut: 5147) |

> ⚠️ `ENCRYPTION_KEY` ne doit jamais changer après le premier démarrage — les données chiffrées en base deviendraient illisibles.

---

### Étape 4 — Deploy the stack

Portainer télécharge les images depuis ghcr.io et démarre 3 containers :
- `db` — PostgreSQL 16
- `backend` — NestJS (exécute `prisma migrate deploy` au démarrage)
- `frontend` — React SPA + nginx (proxy `/api/*` vers le backend)

---

### Étape 5 — Configurer Nginx Proxy Manager

Créer un **Proxy Host** :

| Champ | Valeur |
|-------|--------|
| Domain Names | `bons.groupelivio.local` |
| Scheme | `http` |
| Forward Hostname / IP | IP de la VM Portainer |
| Forward Port | `5147` (ou `FRONTEND_PORT`) |
| Block Common Exploits | ✅ on |
| **SSL → Certificate** | Let's Encrypt ou cert interne |
| Force SSL | ✅ on |
| HTTP/2 Support | ✅ on |

---

### Étape 6 — Premier accès

1. Ouvrir `https://bons.groupelivio.local`
2. Connexion : `admin@local` / `admin`
3. **Changer le mot de passe immédiatement**
4. **Admin → Configuration** : renseigner LDAP, Entra ID, SMTP
5. **Admin → Filiales** : créer les 14 filiales
6. **Admin → Sync LDAP** : lancer la première synchronisation

---

## Mise à jour

### Automatique (si "Automatic updates" activé dans Portainer)
Chaque push sur `main` → GitHub Actions build les images → Portainer redéploie.

### Manuelle
**Portainer → Stacks → bons-disposition → Pull and redeploy**

Les volumes `pgdata` et `data` sont conservés — aucune donnée perdue.

---

## Architecture

```
Internet / Intranet
        │
[Nginx Proxy Manager :443 — SSL/TLS]
        │  proxy_pass http://<vm>:5147
        │
[frontend :5147 — nginx + React SPA]     ← seul port exposé sur l'hôte
        │
        ├── /*      → fichiers statiques React
        └── /api/*  → backend:4000  (réseau Docker interne)
                            │
                     db:5432 PostgreSQL  (réseau interne, non exposé)
```

---

## Variables d'environnement — référence

| Variable | Requis | Description |
|----------|--------|-------------|
| `ENCRYPTION_KEY` | ✅ | Clé AES-256-GCM 64 hex. Chiffre signatures PNG + config DB. **Immuable.** |
| `POSTGRES_PASSWORD` | ✅ | Mot de passe PostgreSQL |
| `FRONTEND_URL` | ✅ | URL HTTPS publique sans slash. CORS + redirects SSO + liens emails |
| `FRONTEND_PORT` | — | Port hôte exposé pour NPM (défaut: `5147`) |
| `DATABASE_URL` | auto | Construit depuis `POSTGRES_PASSWORD` dans le compose |
| `NODE_ENV` | auto | Hardcodé `production` dans le compose prod |

---

## Développement local

```bash
cp .env.example .env   # renseigner ENCRYPTION_KEY et POSTGRES_PASSWORD

docker compose up db -d            # base PostgreSQL uniquement

cd backend && npm install && npm run start:dev    # :4000
cd frontend && npm install && npm run dev         # :5173
```
