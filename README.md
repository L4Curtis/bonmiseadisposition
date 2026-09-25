# Bons de mise à disposition

[![Build](https://github.com/L4Curtis/bonmiseadisposition/actions/workflows/docker.yml/badge.svg)](https://github.com/L4Curtis/bonmiseadisposition/actions/workflows/docker.yml)

Application web interne du Groupe Livio qui remplace les bons papier de **mise à disposition** et de
**restitution** du matériel informatique, pour toutes les filiales. Le technicien prépare le bon et le signe ;
le collaborateur le signe en ligne après connexion Microsoft, ou sur place sur l'appareil du technicien.
Chaque étape produit un PDF figé et scellé, et l'inventaire des équipements prêtés se tient à jour tout seul.

## Pour qui

| Rôle | Ce qu'il fait dans l'application |
|---|---|
| Administrateur | Tout ce que fait le technicien, plus les utilisateurs, les filiales, les paramètres, les modèles d'email et de PDF, la supervision et le journal d'audit |
| Technicien | Crée, envoie et suit les bons, fait signer sur place, traite les contestations, tient le catalogue |
| Direction | Consulte le tableau de bord et l'inventaire, en lecture seule |
| Collaborateur | Signe ses documents, retrouve ses bons et leurs PDF, conteste |

Quel que soit son rôle, chacun signe et retrouve ses propres bons. Le détail des droits est dans
[docs/architecture.md](docs/architecture.md#5-rôles-et-droits).

## Documentation

| Vous êtes | Lisez |
|---|---|
| Utilisateur : technicien, administrateur, direction | la [documentation Outline](https://docs.peduzzi.local/doc/bons-de-mise-a-disposition-dl5FheIogB) |
| Exploitant : installation, mise à jour, sauvegardes | [deploy/README.md](deploy/README.md) |
| Développeur | [docs/INDEX.md](docs/INDEX.md) : [architecture](docs/architecture.md), [tests](docs/testing-guide.md), [sécurité](docs/security.md), [conventions du frontend](docs/frontend-guide.md), [journal des modifications](CHANGELOG.md) |

## Démarrage rapide (développeur)

Prérequis : Node 22, Docker et un terminal bash (Git Bash sous Windows). Le backend et le frontend tournent
sur le poste ; Docker ne sert qu'à la base PostgreSQL et à Mailpit, un faux serveur SMTP qui capture tous les
emails sans jamais les livrer.

**1. Configuration.** Deux fichiers, à créer séparément :

```bash
cp .env.example .env                    # lu par Docker Compose : POSTGRES_PASSWORD
cp backend/.env.example backend/.env    # lu par le backend
```

Dans `backend/.env`, renseignez :

- `DATABASE_URL=postgresql://app:<POSTGRES_PASSWORD>@127.0.0.1:5432/bons_disposition` ;
- `ENCRYPTION_KEY` et `JWT_SECRET`, deux valeurs différentes obtenues chacune par
  `node -p "require('crypto').randomBytes(32).toString('hex')"` (ou `openssl rand -hex 32`) ;
- `FRONTEND_URL=http://localhost:5173` (déjà la valeur du modèle) ;
- `DEFAULT_ADMIN_PASSWORD` si vous voulez choisir le mot de passe initial de `admin@local`.

**2. Base de données et Mailpit**, publiés sur `127.0.0.1` uniquement :

```bash
docker compose -f docker-compose.dev.yml up -d --wait    # rend la main quand la base est prête
```

**3. Backend et frontend**, dans deux terminaux (le serveur Vite relaie `/api` vers le backend) :

```bash
cd backend && npm ci && npm run prisma:migrate && npm run start:dev    # http://localhost:4000
cd frontend && npm ci && npm run dev                                   # http://localhost:5173
```

**4. Première connexion.** Ouvrez http://localhost:5173 et connectez-vous avec `admin@local`, mot de passe
`DEFAULT_ADMIN_PASSWORD` ou, à défaut, celui écrit au premier démarrage dans
`backend/data/initial-admin-password.txt`. Changez-le à la première connexion : le fichier disparaît alors.

**5. Emails de test.** Dans les paramètres SMTP de l'administration (`/admin/configuration/smtp`) : hôte
`localhost`, port `1025`, sans chiffrement ni authentification, expéditeur `bons-dev@localhost.test`. Les
emails arrivent dans Mailpit : http://localhost:8025.

## Tests

```bash
cd backend && npm test      # Vitest, backend
cd frontend && npm test     # Vitest, frontend
```

Couverture, suites sur base réelle, tests de contrat HTTP et parcours de bout en bout (Playwright) :
[docs/testing-guide.md](docs/testing-guide.md).

## Outils du poste de développement

**Assainir une base de dev**, qui ne doit contenir aucun secret valable en production :

```bash
cd backend && node --env-file=.env scripts/dev-scrub-secrets.js
```

Le script supprime les secrets SMTP, Entra, LDAP et SMB, désactive l'annuaire et l'export SMB, et repointe le
SMTP vers Mailpit. Il refuse de tourner en production ou sur une base qui n'est pas locale, n'affiche aucune
valeur, et peut être rejoué sans effet.

**Repartir d'une base neuve.** Toutes les données locales sont perdues ; `admin@local` est recréé au
démarrage suivant du backend (voir l'étape 4) :

```bash
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up -d --wait
cd backend && npm run prisma:migrate    # seules les migrations du dépôt sont rejouées
```

**Données de démonstration.** `backend/scripts/demo-data.sql` crée des filiales, des collaborateurs (dont
des comptes sans adresse), un catalogue, des packs et 140 bons sur douze mois, tous marqués `[DEMO]`. Le script
est rejouable :

```bash
docker compose -f docker-compose.dev.yml exec -T db psql -U app -d bons_disposition -v ON_ERROR_STOP=1 < backend/scripts/demo-data.sql
```

**Mot de passe de `admin@local` perdu.** Depuis `backend/` (ou dans le conteneur backend avec `docker exec -i
<conteneur> node scripts/...`) :

```bash
node scripts/reset-admin-password.js 'MotDePasseTemporaire!2026'
```

Le changement est imposé à la connexion suivante, le compte est réactivé et ses sessions ouvertes sont
fermées. Un compte verrouillé après des échecs de connexion se déverrouille seul au bout de 30 minutes.

## Installation

L'application s'installe avec Portainer sur deux machines : une pour la base PostgreSQL, une pour
l'application derrière Nginx Proxy Manager. Tout le mode d'emploi d'exploitation est dans
[deploy/README.md](deploy/README.md) : installation, reverse proxy, sauvegarde et restauration, mise à jour et
retour arrière. À retenir :

- la production est épinglée sur un numéro de version (`APP_IMAGE_TAG`), jamais `latest` ;
- aucun port de l'application n'est publié, le reverse proxy la joint par son réseau Docker ;
- le reverse proxy écrase l'adresse IP qu'enverrait le poste (même document, § 4) : elle sert de preuve ;
- pour une démonstration ou une petite filiale, l'installation tout-en-un (`docker-compose.prod.yml`) est
  décrite en annexe du même document.

## Livraison

À chaque push sur `main`, GitHub Actions vérifie le backend (typage, tests, migrations, requêtes SQL et
contrat HTTP sur un vrai PostgreSQL), le frontend (typage, tests, construction) et les parcours de bout en
bout, puis publie les images `main` de la recette. Un tag `vX.Y.Z` publie les images `X.Y.Z` de la production.

## Organisation du dépôt

| Dossier ou fichier | Contenu |
|---|---|
| `backend/` | API NestJS, schéma et migrations Prisma, scripts d'administration |
| `frontend/` | Application React (Vite), servie par nginx en production |
| `e2e/` | Parcours de bout en bout (Playwright) |
| `deploy/` | Stacks de production et procédure d'exploitation |
| `docs/` | Documentation du développeur ; `docs/archive/` pour les documents de chantier |
| `docker-compose.dev.yml` | Base et Mailpit pour le poste de développement |
| `docker-compose.yml` | Pile complète construite depuis les sources (application sur le port 3000) |
| `docker-compose.prod.yml` | Installation tout-en-un, décrite en annexe de `deploy/README.md` |
