#!/usr/bin/env bash
#
# Sauvegarde COMPLÈTE de l'application bon-mise-disposition.
#
# Sauvegarde DEUX choses indissociables :
#   1. La base PostgreSQL (bons, signatures, snapshots PDF, archives probantes…)
#   2. Le volume "data/" du backend (fichiers chiffrés : signatures, pièces jointes)
#
# ⚠️ La base ET le volume sont chiffrés/liés par ENCRYPTION_KEY. Une sauvegarde
#    est INUTILE sans la clé : sauvegardez ENCRYPTION_KEY séparément, hors de ce
#    serveur (gestionnaire de secrets / coffre). Ce script le rappelle mais ne
#    stocke JAMAIS la clé dans l'archive (ce serait contre-productif).
#
# Usage :
#   DB_CONTAINER=test-bondisposition-db-1 \
#   BACKEND_CONTAINER=test-bondisposition-backend-1 \
#   POSTGRES_USER=bons POSTGRES_DB=bons_disposition \
#   ./scripts/backup.sh /chemin/vers/backups
#
set -euo pipefail

OUT_DIR="${1:-./backups}"
DB_CONTAINER="${DB_CONTAINER:-bondisposition-db-1}"
BACKEND_CONTAINER="${BACKEND_CONTAINER:-bondisposition-backend-1}"
POSTGRES_USER="${POSTGRES_USER:-bons}"
POSTGRES_DB="${POSTGRES_DB:-bons_disposition}"
DATA_DIR_IN_CONTAINER="${DATA_DIR_IN_CONTAINER:-/app/data}"

STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="${OUT_DIR}/${STAMP}"
mkdir -p "${DEST}"

echo "→ Sauvegarde dans ${DEST}"

# 1. Dump base PostgreSQL (format custom compressé, restaurable avec pg_restore)
echo "  • Dump PostgreSQL (${POSTGRES_DB})…"
docker exec "${DB_CONTAINER}" pg_dump -U "${POSTGRES_USER}" -F c "${POSTGRES_DB}" \
  > "${DEST}/db.dump"

# 2. Archive du volume data/ (fichiers chiffrés : signatures + pièces jointes)
echo "  • Archive du volume data/ (${DATA_DIR_IN_CONTAINER})…"
docker exec "${BACKEND_CONTAINER}" tar czf - -C "$(dirname "${DATA_DIR_IN_CONTAINER}")" "$(basename "${DATA_DIR_IN_CONTAINER}")" \
  > "${DEST}/data.tar.gz"

# 3. Manifeste + empreintes d'intégrité
{
  echo "created_at=${STAMP}"
  echo "db_container=${DB_CONTAINER}"
  echo "postgres_db=${POSTGRES_DB}"
  echo "db_dump_sha256=$(sha256sum "${DEST}/db.dump" | cut -d' ' -f1)"
  echo "data_tar_sha256=$(sha256sum "${DEST}/data.tar.gz" | cut -d' ' -f1)"
} > "${DEST}/manifest.txt"

echo "✓ Sauvegarde terminée :"
ls -lh "${DEST}"
echo
echo "⚠️  RAPPEL : sauvegardez AUSSI votre ENCRYPTION_KEY hors de ce serveur."
echo "    Sans elle, db.dump + data.tar.gz sont INEXPLOITABLES (signatures,"
echo "    pièces jointes et secrets resteront chiffrés et illisibles)."
if [ -n "${ENCRYPTION_KEY:-}" ]; then
  echo "    Empreinte ENCRYPTION_KEY (pour vérifier la cohérence, pas la clé) :"
  echo "    sha256(key)=$(printf '%s' "${ENCRYPTION_KEY}" | sha256sum | cut -d' ' -f1)"
fi
