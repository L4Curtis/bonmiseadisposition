# Installer et exploiter l'application (Portainer)

Ce document est **le** mode d'emploi d'exploitation du dépôt : installation, reverse proxy, sauvegarde et
restauration, mise à jour. L'installation de référence tient sur **deux machines** :

| Machine (environnement Portainer) | Stack à coller | Contenu |
|-----------------------------------|----------------|---------|
| **base** (ex. `10.0.0.30`) | [`docker-compose.db.yml`](docker-compose.db.yml) | PostgreSQL 16 en TLS, accès limité à la machine application, sauvegarde quotidienne |
| **application** (ex. `10.0.0.20`) | [`docker-compose.app.yml`](docker-compose.app.yml) | backend + frontend, volume `data`, sauvegarde quotidienne |

```
Postes ──HTTPS──> Nginx Proxy Manager ──réseau Docker du proxy──> bons-frontend:8080 ──/api──> bons-backend:4000
                  (machine application)                                                            │
                                                                        PostgreSQL en TLS, 5432 ───┘──> bons-db (machine base)
```

Tout se fait dans Portainer : aucun fichier à créer sur les hôtes, aucun cron système. Remplacez `10.0.0.30`,
`10.0.0.20` et `bons.exemple.local` par vos valeurs. Portainer doit utiliser Docker Compose v2.

Ordre : **1.** secrets → **2.** stack base → **3.** stack application → **4.** reverse proxy → **5.** premier accès.

Pour une démonstration ou une petite filiale, une variante sur une seule machine existe :
[Annexe : installation tout-en-un](#annexe--installation-tout-en-un).

---

## 1. Générer les secrets (sur votre poste)

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

Prérequis : le reverse proxy (Nginx Proxy Manager) tourne déjà sur cette machine, en conteneur. Repérez le
nom de **son réseau Docker** : Portainer → Networks, le réseau auquel le conteneur de NPM est raccordé (par
exemple `npm_default`, ou le réseau dédié créé pour lui).

Portainer → environnement **machine application** → Stacks → Add stack → nom `bons-app` → Web editor :
coller [`docker-compose.app.yml`](docker-compose.app.yml). Variables :

```
APP_IMAGE_TAG=1.0.0
ENCRYPTION_KEY=<généré>
JWT_SECRET=<généré>
APP_DB_PASSWORD=<le même que la stack base>
DB_HOST=10.0.0.30
FRONTEND_URL=https://bons.exemple.local
PROXY_NETWORK=<réseau Docker de NPM>
```

| Variable | Rôle |
|----------|------|
| `APP_IMAGE_TAG` | Version déployée : un **numéro de version** en production (ex. `1.0.0`), `main` en recette. Jamais `latest`. Voir § 8 |
| `DB_HOST`, `DB_PORT` | Adresse de la machine base ; port facultatif (défaut 5432) |
| `FRONTEND_URL` | Adresse publique HTTPS, sans `/` final. Sert aux liens des emails et au SSO |
| `PROXY_NETWORK` | Réseau Docker du reverse proxy. Seul le frontend y est raccordé |
| `TRUST_CF_CONNECTING_IP` | Facultative, défaut `0`. `1` **uniquement** derrière Cloudflare (§ 4) |
| `DATA_VOLUME_NAME` | Facultative, défaut `bons_app_data`. Seulement pour reprendre le volume d'une ancienne installation (§ 9) |
| `DEFAULT_ADMIN_PASSWORD` | Facultative. Sans elle, un mot de passe aléatoire est généré pour `admin@local` (§ 5) |
| `BACKUP_RETENTION_DAYS`, `BACKUP_INTERVAL_SECONDS` | Facultatives : 14 jours et 86400 s (une sauvegarde par jour) |

Deploy the stack. Le backend applique les migrations au démarrage. **Aucun port n'est publié** : le
reverse proxy joint le frontend par son nom sur son réseau (§ 4). Un port publié laisserait un poste du réseau
local joindre l'application en HTTP clair, sans passer par le proxy, et choisir l'adresse IP enregistrée sur
ses signatures.

Contrôles :

- logs `bons-backend` : « All migrations have been successfully applied » puis « Nest application
  successfully started » ; le conteneur passe à l'état « healthy » (la sonde vérifie aussi que la base répond) ;
- logs `bons-frontend` : « adresse IP du client : CF-Connecting-IP ignoré » ;
- logs `bons-data-backup` : « Sauvegarde OK : /backups/data-….tar.gz ».

Si le reverse proxy tourne sur **une autre machine** et ne peut pas rejoindre ce réseau, le fichier contient un
bloc `ports` commenté sous le service `frontend` : à décommenter avec l'IP de cette machine, et à réserver au
seul proxy par le pare-feu réseau.

### Remplacer le contenu d'une stack `bons-app` déjà en service

Avant de coller ce fichier à la place d'une version antérieure (Web editor → Update the stack), ajouter dans
les variables de la stack celles qui sont désormais **obligatoires**, sans valeur par défaut :

- `PROXY_NETWORK` : le réseau de NPM auquel le frontend est déjà raccordé (Containers → `bons-frontend` →
  section Networks) ;
- `DB_HOST` et `FRONTEND_URL` : les valeurs en service (Containers → `bons-backend` → Inspect, variables
  `DATABASE_URL` et `FRONTEND_URL`).

Retirer `FRONTEND_PORT` et `FRONTEND_BIND`, qui ne servent plus. S'il manque une variable obligatoire,
Portainer refuse la mise à jour avec « … manquant » et ne touche à aucun conteneur. Ensuite : bloc Advanced de
NPM (§ 4) à jour, puis le contrôle du § 4.

---

## 4. Reverse proxy (Nginx Proxy Manager)

### Proxy host

NPM → Hosts → Proxy Hosts → Add Proxy Host.

| Onglet | Champ | Valeur |
|--------|-------|--------|
| Details | Domain Names | `bons.exemple.local` |
| Details | Scheme / Forward Hostname / Forward Port | `http` / `bons-frontend` / `8080` |
| Details | Block Common Exploits | coché |
| Details | Websockets Support | décoché |
| SSL | SSL Certificate, Force SSL, HTTP/2 Support | certificat du domaine, cochés |

Onglet **Advanced** (engrenage) : exactement ce bloc, et rien d'autre.

```nginx
# Adresse du poste = celle de sa connexion, jamais un en-tête qu'il envoie.
set_real_ip_from 127.0.0.1;

location / {
    proxy_set_header CF-Connecting-IP "";
    include conf.d/include/proxy.conf;
}
```

- `set_real_ip_from 127.0.0.1;` est **indispensable**. Par défaut, NPM croit l'en-tête `X-Real-IP` envoyé par
  toute machine d'un réseau privé (`10.x`, `172.16-31.x`, `192.168.x`) et le prend pour l'adresse du poste :
  un poste du réseau local qui envoie `X-Real-IP: 7.7.7.7` ferait enregistrer `7.7.7.7` sur ses signatures.
  Cette ligne remplace, pour ce seul proxy host, la liste des machines crues par la seule boucle locale, où
  aucun poste ne se trouve : l'adresse retenue est alors celle de la connexion.
- `proxy_set_header CF-Connecting-IP ""` vide l'en-tête `CF-Connecting-IP` qu'enverrait un poste. Le frontend
  l'ignore déjà (voir ci-dessous) : c'est un second verrou.
- L'`include` est **indispensable** : quand l'onglet Advanced contient un `location /`, NPM ne génère plus le
  sien, et c'est `proxy.conf` qui apporte le `proxy_pass` vers `bons-frontend:8080` et l'en-tête `X-Real-IP`
  avec l'adresse du poste.
- Des `proxy_set_header` posés seuls dans Advanced, hors d'un bloc `location`, sont **ignorés** : le `location`
  généré par NPM définit ses propres en-têtes, et nginx n'hérite alors plus de ceux du niveau supérieur.

### Adresse IP des signataires

L'adresse enregistrée sur chaque signature et dans le journal d'audit, et comptée par la limitation de débit,
suit cette chaîne :

1. NPM pose `X-Real-IP` avec l'adresse de la connexion du poste, en écrasant celle qu'enverrait le poste
   (grâce à `set_real_ip_from 127.0.0.1;`, sans quoi NPM reprendrait celle du poste).
2. Le nginx du frontend retient, dans cet ordre : `CF-Connecting-IP` **seulement si**
   `TRUST_CF_CONNECTING_IP=1`, puis `X-Real-IP`, puis l'adresse de la connexion. Une valeur qui n'a pas la
   forme d'une adresse IP est écartée. Il écrase ensuite `X-Real-IP` et `X-Forwarded-For` avant de joindre le
   backend.
3. Le backend lit cette adresse.

Cette adresse n'est digne de confiance que si **trois conditions** tiennent :

- le frontend n'est joignable **que** par le reverse proxy : aucun port publié, et aucun conteneur non maîtrisé
  sur le réseau du proxy. Un poste qui joindrait le frontend en direct pourrait écrire l'adresse de son choix
  dans `X-Real-IP` ;
- le reverse proxy écrase `X-Real-IP` avec l'adresse de la connexion : c'est le rôle du bloc Advanced
  ci-dessus, **ses deux lignes** `set_real_ip_from` et `include` ;
- `TRUST_CF_CONNECTING_IP` reste à `0`, sauf derrière Cloudflare (ci-dessous).

### Variante : derrière Cloudflare

Uniquement si **toutes** les requêtes arrivent par Cloudflare (tunnel `cloudflared`, ou pare-feu qui n'accepte
que Cloudflare devant le proxy) :

1. Stack `bons-app` : `TRUST_CF_CONNECTING_IP=1` → Update the stack. Le log de `bons-frontend` affiche alors
   « CF-Connecting-IP cru (TRUST_CF_CONNECTING_IP=1) ».
2. NPM, onglet Advanced : **transmettre** l'en-tête posé par Cloudflare, donc sans la ligne qui le vide :

   ```nginx
   # Adresse du poste = celle de sa connexion, jamais un en-tête qu'il envoie.
   set_real_ip_from 127.0.0.1;

   location / {
       include conf.d/include/proxy.conf;
   }
   ```

   Si `cloudflared` joint directement le frontend, sans NPM : le raccorder au réseau `PROXY_NETWORK` et viser
   `http://bons-frontend:8080`.

Si des postes joignent aussi l'application sans passer par Cloudflare (accès direct au proxy depuis le réseau
local, par exemple), laissez `TRUST_CF_CONNECTING_IP=0` : sinon n'importe quel poste choisit l'adresse
enregistrée sur ses signatures en envoyant un en-tête `CF-Connecting-IP`. Toute autre valeur que `0` ou `1`
empêche le frontend de démarrer, pour qu'une faute de frappe ne change pas ce réglage en silence.

### Contrôler

À faire après l'installation, puis après toute modification du proxy host ou de `TRUST_CF_CONNECTING_IP`.
Depuis un poste du réseau local, envoyer une connexion volontairement ratée avec deux en-têtes falsifiés :

```powershell
'{"email":"test-ip@exemple.local","password":"x"}' | Out-File -Encoding ascii "$env:TEMP\b.json"
curl.exe -sk -H "CF-Connecting-IP: 6.6.6.6" -H "X-Real-IP: 7.7.7.7" -H "X-Requested-With: XMLHttpRequest" -H "Content-Type: application/json" --data "@$env:TEMP\b.json" https://bons.exemple.local/api/auth/local-login
```

Administration → Journal d'audit : la tentative échouée pour `test-ip@exemple.local` doit porter l'adresse
**réelle** du poste, jamais `7.7.7.7`, ni `6.6.6.6` (sauf derrière Cloudflare, où la requête passe forcément
par lui).

Le comportement du frontend est aussi vérifié par un test automatisé, qui lance l'image avec et sans l'option :
`bash frontend/docker/test-client-ip.sh` (voir l'en-tête du script).

---

## 5. Premier accès

Containers → `bons-backend` → Console (`/bin/sh`) → `cat /app/data/initial-admin-password.txt`, connexion avec
`admin@local`, changement de mot de passe obligatoire (le fichier est alors supprimé). Puis Administration →
Configuration : **Général** (URL de l'application), **Email / SMTP** (adresse d'expédition : sans elle, aucun
email ne part), **Active Directory**, **Entra ID (SSO)**, **Export SMB** si besoin.

Mot de passe `admin@local` perdu : sur la machine application,

```bash
docker exec -i bons-backend node scripts/reset-admin-password.js 'MotDePasseTemporaire2026!'
```

12 caractères minimum ; le compte est réactivé, les sessions en cours invalidées, et le changement imposé à la
connexion suivante. Ce script ne lève pas un verrouillage (ci-dessous).

### Compte `admin@local` verrouillé

Après 10 échecs de connexion depuis un même poste en 30 minutes, le compte est verrouillé pour ce poste
(« Compte temporairement verrouillé… ») ; après 30 échecs depuis un même poste, tous comptes confondus, c'est le
poste qui l'est (« Trop de tentatives depuis votre adresse… »). Le verrou tombe seul au bout de 30 minutes.

Pour un autre compte local, un administrateur le lève tout de suite : page Utilisateurs, bouton
« Déverrouiller ». Pour `admin@local`, quand plus aucun administrateur ne peut se connecter, effacer les échecs
récents dans la base, depuis la Console de `bons-db` (machine base) :

```sh
psql -U app -d bons_disposition -c "DELETE FROM audit_logs WHERE action = 'login_local_failed' AND user_email = 'admin@local' AND created_at > (now() AT TIME ZONE 'UTC') - interval '30 minutes';"
```

Pour un poste verrouillé, remplacer `user_email = 'admin@local'` par `ip_address = '<adresse du poste>'`
(celle du journal d'audit). La commande affiche `DELETE <nombre de lignes effacées>` ; se reconnecter ensuite.

### Export SMB des PDF

Le backend tourne dans un conteneur Linux : un chemin Windows (`\\serveur\partage`) n'y existe pas. Le
partage se monte comme un volume Docker (paquet `cifs-utils` sur l'hôte de la machine application), et
l'application écrit dans le dossier monté.

1. Dans `docker-compose.app.yml`, décommenter la ligne `- smb_export:/mnt/export` du service `backend` et le
   volume `smb_export` en bas du fichier ; y mettre le partage (`device: "//serveur/partage/BONS"`) et le
   domaine (`domain=…`). `uid=1001,gid=1001` est l'utilisateur du backend : ne pas les changer.
2. Ajouter les variables `SMB_USER` et `SMB_PASSWORD` (compte qui a le droit d'écrire sur le partage) →
   Update the stack.
3. Administration → Configuration → Export SMB : activer l'export, chemin `/mnt/export`, puis « Tester la
   connexion SMB » doit répondre « Accès en écriture vérifié sur /mnt/export ».

Les champs Utilisateur, Mot de passe et Domaine de cet écran ne servent pas au montage : c'est l'hôte qui monte
le partage. Si le partage n'est pas monté, le test répond « Le chemin d'export n'existe pas ou le partage n'est
pas monté » et chaque export reste en échec, à relancer depuis Administration → Configuration → Monitoring
SMB une fois le partage monté. Installation tout-en-un : mêmes étapes dans `docker-compose.prod.yml`, en y
ajoutant la ligne de volume et le bloc `smb_export` (copiés de `docker-compose.app.yml`).

---

## 6. LDAPS

Si le contrôleur de domaine exige une connexion signée (LDAP signing / channel binding, courant en
environnement durci), la connexion LDAP doit passer en LDAPS (port 636) plutôt qu'en LDAP en clair (port 389).
Le certificat du contrôleur est en général signé par la CA racine interne du domaine, que Node ne connaît pas
par défaut : sans configuration, la connexion échoue avec une erreur TLS (voir le tableau ci-dessous).

1. Exporter la CA racine interne en PEM (Base64) depuis un poste du domaine : `mmc` → Certificats → Autorités
   de certification racines de confiance → clic droit sur la CA racine → Toutes les tâches → Exporter → format
   **Base-64 encodé X.509 (.CER)**.
2. Déposer ce fichier sur l'hôte de la machine application (ex. `/opt/bons/certs/ca-interne.crt`).
3. Dans `docker-compose.app.yml`, décommenter le volume et `NODE_EXTRA_CA_CERTS` du service `backend` (bloc
   « CA interne pour LDAPS »).
4. Portainer → Stack `bons-app` → Update the stack.
5. Administration → Configuration → Active Directory : URL `ldaps://<FQDN du contrôleur de domaine>:636`, puis
   **Tester la connexion LDAP**.

| Message affiché | Remède |
|------------------|--------|
| CA interne inconnue / NODE_EXTRA_CA_CERTS | Certificat de la CA racine non déposé, ou `NODE_EXTRA_CA_CERTS` non défini : reprendre les étapes 1 à 3. |
| Le nom ne correspond pas au certificat — utiliser le FQDN | L'URL utilise une IP ou un nom court : reprendre le nom complet (FQDN) du contrôleur tel qu'il figure dans son certificat. |
| Certificat expiré | Certificat du contrôleur de domaine à renouveler côté Active Directory. |
| Le contrôleur exige une connexion signée : passer en ldaps:// | L'URL est restée en `ldap://` (port 389) alors que le contrôleur impose LDAP signing / channel binding : basculer en `ldaps://<FQDN>:636`. |
| Connexion impossible (port fermé / pare-feu) | Le port 636 n'est pas joignable depuis la machine application : vérifier le pare-feu réseau et local. |

La vérification du certificat reste toujours active : ces messages signalent une vraie anomalie de
certificat, jamais une case à décocher pour la contourner.

---

## 7. Sauvegarde et restauration

C'est **la seule procédure** de sauvegarde et de reprise ; elle vaut aussi pour l'installation tout-en-un
(annexe), avec d'autres noms de conteneurs.

### Ce qui est sauvegardé

Trois éléments vont **ensemble** : l'un sans les autres est inexploitable.

| Élément | Contenu | Sauvegardé par | Fréquence |
|---------|---------|----------------|-----------|
| Base PostgreSQL | bons, utilisateurs, configuration (secrets chiffrés), PDF figés et scellés, journal d'audit | `bons-db-backup` (machine base) → volume `bons_db_backups` | au démarrage du conteneur puis toutes les 24 h, 14 jours gardés |
| Volume `data` | images de signature chiffrées, pièces jointes | `bons-data-backup` (machine application) → volume `bons_data_backups` | idem |
| `ENCRYPTION_KEY` | clé de chiffrement | **vous**, une fois : coffre-fort de l'équipe, hors des serveurs | — |

Sans la bonne `ENCRYPTION_KEY`, le backend refuse de démarrer (message « ENCRYPTION_KEY invalide : le canari de
chiffrement est illisible ») plutôt que d'abîmer les données : remettez la bonne clé.

**Sortir les sauvegardes des machines** : les deux volumes de sauvegarde sont sur les machines elles-mêmes.
Incluez-les dans la sauvegarde des machines (Veeam), ou remplacez-les par un volume CIFS vers le serveur de
fichiers (exemple en commentaire en bas de chaque stack). Sinon, perdre une machine, c'est perdre aussi ses
sauvegardes.

**Vérifier qu'elles tournent** : logs de `bons-db-backup` et `bons-data-backup`, une ligne « Sauvegarde OK »
par jour ; « ÉCHEC » signale un problème. Pour en déclencher une tout de suite (avant une mise à jour, par
exemple) : redémarrer le conteneur de sauvegarde, qui sauvegarde à chaque démarrage.

### Restaurer la base

1. Machine application : arrêter `bons-backend`.
2. Machine base : Console de `bons-db-backup` :

   ```sh
   ls -lh /backups
   pg_restore -h /var/run/postgresql -U app -d bons_disposition --clean --if-exists --no-owner --no-privileges /backups/bons-AAAAMMJJ-HHMM.dump
   ```

3. Redémarrer `bons-backend`. Dans ses logs : migrations appliquées, aucun message « ENCRYPTION_KEY invalide ».
   Ouvrir un bon signé pour vérifier que les signatures s'affichent.

### Restaurer le volume data

1. Stack `bons-app` : sur le service `data-backup`, remplacer temporairement `data:/data:ro` par `data:/data`
   → Update the stack.
2. Arrêter `bons-backend`, puis Console de `bons-data-backup` :

   ```sh
   ls -lh /backups
   tar xzf /backups/data-AAAAMMJJ-HHMM.tar.gz -C /
   ```

3. Remettre `:ro` → Update the stack, puis redémarrer `bons-backend`.

### Reprise après la perte d'une machine

Les sauvegardes doivent avoir été sorties de la machine perdue (voir plus haut). Pour déposer un fichier de
sauvegarde dans le volume d'une stack neuve, depuis l'hôte : `docker cp <fichier> bons-db-backup:/backups/`
(ou `bons-data-backup:/backups/`).

- **Machine base perdue** : déployer la stack base (§ 2) sur la nouvelle machine, avec le même
  `APP_DB_PASSWORD` ; déposer le dernier dump ; restaurer la base (ci-dessus). Si l'adresse de la machine a
  changé, mettre à jour `DB_HOST` dans la stack `bons-app`.
- **Machine application perdue** : installer NPM, puis déployer la stack application (§ 3) avec **la même**
  `ENCRYPTION_KEY`, le même `APP_DB_PASSWORD` et la version qui tournait (`APP_IMAGE_TAG`) ; déposer la
  dernière archive `data` et la restaurer (ci-dessus) ; recréer le proxy host (§ 4). Si l'adresse de la
  machine a changé, mettre à jour `APP_HOST_IP` dans la stack `bons-db`.

### Tester une restauration

Une sauvegarde jamais restaurée n'est pas une sauvegarde. Au moins une fois par an, et après tout changement de
version majeure de PostgreSQL, sur la machine base, sans toucher à la production :

```sh
docker run -d --name bons-test-restauration -e POSTGRES_PASSWORD=test -v bons_db_backups:/backups:ro postgres:16-alpine
docker exec bons-test-restauration sh -c 'until pg_isready -h 127.0.0.1 -U postgres -q; do sleep 1; done; createdb -U postgres bons_test'
docker exec bons-test-restauration pg_restore -U postgres -d bons_test --no-owner --no-privileges /backups/bons-AAAAMMJJ-HHMM.dump
docker exec bons-test-restauration psql -U postgres -d bons_test -c "SELECT (SELECT count(*) FROM users) AS utilisateurs, (SELECT count(*) FROM bons) AS bons"
docker rm -f bons-test-restauration
```

Et sur la machine application, Console de `bons-data-backup` : `tar tzf /backups/data-AAAAMMJJ-HHMM.tar.gz |
head` doit lister des fichiers. Notez la date, la durée et le résultat dans la documentation d'exploitation.

### Objectifs

- **Perte de données maximale** : 24 h (une sauvegarde par jour ; réglable par `BACKUP_INTERVAL_SECONDS`).
- **Durée de remise en service** : quelques minutes pour une restauration, une heure environ pour
  reconstruire une machine.

La rétention RGPD (Administration → Configuration → Rétention RGPD) supprime volontairement d'anciens bons :
c'est une destruction réglementaire, pas un incident.

---

## 8. Mettre à jour, publier une version, revenir en arrière

Principe : la recette suit `main`. Chaque push sur `main` publie une image `:main`, que la stack de recette
(`APP_IMAGE_TAG=main`) récupère au prochain « Pull and redeploy ». La production ne suit aucune branche : elle
reste épinglée sur un numéro de version, posé à la main par un tag git, jamais publié par un simple push.

### Publier une version

1. Vérifier que la recette (stack sur `APP_IMAGE_TAG=main`) se comporte correctement.
2. Mettre à jour `CHANGELOG.md` (section de la version).
3. Poser le tag et le pousser :

   ```bash
   git tag -a v1.0.0 -m "Description de la version"
   git push origin v1.0.0
   ```

4. Attendre que la CI (`.github/workflows/docker.yml`) soit verte sur ce tag : elle publie les images
   étiquetées `X.Y.Z` et `X.Y`.

### Mettre à jour la production

1. Déclencher une sauvegarde fraîche : redémarrer `bons-db-backup` et `bons-data-backup`, attendre
   « Sauvegarde OK » (§ 7).
2. Stack de **production** : `APP_IMAGE_TAG` = la nouvelle version, sans le « v » (ex. `1.0.0`) → Update the
   stack, avec **Pull and redeploy**.
3. Contrôles du § 3 (migrations, « healthy »).

La stack base ne se met à jour qu'au sein de PostgreSQL 16 (image `postgres:16-alpine`) : passer à une version
majeure supérieure demande un dump et une restauration.

### Retour arrière

Remettre la version précédente dans `APP_IMAGE_TAG` → Update the stack.

Une migration de base appliquée par la nouvelle version ne se défait pas toute seule. Si le CHANGELOG de la
version annonce une migration qui supprime ou renomme des données : arrêter `bons-backend`, restaurer la
sauvegarde faite avant la mise à jour (§ 7), remettre l'ancienne version, puis redémarrer.

### Migration des stacks qui suivaient `latest`

`latest` n'est plus qu'un alias de `main`, publié le temps de cette migration : à ne jamais utiliser.

- **Production** : remplacer `latest` par le numéro de version en production dans `APP_IMAGE_TAG`.
- **Recette** : remplacer `latest` par `main`.

### Numérotation

`X.Y.Z` : **Z** pour un correctif sans changement de comportement attendu, **Y** pour un ajout
rétrocompatible, **X** pour une rupture (migration de données, changement d'API ou de comportement).

---

## 9. Reprise d'une installation tout-en-un existante

Pour passer de la stack tout-en-un (`docker-compose.prod.yml`) aux deux machines :

1. Déployer la stack base (§ 2) **sans encore déployer** la stack application.
2. Arrêter le conteneur backend de l'ancienne stack (plus aucune écriture).
3. Console du conteneur **db de l'ancienne stack** (sa machine doit être `APP_HOST_IP` ; sinon mettre
   temporairement son IP dans `APP_HOST_IP`) :

   ```sh
   pg_dump -U app --no-owner --no-privileges bons_disposition \
     | PGPASSWORD='<APP_DB_PASSWORD>' PGSSLMODE=require psql -h 10.0.0.30 -U app -d bons_disposition -v ON_ERROR_STOP=1 -q
   ```

4. Déployer la stack application (§ 3) avec **les mêmes** `ENCRYPTION_KEY` et `JWT_SECRET` que l'ancienne et, si
   c'est la même machine, `DATA_VOLUME_NAME=<nom de l'ancien volume data>` (Portainer → Volumes, ex.
   `bons-demo_data`) pour garder les images de signature et les pièces jointes.
5. Faire pointer le proxy host sur `bons-frontend` (§ 4), vérifier l'application, puis supprimer l'ancienne
   stack **sans cocher la suppression des volumes** tant que tout n'est pas validé.

---

## 10. Deuxième instance (recette) sur la même machine ou le même proxy

Une deuxième instance collée depuis le même fichier doit **tout** renommer, sinon elle entre en conflit avec la
production :

| Quoi | Production | Recette (exemple) | Pourquoi |
|------|------------|-------------------|----------|
| `container_name` des trois services | `bons-backend`, `bons-frontend`, `bons-data-backup` | `bons-recette-backend`, … | Deux conteneurs du même nom ne peuvent coexister, et le proxy vise ce nom |
| `DATA_VOLUME_NAME` | `bons_app_data` | `bons_recette_app_data` | Sinon la recette écrit dans les fichiers de la production |
| volume `data_backups` (`name:`) | `bons_data_backups` | `bons_recette_data_backups` | Idem pour les sauvegardes |
| Proxy host NPM | `bons-frontend:8080` | `bons-recette-frontend:8080` | |

Pourquoi c'est important : deux stacks qui déclarent chacune un service `frontend` sur le même réseau de proxy
créent un nom ambigu. Si le proxy vise `frontend` et non un nom de conteneur unique, il envoie les requêtes
tantôt à la recette, tantôt à la production, avec la base correspondante. Symptômes : configuration qui
« revient » à l'ancienne valeur, connexion qui échoue une fois sur deux, données qui disparaissent puis
réapparaissent.

De même, le nginx du frontend joint le backend par le nom `backend` : aucun conteneur du réseau du proxy ne doit
s'appeler `backend` ni porter cet alias (les backends des stacks de ce dépôt ne sont raccordés qu'à leur réseau
interne).

---

## 11. Dépannage

| Symptôme | Cause probable |
|----------|----------------|
| `db-setup` : « Installation d'openssl impossible » | la machine base n'accède pas au dépôt Alpine au premier déploiement (proxy, pare-feu) |
| `bons-db` ne démarre pas : « cannot assign requested address » | `DB_BIND_IP` n'est pas une IP de la machine base |
| backend : `P1001: Can't reach database server` | `DB_HOST`/`DB_PORT` faux, pare-feu réseau entre les deux machines |
| logs `bons-db` : `no pg_hba.conf entry for host "x.x.x.x"` | la base voit l'application sous l'IP `x.x.x.x` (NAT, autre carte réseau) : mettre cette IP dans `APP_HOST_IP` |
| backend : `password authentication failed for user "app"` | `APP_DB_PASSWORD` différent entre les deux stacks. Le rôle est créé au tout premier démarrage : pour changer le mot de passe ensuite, Console `bons-db` → `psql -U postgres -c "ALTER ROLE app PASSWORD '<nouveau>'"` |
| `bons-db` sans rôle `app` | le volume `bons_pgdata` existait déjà : le script d'init ne s'exécute que sur une base vide |
| `admin@local` : « Compte temporairement verrouillé » | § 5, « Compte `admin@local` verrouillé » |
| backend : `ENCRYPTION_KEY invalide` | clé différente de celle qui a chiffré les données : remettre la bonne |
| déploiement refusé : `network … declared as external, but could not be found` | `PROXY_NETWORK` ne correspond à aucun réseau existant : reprendre le nom exact (Portainer → Networks) |
| `bons-frontend` redémarre en boucle : « TRUST_CF_CONNECTING_IP=… n'est pas une valeur acceptée » | mettre `0` (ou `1` derrière Cloudflare) |
| NPM : 502 Bad Gateway | NPM n'est pas sur `PROXY_NETWORK`, Forward Hostname faux (`bons-frontend`), ou frontend pas encore démarré (il attend un backend « healthy ») |
| journal d'audit : tout le monde a une adresse en 172.x | le bloc Advanced n'a pas l'`include conf.d/include/proxy.conf` : `X-Real-IP` n'est plus posé |
| journal d'audit : `7.7.7.7` passe le contrôle du § 4 | la ligne `set_real_ip_from 127.0.0.1;` manque dans le bloc Advanced, ou un port du frontend est publié |
| journal d'audit : `6.6.6.6` passe le contrôle du § 4 | `TRUST_CF_CONNECTING_IP=1` alors que des postes joignent le proxy sans passer par Cloudflare : remettre `0` et le bloc Advanced qui vide l'en-tête |

---

## Annexe : installation tout-en-un

Base, backend et frontend sur **une seule machine**, avec [`docker-compose.prod.yml`](../docker-compose.prod.yml)
à la racine du dépôt. Réservée à une démonstration ou à une petite filiale : la production du groupe utilise
les deux machines ci-dessus. Mêmes images, même reverse proxy, mêmes protections, mêmes sauvegardes ; seule
la base, dans la même stack, n'a pas de connexion TLS (elle n'est joignable que par le réseau interne).

**Version figée** : `APP_IMAGE_TAG` est un numéro de version, jamais `latest` ni `main`. Pas de mise à jour
automatique : coller le fichier dans le Web editor (pas de mode « Repository » avec « Automatic updates »),
et pas de Watchtower.

1. **Secrets** : `ENCRYPTION_KEY`, `JWT_SECRET` et `APP_DB_PASSWORD` comme au § 1 (pas de superutilisateur).
2. **Stack** : Portainer → Stacks → Add stack → nom (ex. `bons-demo`) → Web editor : coller
   `docker-compose.prod.yml`. Variables :

   ```
   APP_IMAGE_TAG=1.0.0
   ENCRYPTION_KEY=<généré>
   JWT_SECRET=<généré>
   APP_DB_PASSWORD=<généré>
   FRONTEND_URL=https://bons.exemple.local
   PROXY_NETWORK=<réseau Docker de NPM>
   ```

   Facultatives, comme au § 3 : `TRUST_CF_CONNECTING_IP`, `DEFAULT_ADMIN_PASSWORD`, `BACKUP_RETENTION_DAYS`,
   `BACKUP_INTERVAL_SECONDS`.
3. **Reverse proxy** : comme au § 4, mais Forward Hostname = le nom du conteneur, `<stack>-frontend-1` (ex.
   `bons-demo-frontend-1`), port `8080`. Démonstration sur un poste sans proxy : décommenter le bloc `ports` du
   service `frontend` (`http://localhost:5147`, joignable depuis ce poste seulement) ; `PROXY_NETWORK` doit
   quand même exister (Portainer → Networks → Add network, un réseau vide suffit).
4. **Premier accès** : § 5, avec le conteneur `<stack>-backend-1` (et `<stack>-db-1` pour lever le
   verrouillage de `admin@local`).
5. **Sauvegarde et restauration** : § 7, à l'identique, avec les conteneurs `<stack>-db-backup-1`,
   `<stack>-data-backup-1`, `<stack>-backend-1` et les volumes `<stack>_db_backups`, `<stack>_data_backups`.
6. **Mise à jour et retour arrière** : § 8 (changer `APP_IMAGE_TAG`, Update the stack).
7. **Passer à deux machines** : § 9.

**Stack tout-en-un antérieure** (image `latest`, port 5147 publié, variable `POSTGRES_PASSWORD`) : recoller le
fichier sous **le même nom de stack** pour garder les volumes, avec `APP_DB_PASSWORD` = l'ancienne valeur de
`POSTGRES_PASSWORD`, `APP_IMAGE_TAG` = un numéro de version et `PROXY_NETWORK` ; retirer `FRONTEND_PORT` et
`FRONTEND_BIND` ; faire pointer le proxy host sur `<stack>-frontend-1:8080` au lieu de l'adresse de la machine,
avec le bloc Advanced du § 4, puis faire le contrôle du § 4.
Supprimer aussi du cron de l'hôte les anciens appels à `scripts/backup.sh` : les conteneurs de sauvegarde les
remplacent.
