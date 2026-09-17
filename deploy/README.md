# Déploiement Portainer sur deux machines : application + base PostgreSQL dédiée

| Environnement Portainer | Stack à coller | Contenu |
|-------------------------|----------------|---------|
| Machine **base** (ex. `10.0.0.30`) | [`docker-compose.db.yml`](docker-compose.db.yml) | PostgreSQL 16 en TLS, accès limité à la machine application, sauvegarde quotidienne |
| Machine **application** (ex. `10.0.0.20`) | [`docker-compose.app.yml`](docker-compose.app.yml) | backend + frontend, volume `data`, sauvegarde quotidienne |

Tout se fait dans Portainer : aucun fichier à créer sur les hôtes, aucun cron système.
Remplacez `10.0.0.30` et `10.0.0.20` par vos adresses. Portainer doit utiliser Docker Compose v2.

Ordre : **1.** secrets → **2.** stack base → **3.** stack application → **4.** vérifications.

---

## 1. Générer les secrets (sur ton poste)

PowerShell 7 :

```powershell
foreach ($n in 'ENCRYPTION_KEY','JWT_SECRET') { "$n=" + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower() }
foreach ($n in 'APP_DB_PASSWORD','POSTGRES_SUPERUSER_PASSWORD') { "$n=" + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLower() }
```

Ou bash / WSL :

```bash
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)"
echo "JWT_SECRET=$(openssl rand -hex 32)"
echo "APP_DB_PASSWORD=$(openssl rand -hex 24)"
echo "POSTGRES_SUPERUSER_PASSWORD=$(openssl rand -hex 24)"
```

| Secret | Stack | À savoir |
|--------|-------|----------|
| `ENCRYPTION_KEY` | application | **Ne change jamais.** À ranger dans le coffre-fort, hors des serveurs : sans elle, base et sauvegardes sont illisibles. En reprise d'une installation existante, reprendre l'ancienne valeur. |
| `JWT_SECRET` | application | Différent d'`ENCRYPTION_KEY`. Le changer déconnecte simplement les utilisateurs. |
| `APP_DB_PASSWORD` | **les deux** | Même valeur dans les deux stacks. |
| `POSTGRES_SUPERUSER_PASSWORD` | base | Compte `postgres`, jamais utilisé par l'application ni accessible par le réseau. |

Toujours en **hexadécimal** : un mot de passe base64 peut contenir `/` ou `+`, qui cassent l'URL de
connexion à la base.

---

## 2. Stack base de données

Portainer → environnement **machine base** → Stacks → Add stack → nom `bons-db` → Web editor :
coller [`docker-compose.db.yml`](docker-compose.db.yml). Variables d'environnement :

```
POSTGRES_SUPERUSER_PASSWORD=<généré>
APP_DB_PASSWORD=<généré>
APP_HOST_IP=10.0.0.20
DB_BIND_IP=10.0.0.30
```

Deploy the stack. Au premier déploiement, `db-setup` télécharge `openssl` (dépôt Alpine) pour
générer le certificat TLS, écrit `pg_hba.conf` et le script qui crée le rôle `app`, puis s'arrête :
il apparaît « exited » dans Portainer, c'est normal.

Contrôles (Containers → logs) :

- `bons-db-setup` : « Préparation terminée : accès réseau autorisé pour app depuis 10.0.0.20 »
- `bons-db` : `CREATE ROLE`, `CREATE DATABASE`, puis « database system is ready to accept connections »
- `bons-db-backup` : « Sauvegarde OK : /backups/bons-….dump »

Ce que la stack garantit :

- connexion réseau **uniquement** du rôle `app`, **uniquement** depuis `APP_HOST_IP`, **uniquement en TLS** ;
- `app` n'est pas superutilisateur (il possède seulement sa base) ;
- le port n'écoute que sur `DB_BIND_IP`.

Attention : un port publié par Docker **contourne le pare-feu local** (`ufw`). `pg_hba.conf` refuse
déjà toute autre machine ; filtrez en plus sur le pare-feu réseau si possible.

Changer l'IP autorisée : modifier `APP_HOST_IP` dans la stack → Update the stack.

---

## 3. Stack application

Portainer → environnement **machine application** → Stacks → Add stack → nom `bons-app` → Web editor :
coller [`docker-compose.app.yml`](docker-compose.app.yml). Variables :

```
ENCRYPTION_KEY=<généré>
JWT_SECRET=<généré>
APP_DB_PASSWORD=<le même que la stack base>
DB_HOST=10.0.0.30
FRONTEND_URL=https://bons.peduzzi.local
FRONTEND_BIND=127.0.0.1        # seulement si le reverse proxy tourne sur cette machine
```

Deploy the stack. Le backend applique les migrations au démarrage.

Contrôles :

- logs `bons-backend` : « All migrations have been successfully applied » puis « Nest application successfully started » ;
- logs `bons-data-backup` : « Sauvegarde OK : /backups/data-….tar.gz » ;
- reverse proxy → `http://10.0.0.20:5147` (ou `127.0.0.1:5147`).

Premier accès : Containers → `bons-backend` → Console (`/bin/sh`) →
`cat /app/data/initial-admin-password.txt`, connexion avec `admin@local`, changement de mot de passe
obligatoire. Puis Configuration → Général (URL de l'application), SMTP, LDAP, Entra, Export SMB.

Mise à jour de l'application : stack `bons-app` → **Pull and redeploy**.

---

## 4. Sauvegardes

La base, le volume `data` et `ENCRYPTION_KEY` vont **ensemble** : l'un sans les autres est inexploitable.

| Quoi | Service | Volume de destination | Fréquence |
|------|---------|-----------------------|-----------|
| Base PostgreSQL | `bons-db-backup` (machine base) | `bons_db_backups` | au démarrage puis toutes les 24 h, 14 jours gardés |
| Images de signature, pièces jointes | `bons-data-backup` (machine application) | `bons_data_backups` | au démarrage puis toutes les 24 h, 14 jours gardés |

Pour sortir les sauvegardes des machines, remplacer ces volumes par un volume CIFS vers le serveur
de fichiers (exemple en commentaire en bas de chaque stack), ou les faire sauvegarder par votre outil
de sauvegarde habituel.

**Restaurer la base** : arrêter `bons-backend`, puis Console de `bons-db-backup` :

```sh
ls -lh /backups
pg_restore -h /var/run/postgresql -U app -d bons_disposition --clean --if-exists --no-owner --no-privileges /backups/bons-AAAAMMJJ-HHMM.dump
```

**Restaurer le volume data** : dans la stack `bons-app`, remplacer temporairement `data:/data:ro` par
`data:/data` sur `data-backup` → Update ; arrêter `bons-backend` ; Console de `bons-data-backup` :

```sh
ls -lh /backups
tar xzf /backups/data-AAAAMMJJ-HHMM.tar.gz -C /
```

Remettre `:ro`, Update, redémarrer `bons-backend`.

---

## Reprise d'une installation existante (optionnel)

Si l'application tourne déjà avec la stack tout-en-un (`docker-compose.prod.yml`) :

1. Déployer la stack base (étape 2) **sans encore déployer** la stack application.
2. Arrêter le conteneur backend de l'ancienne stack (plus aucune écriture).
3. Console du conteneur **db de l'ancienne stack** (sa machine doit être `APP_HOST_IP` ; sinon mettre
   temporairement son IP dans `APP_HOST_IP`) :

   ```sh
   pg_dump -U app --no-owner --no-privileges bons_disposition \
     | PGPASSWORD='<APP_DB_PASSWORD>' PGSSLMODE=require psql -h 10.0.0.30 -U app -d bons_disposition -v ON_ERROR_STOP=1 -q
   ```

4. Déployer la stack application avec **les mêmes** `ENCRYPTION_KEY` et `JWT_SECRET` que l'ancienne,
   et, si c'est la même machine, `DATA_VOLUME_NAME=<nom de l'ancien volume data>` (Portainer → Volumes,
   ex. `bons-disposition_data`) pour garder les images de signature et les pièces jointes.
5. Vérifier l'application, puis supprimer l'ancienne stack **sans cocher la suppression des volumes**
   tant que tout n'est pas validé.

---

## Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `db-setup` : « Installation d'openssl impossible » | la machine base n'accède pas au dépôt Alpine au premier déploiement (proxy, pare-feu) |
| `bons-db` ne démarre pas : « cannot assign requested address » | `DB_BIND_IP` n'est pas une IP de la machine base |
| backend : `P1001: Can't reach database server` | `DB_HOST`/`DB_PORT` faux, pare-feu réseau entre les deux machines |
| logs `bons-db` : `no pg_hba.conf entry for host "x.x.x.x"` | la base voit l'application sous l'IP `x.x.x.x` (NAT, autre carte réseau) : mettre cette IP dans `APP_HOST_IP` |
| backend : `password authentication failed for user "app"` | `APP_DB_PASSWORD` différent entre les deux stacks. Le rôle est créé au tout premier démarrage : pour changer le mot de passe ensuite, Console `bons-db` → `psql -U postgres -c "ALTER ROLE app PASSWORD '<nouveau>'"` |
| `bons-db` sans rôle `app` | le volume `bons_pgdata` existait déjà : le script d'init ne s'exécute que sur une base vide |
| backend : `ENCRYPTION_KEY invalide` | clé différente de celle qui a chiffré les données : remettre la bonne |
