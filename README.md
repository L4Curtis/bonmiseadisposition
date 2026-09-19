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

> Base PostgreSQL sur une **machine séparée** : utiliser les deux stacks de [`deploy/`](deploy/README.md)
> (application et base, TLS, accès réseau restreint, migration depuis la stack tout-en-un, sauvegardes).

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

# Mot de passe PostgreSQL (hexadécimal : un base64 peut contenir « / » ou « + »
# qui cassent l'URL de connexion DATABASE_URL)
openssl rand -hex 24
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
| `POSTGRES_PASSWORD` | *(résultat openssl rand -hex 24)* | ✅ |
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
4. **Admin → Configuration** : renseigner LDAP, Entra ID, SMTP — **et obligatoirement `smtp.from` et `general.app_url`** (voir [Configuration obligatoire après déploiement](#configuration-obligatoire-après-déploiement)) ; contrôleur de domaine exigeant LDAP signing / channel binding → voir [deploy/README.md, section « LDAPS »](deploy/README.md#ldaps)
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

### Réinitialiser le mot de passe `admin@local` (perdu ou expiré)

Il n'existe pas d'écran pour cela (le compte local est le seul moyen d'accès sans SSO). Le
mot de passe vit en base sous forme de hash bcrypt ; on le remplace depuis le conteneur
backend, qui possède la bonne `DATABASE_URL` et embarque le script
`scripts/reset-admin-password.js` :

```bash
# 1) Repérer le conteneur backend
docker ps --filter name=backend --format '{{.Names}}'

# 2) Réinitialiser (remplacer le nom du conteneur et le mot de passe temporaire)
docker exec -i <conteneur-backend> node scripts/reset-admin-password.js 'MotDePasseTemporaire!2026'
```

Effets : le hash est remplacé, le changement de mot de passe est imposé à la prochaine
connexion (politique : 12 caractères minimum, majuscule, minuscule, caractère spécial), le
compte est réactivé et, `passwordChangedAt` étant mis à jour, toutes les sessions ouvertes de
ce compte sont invalidées. Rien n'est écrit dans les logs ni dans
`data/initial-admin-password.txt`.

Sur une image antérieure au 2026-09-17 (script absent), l'équivalent en une commande — le
module s'appelle `bcryptjs`, pas `bcrypt` :

```bash
docker exec -i <conteneur-backend> node -e '
const bcrypt = require("bcryptjs"); const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient(); const pwd = process.argv[1];
bcrypt.hash(pwd, 12)
  .then((hash) => prisma.user.update({ where: { email: "admin@local" },
    data: { passwordHash: hash, mustChangePassword: true, passwordChangedAt: new Date(), active: true, isLocalAccount: true } }))
  .then((u) => { console.log("OK :", u.email); return prisma.$disconnect(); })
  .catch((e) => { console.error("Échec :", e.message); process.exit(1); });
' 'MotDePasseTemporaire!2026'
```

Si le compte est verrouillé après des tentatives ratées (« compte temporairement verrouillé »),
le verrou tombe de lui-même au bout de 30 minutes. Pour le lever immédiatement, l'administrateur
étant lui-même bloqué, supprimer les échecs récents dans la base :

```bash
docker exec -i <conteneur-db> psql -U app -d bons_disposition -c   "DELETE FROM audit_logs WHERE action = 'login_local_failed' AND user_email = 'admin@local' AND created_at > now() - interval '30 minutes';"
```

(Pour tout autre compte, utiliser le bouton « Déverrouiller » de Admin → Utilisateurs.)

### Configuration obligatoire après déploiement

Deux clés doivent être renseignées dans **Admin → Configuration** avant toute mise en
production, sans quoi les emails de signature ne partent pas :

| Clé | Où | Sans elle… |
|-----|-----|-----------|
| `smtp.from` (section SMTP) | Admin → Configuration → SMTP | Aucun email n'est envoyé : erreur explicite « Expéditeur SMTP (smtp.from) non configuré », visible dans l'historique des emails du bon concerné |
| `general.app_url` (section Général) | Admin → Configuration → Général | À défaut, la variable d'environnement `FRONTEND_URL` (obligatoire dans `docker-compose.prod.yml`) est utilisée ; la page d'administration la pré-remplit. Si aucune des deux n'est définie, aucun email à lien ne part (erreur explicite dans l'historique des emails) |

Ces deux valeurs ne se configurent **pas** via des variables d'environnement : uniquement
via l'interface d'administration, après le premier démarrage.

---


### Export SMB depuis Docker : monter le partage, pas un chemin UNC

Le backend tourne dans un conteneur Linux : un chemin UNC Windows (`\serveur\partage\...`)
n'y est pas accessible. Le test de connexion répond alors « Le chemin d'export n'existe pas ou
le partage n'est pas monté » et chaque export est tracé en échec dans Admin → Configuration →
Monitoring SMB (réessayable une fois le partage monté).

Monter le partage CIFS dans le conteneur via un volume Docker (paquet `cifs-utils` requis sur
l'hôte), puis renseigner `smb.path` avec le chemin **du conteneur** :

```yaml
# docker-compose.prod.yml (extrait)
services:
  backend:
    volumes:
      - data:/app/data
      - smb_export:/mnt/export        # ← montage du partage

volumes:
  smb_export:
    driver: local
    driver_opts:
      type: cifs
      device: "//serveur/data/VOS_DOSSIERS/BONS"
      o: "username=${SMB_USER},password=${SMB_PASSWORD},domain=peduzzi.local,vers=3.0,uid=1001,gid=1001,file_mode=0660,dir_mode=0770"
```

`uid=1001,gid=1001` correspond à l'utilisateur `nestjs` du conteneur. Ensuite, dans
Admin → Configuration → Export SMB : `path = /mnt/export`, puis « Tester la connexion » doit
répondre « Accès en écriture vérifié ». Les identifiants `smb.username` / `smb.password` de
l'application ne servent pas au montage (c'est le système hôte qui monte le partage).


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

## Collaborateurs sans compte Active Directory

Un compagnon de chantier n'a pas toujours de compte dans l'annuaire. Un technicien ou un administrateur
peut créer le collaborateur à la main, depuis le formulaire du bon (quand la recherche ne donne aucun
résultat) ou depuis Collaborateurs → Ajouter un collaborateur. Prénom et nom suffisent, l'adresse email est
facultative.

Sans adresse, la personne ne reçoit aucun lien : le bon se signe **en présentiel**, sur l'appareil du
technicien. L'envoi et le renvoi par email sont refusés avec un message explicite. Ces comptes ne peuvent
pas se connecter et la synchronisation Active Directory ne les touche jamais.

## Configuration : état des rubriques

Admin → Configuration → Général affiche l'état de chaque rubrique : configurée, incomplète, désactivée ou
jamais renseignée, avec ce que cela empêche et la date de dernière modification. Le menu de gauche porte la
même information sous forme de pastille. L'état est calculé à partir de la seule présence des clés
attendues : aucune valeur secrète n'est déchiffrée ni renvoyée.

## Inventaire : par équipement ou par collaborateur

La page Inventaire propose deux lectures du même parc. « Par équipement » est la liste habituelle.
« Par collaborateur » donne une ligne par personne — service, filiale, nombre d'équipements détenus,
nombre en retard, ancienneté du prêt le plus ancien — et un clic déplie le détail de son matériel,
chargé à ce moment-là. Les filtres (recherche, filiale, catégorie, situation, retards) valent pour les
deux vues, et la vue choisie est portée par l'URL (`?vue=collaborateurs`) : un lien partagé rouvre le
même écran.

Côté API : `GET /reporting/inventory/by-collaborateur` accepte les mêmes filtres que la liste, plus
`sort=count|oldest` et la pagination. Le regroupement est fait en mémoire, volontairement, pour
réutiliser la construction des filtres de la liste plutôt que de la dupliquer en SQL ; il est donc
plafonné à 10 000 équipements. Au-delà, la réponse le signale par l'en-tête `X-Truncated` et par le
champ `truncated` du corps, et la page affiche un avertissement : un classement partiel n'est jamais
présenté comme complet.

## Modèles d'emails : test d'envoi

Admin → Modèles permet de rechercher et de filtrer les modèles, de repérer ceux qui ont été personnalisés,
et d'envoyer un email de test à une adresse choisie. Le modèle est rendu avec des variables d'exemple,
aucun bon n'est créé ni modifié, et l'envoi est tracé dans le journal d'audit. Si le SMTP n'est pas
configuré, le message le dit explicitement.

## Catalogue et filiales : import et export CSV

Admin → Catalogue et Admin → Filiales proposent un export CSV, un modèle téléchargeable et un import.
Le modèle rappelle les valeurs acceptées (catégories d'équipement notamment) ; les lignes commençant par
« # » y sont des commentaires, ignorées à l'import. L'import affiche un aperçu, puis un compte rendu :
créés, mis à jour, ignorés, et erreurs ligne par ligne.

L'export des filiales inclut les images (logo, cachet) en base64 uniquement sur demande, le fichier
devenant alors volumineux. À l'import, une image est acceptée seulement si ses octets d'en-tête
correspondent réellement à du PNG ou du JPEG.

Les éléments désactivés sont masqués par défaut dans les deux pages, un contrôle permet de les afficher.

## Données de démonstration

`backend/scripts/demo-data.sql` remplit une instance de test : filiales, collaborateurs (dont des comptes
sans adresse), catalogue, packs et 140 bons sur douze mois avec signatures, emails, contestations et
journal d'audit. Tout porte la marque `[DEMO]`, le script est rejouable et se termine par un récapitulatif.

```sh
# depuis le conteneur de la base (DATABASE_URL n'y existe pas : préciser l'utilisateur)
psql -U app -d bons_disposition -v ON_ERROR_STOP=1 -f demo-data.sql
```

`backend/scripts/demo-data-a-coller.txt` contient la même chose prête à coller dans une console web.

## SSO Entra : attribution des rôles

Le rôle est recalculé à **chaque** connexion SSO à partir des groupes reçus dans le jeton, selon les
identifiants saisis dans Configuration → Entra ID (administrateur, technicien, direction).

Prérequis côté Entra ID, sans lequel aucun rôle n'est attribué : inscription d'application → Configuration
du jeton → Ajouter une revendication de groupes → groupes de sécurité, identifiant de groupe, pour le jeton
d'identité. Sans cette revendication, l'application conserve le rôle enregistré et le signale dans
Configuration → Entra ID → Dernières connexions SSO, qui indique aussi le nombre de groupes reçus et le rôle
retenu pour chaque connexion.

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

docker compose -f docker-compose.dev.yml up -d    # PostgreSQL + Mailpit, en loopback uniquement

cd backend && npm install && npm run start:dev    # :4000
cd frontend && npm install && npm run dev         # :5173
```

> `docker compose up` (sans argument, et sans `-f`) démarre la stack complète construite
> localement (db + backend + frontend) à partir de `docker-compose.yml` : le frontend est
> alors exposé sur le port **3000**, à ne pas confondre avec le port `5173` de `npm run dev`
> (Vite) ou le port `5147` de la stack de production. Pour le développement au quotidien
> (backend/frontend lancés sur le poste, hors Docker), c'est `docker-compose.dev.yml`
> ci-dessus qu'il faut utiliser : il ne démarre que la base et Mailpit, tous deux publiés
> uniquement sur `127.0.0.1`.

### Emails de dev : Mailpit

`docker-compose.dev.yml` démarre aussi **Mailpit**, un faux serveur SMTP à interface web :
tous les emails envoyés par le backend en dev (signature, rappels, restitution, test d'envoi
de modèle…) y arrivent, et **rien ne part jamais réellement**. Interface web :
[http://localhost:8025](http://localhost:8025).

Pour que le backend lui envoie ses emails, configurez le SMTP dans Admin → Configuration →
SMTP avec `host=localhost`, `port=1025`, `secure` décoché, sans utilisateur ni mot de passe
(Mailpit n'exige aucune authentification), et un expéditeur (`smtp.from`) au format valide,
par exemple `bons-dev@localhost.test`. La commande d'assainissement ci-dessous applique
automatiquement ces réglages.

### Assainir les secrets d'une base de dev existante

Une base de dev ne doit **jamais** contenir de secrets qui fonctionnent réellement contre la
production (identifiants SMTP Office 365, secrets Entra/Graph, mot de passe de liaison LDAP,
mot de passe SMB…) : ils y finissent parfois par erreur (copie de la config de prod pour
tester, restauration d'une sauvegarde…), et un test malheureux peut alors agir pour de vrai
(email envoyé depuis la vraie boîte de la société, tentative de connexion LDAP/SMB réelle).

```bash
cd backend
node --env-file=.env scripts/dev-scrub-secrets.js
```

`--env-file` est nécessaire : le garde-fou lit `DATABASE_URL` avant toute connexion, donc avant
que Prisma ne charge `.env` lui-même. Sans cette option, le script refuse de tourner.

Le script :
- **refuse de s'exécuter** si `NODE_ENV=production` ou si l'hôte de `DATABASE_URL` n'est pas
  `localhost`/`127.0.0.1`/`::1` — garde-fou testé indépendamment
  (`src/__tests__/dev-scrub-secrets.spec.ts`) ;
- **supprime** les secrets réels de la table de configuration (`smtp.password`, `smtp.user`,
  `entra.client_secret`, `ldap.bind_password`, `smb.password`) ;
- **désactive** LDAP et l'export SMB (`ldap.enabled` / `smb.enabled`), qui ne peuvent plus
  fonctionner sans ces secrets — l'authentification locale (`admin@local`) n'est pas touchée ;
- **repointe le SMTP vers Mailpit** (host/port/secure/from ci-dessus) ;
- n'affiche jamais aucune valeur, uniquement les clés modifiées ou supprimées, et est
  rejouable sans effet une fois passé (idempotent).

### Recréer la base de dev depuis les migrations

À utiliser si la base de dev locale a dérivé (schéma incohérent, données de test à jeter, ou
pour repartir d'un état garanti identique au dépôt). **Toutes les données locales sont
perdues** (bons, collaborateurs, pièces jointes, configuration) : irréversible sans sauvegarde
préalable.

```bash
docker compose -f docker-compose.dev.yml down -v   # supprime aussi le volume pgdata_dev
docker compose -f docker-compose.dev.yml up -d

cd backend
npm run prisma:migrate                              # prisma migrate deploy : uniquement les migrations du dépôt
node scripts/reset-admin-password.js 'MotDePasseTemporaire!2026'
```

> À titre d'exemple concret de dérive : la base de dev de ce poste a longtemps porté 4
> migrations `20260331_*` absentes de `backend/prisma/migrations` (vestige d'un chantier
> abandonné), visibles avec `npx prisma migrate diff --from-migrations prisma/migrations
> --to-url "$DATABASE_URL" --script` depuis `backend/`. Recréer la base comme ci-dessus
> supprime cet écart : seules les migrations versionnées dans le dépôt sont rejouées.

## Tests

```bash
cd backend
npm test              # tests unitaires Jest
npm run test:cov      # avec rapport de couverture (backend/coverage/lcov-report/index.html)

cd frontend
npm test              # tests unitaires Vitest
```
