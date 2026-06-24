#!/usr/bin/env bash
#
# Restauration d'une sauvegarde produite par backup.sh.
#
# ⚠️ AVANT TOUT : l'ENCRYPTION_KEY de l'environnement cible DOIT être EXACTEMENT
#    celle utilisée au moment de la sauvegarde. Sinon le canari de démarrage
#    bloquera le backend (fail-fast) et les données chiffrées seront illisibles.
#
# Usage (adaptez les noms de conteneurs à VOTRE stack — voir `docker ps`) :
#   DB_CONTAINER=bons-disposition-db-1 BACKEND_CONTAINER=bons-disposition-backend-1 \
#   POSTGRES_USER=app POSTGRES_DB=bons_disposition \
#   ./scripts/restore.sh /chemin/vers/backups/AAAAMMJJ-HHMMSS
#
set -euo pipefail

SRC="${1:?Usage: restore.sh <dossier-de-sauvegarde>}"
DB_CONTAINER="${DB_CONTAINER:-bons-disposition-db-1}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-bons-disposition-backend-1}"
POSTGRES_USER="${POSTGRES_USER:-app}"
POSTGRES_DB="${POSTGRES_DB:-bons_disposition}"
DATA_DIR_IN_CONTAINER="${DATA_DIR_IN_CONTAINER:-/app/data}"

[ -f "${SRC}/db.dump" ] || { echo "db.dump introuvable dans ${SRC}"; exit 1; }
[ -f "${SRC}/data.tar.gz" ] || { echo "data.tar.gz introuvable dans ${SRC}"; exit 1; }

echo "⚠️  Cette opération ÉCRASE la base ${POSTGRES_DB} et le volume data/. Ctrl-C pour annuler."
read -r -p "Confirmer la restauration depuis ${SRC} ? [tapez OUI] " ans
[ "${ans}" = "OUI" ] || { echo "Annulé."; exit 1; }

echo "  • Restauration PostgreSQL…"
docker exec -i "${DB_CONTAINER}" pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists \
  < "${SRC}/db.dump"

echo "  • Restauration du volume data/…"
docker exec -i "${BACKEND_CONTAINER}" tar xzf - -C "$(dirname "${DATA_DIR_IN_CONTAINER}")" \
  < "${SRC}/data.tar.gz"

echo "✓ Restauration terminée. Redémarrez le backend et vérifiez les logs :"
echo "  le canari ENCRYPTION_KEY doit passer (pas de message « ENCRYPTION_KEY invalide »)."
