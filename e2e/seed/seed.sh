#!/usr/bin/env bash
# Amorce l'environnement E2E (voir seed.sql) — à lancer une fois la compose
# démarrée et /api/health/ready vert. Rejouable tant qu'aucun test n'a créé de
# bon (voir l'en-tête de seed.sql) ; ensuite, repartir de `down -v`.
#
# Usage : e2e/seed/seed.sh <nom-du-projet-compose>
#   e2e/seed/seed.sh bmad-e2e
set -euo pipefail

PROJECT="${1:?Usage: seed.sh <nom-du-projet-compose> (ex: bmad-e2e)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/../docker-compose.e2e.yml"

docker compose -p "$PROJECT" -f "$COMPOSE_FILE" exec -T db \
  psql -v ON_ERROR_STOP=1 -U e2e -d bons_disposition_e2e < "$SCRIPT_DIR/seed.sql"
