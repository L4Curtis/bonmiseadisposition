# Sauvegarde et reprise d'activité

La procédure de sauvegarde et de restauration est décrite **à un seul endroit** :
[deploy/README.md, § 7 « Sauvegarde et restauration »](../deploy/README.md#7-sauvegarde-et-restauration).
Elle vaut pour l'installation sur deux machines comme pour l'installation tout-en-un (annexe du même
document).

En résumé :

- trois éléments vont ensemble : la **base PostgreSQL**, le **volume `data`** (images de signature
  chiffrées, pièces jointes) et la clé **`ENCRYPTION_KEY`**. L'un sans les autres est inexploitable ;
- la base et le volume `data` sont sauvegardés chaque jour par des conteneurs dédiés (`bons-db-backup`,
  `bons-data-backup`), déclarés dans les stacks : aucun script ni cron à installer sur les hôtes ;
- `ENCRYPTION_KEY` se range une fois pour toutes dans le coffre-fort de l'équipe, hors des serveurs ;
- les sauvegardes doivent sortir des machines (sauvegarde des machines ou volume CIFS), et une restauration
  doit être testée régulièrement (même document).
