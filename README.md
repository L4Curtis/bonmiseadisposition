# Bons de mise à disposition — Groupe Livio

Application web interne de gestion des bons de mise à disposition et de restitution de matériel IT.

---

## Déploiement via Portainer (méthode recommandée)

> Pas de fichier `.env` à créer — les variables sont saisies directement dans l'interface Portainer.

### Prérequis
- Portainer déjà installé et accessible
- Nginx Proxy Manager en place (gère le SSL)
- Le repo accessible depuis le serveur (GitHub, Gitea, etc.)

---

### Étape 1 — Générer les secrets (sur n'importe quelle machine avec openssl)

```bash
# Clé de chiffrement AES-256 (à garder précieusement — ne jamais changer après le 1er lancement)
openssl rand -hex 32

# Mot de passe PostgreSQL
openssl rand -base64 24
```

Copier les deux valeurs générées, elles seront collées dans Portainer.

---

### Étape 2 — Créer la Stack dans Portainer

1. **Portainer → Stacks → Add Stack**
2. Donner un nom : `bons-disposition`
3. Choisir la source :
   - **Repository** (recommandé) : coller l'URL git + branche `main` + fichier `docker-compose.prod.yml`
   - **Web editor** : coller directement le contenu de `docker-compose.prod.yml`

---

### Étape 3 — Renseigner les variables d'environnement

Dans la section **"Environment variables"** de Portainer (en bas de la page Stack), cliquer **"Add environment variable"** pour chaque ligne :

| Nom | Valeur | Description |
|-----|--------|-------------|
| `ENCRYPTION_KEY` | *(valeur générée étape 1)* | Clé AES-256 — **ne jamais changer** |
| `POSTGRES_PASSWORD` | *(valeur générée étape 1)* | Mot de passe base de données |
| `FRONTEND_URL` | `https://bons.groupelivio.local` | URL publique HTTPS sans slash final |

> ⚠️ Ces valeurs sont stockées dans Portainer et injectées au démarrage. Elles ne sont jamais écrites dans un fichier sur le disque.

---

### Étape 4 — Choisir le port d'exposition

Le frontend est exposé sur le port **`5147`** par défaut (configurable).

Pour changer le port, deux options :

**Option A — Variable d'environnement** (ajouter dans Portainer) :
```
FRONTEND_PORT=8080
```
Et dans le compose, modifier la ligne ports :
```yaml
ports:
  - "${FRONTEND_PORT:-5147}:80"
```

**Option B — Modifier directement** le compose (Web editor) avant de déployer :
```yaml
ports:
  - "8080:80"   # ← changer 5147 par le port voulu
```

---

### Étape 5 — Déployer

Cliquer **"Deploy the stack"**. Portainer va :
1. Build les images Docker (frontend + backend)
2. Démarrer les 3 containers : `db`, `backend`, `frontend`
3. Le backend exécute `prisma migrate deploy` automatiquement → la base PostgreSQL est créée

---

### Étape 6 — Configurer Nginx Proxy Manager

Dans NPM, créer un **Proxy Host** :

| Champ | Valeur |
|-------|--------|
| Domain Names | `bons.groupelivio.local` |
| Scheme | `http` |
| Forward Hostname / IP | IP de la VM Portainer |
| Forward Port | `5147` (ou le port choisi) |
| Cache Assets | off |
| Block Common Exploits | on |
| Websockets Support | off |
| **SSL → SSL Certificate** | Let's Encrypt ou certificat interne |
| Force SSL | ✅ on |
| HTTP/2 Support | ✅ on |

---

### Étape 7 — Premier accès

1. Ouvrir `https://bons.groupelivio.local`
2. Se connecter : `admin@local` / `admin`
3. **Changer le mot de passe immédiatement** (icône profil en haut à droite)
4. Aller dans **Admin → Configuration** et renseigner :
   - LDAP / Active Directory
   - Microsoft Entra ID (SSO)
   - SMTP / Email
5. Créer les filiales dans **Admin → Filiales**
6. Lancer une sync LDAP dans **Admin → Synchronisation LDAP**

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

**Sécurité réseau :**
- Seul le port `5147` (frontend) est accessible depuis l'hôte
- Le backend (4000) et la base (5432) sont sur le réseau Docker `internal` uniquement
- Le SSL est terminé par NPM — le trafic interne est en HTTP (réseau local Docker)

---

## Mise à jour de l'application

### Avec Portainer (méthode repo git)
1. Portainer → Stacks → `bons-disposition`
2. Cliquer **"Pull and redeploy"**

### Manuellement
```bash
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
```

Les volumes `pgdata` et `data` sont conservés — aucune donnée perdue.

---

## Déploiement CLI (alternative sans Portainer)

```bash
git clone <repo-url> && cd BonDeMiseADisposition
cp .env.example .env && nano .env   # renseigner les 3 valeurs
docker compose -f docker-compose.prod.yml up -d
```

---

## Développement local

```bash
cp .env.example .env   # renseigner ENCRYPTION_KEY et POSTGRES_PASSWORD

docker compose up db -d            # démarrer uniquement la base

cd backend && npm install && npm run start:dev    # backend :4000
cd frontend && npm install && npm run dev         # frontend :5173
```

---

## Variables d'environnement — référence complète

| Variable | Requis | Description |
|----------|--------|-------------|
| `ENCRYPTION_KEY` | ✅ | Clé AES-256-GCM (64 hex). Chiffre les signatures PNG et la config en base. **Immuable après 1er lancement.** |
| `POSTGRES_PASSWORD` | ✅ | Mot de passe du user `app` sur la base `bons_disposition` |
| `FRONTEND_URL` | ✅ | URL HTTPS publique sans slash. Utilisée pour CORS, redirects SSO, liens emails |
| `DATABASE_URL` | auto | Construit automatiquement depuis `POSTGRES_PASSWORD` dans le compose |
| `NODE_ENV` | auto | Hardcodé `production` dans le compose prod |
