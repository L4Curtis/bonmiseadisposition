# Sauvegarde & reprise d'activité

L'application est un **système de preuve** : sa valeur tient à l'intégrité des bons
signés. Une perte de données ou de la clé de chiffrement est **irréversible**.
Ce document décrit quoi sauvegarder, comment, et comment restaurer.

## Les 3 éléments indissociables

| Élément | Contenu | Où | Sans lui… |
|---------|---------|-----|-----------|
| **Base PostgreSQL** | bons, signatures (+ sceaux), snapshots PDF, archives probantes, audit | conteneur `db` | aucune donnée |
| **Volume `data/`** | fichiers chiffrés : images de signature, pièces jointes | conteneur `backend` (`/app/data`) | signatures/photos manquantes |
| **`ENCRYPTION_KEY`** | clé AES-256-GCM | variable d'environnement | base + volume **illisibles** |

> ⚠️ Les trois vont ensemble. Une sauvegarde DB + `data/` **sans** l'`ENCRYPTION_KEY`
> est inexploitable : signatures, pièces jointes et secrets de configuration
> resteront chiffrés. **Sauvegardez `ENCRYPTION_KEY` séparément**, hors de ce
> serveur (gestionnaire de secrets, coffre-fort d'entreprise, enveloppe scellée).

## Séquestre de la clé (`ENCRYPTION_KEY`)

- Stockée **hors** du serveur applicatif (idéalement un secret manager).
- **Ne change jamais** après la première initialisation. Un changement est
  détecté au démarrage par un **canari** : le backend refuse de démarrer avec un
  message explicite (`ENCRYPTION_KEY invalide…`) plutôt que de corrompre les
  données. C'est le comportement attendu — restaurez la bonne clé.
- `JWT_SECRET` doit rester ≥ 32 caractères et **différent** d'`ENCRYPTION_KEY`
  (vérifié au démarrage).

## Sauvegarde

Les valeurs par défaut sont alignées sur `docker-compose.prod.yml`
(`POSTGRES_USER=app`, `POSTGRES_DB=bons_disposition`). **Vérifiez le nom exact
de vos conteneurs** avec `docker ps` (le préfixe dépend du nom de votre stack
Portainer) et surchargez si besoin :

```bash
DB_CONTAINER=bons-disposition-db-1 \
BACKEND_CONTAINER=bons-disposition-backend-1 \
POSTGRES_USER=app POSTGRES_DB=bons_disposition \
./scripts/backup.sh /srv/backups/bons
```

Produit `db.dump` + `data.tar.gz` + `manifest.txt` (avec empreintes SHA-256)
dans un dossier horodaté. À planifier (cron quotidien) et à **répliquer hors
site**. Testez régulièrement une restauration sur un environnement jetable :
une sauvegarde jamais restaurée n'est pas une sauvegarde.

### Planification (exemple cron quotidien à 2h)

```cron
0 2 * * * /srv/app/scripts/backup.sh /srv/backups/bons >> /var/log/bons-backup.log 2>&1
```

### Alternative : sauvegarde des volumes Docker

Si vous préférez sauvegarder les volumes nommés directement (`<stack>_pgdata`,
`<stack>_data`), un dump logique reste recommandé pour la base (cohérence
transactionnelle) — la copie de volume Postgres « à chaud » peut être
incohérente. Le script ci-dessus utilise `pg_dump` justement pour cette raison.

## Restauration

1. Provisionner l'environnement cible avec **la même `ENCRYPTION_KEY`**.
2. ```bash
   DB_CONTAINER=bons-disposition-db-1 BACKEND_CONTAINER=bons-disposition-backend-1 \
   POSTGRES_USER=app POSTGRES_DB=bons_disposition \
   ./scripts/restore.sh /srv/backups/bons/AAAAMMJJ-HHMMSS
   ```
3. Redémarrer le backend, vérifier les logs : le **canari** doit passer
   (aucun message « ENCRYPTION_KEY invalide »). Se connecter et ouvrir un bon
   signé pour confirmer que les signatures s'affichent.

## RPO / RTO indicatifs

- **RPO** (perte de données max tolérée) = fréquence des sauvegardes (ex. 24 h
  avec un cron quotidien ; descendre à 1 h via réplication/WAL si besoin).
- **RTO** (temps de remise en service) = temps de restauration DB + `data/`
  (quelques minutes pour un volume modeste).

## Bon à savoir

- `data/` **doit** être un volume Docker persistant (déclaré dans la stack), pas
  un répertoire éphémère du conteneur — sinon les fichiers chiffrés sont perdus à
  chaque recréation.
- La rétention RGPD (Admin → Configuration → Rétention) purge volontairement
  d'anciennes preuves : ce n'est **pas** une perte de données mais une
  destruction réglementaire. À ne pas confondre avec un incident.
