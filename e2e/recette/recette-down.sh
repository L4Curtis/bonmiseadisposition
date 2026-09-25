#!/usr/bin/env bash
# Arrête le banc de recette « bmad-recette » et supprime ses données (base,
# emails, fichiers téléversés : rien n'est conservé).
#
# Usage (Git Bash sous Windows ou Linux) :
#   bash e2e/recette/recette-down.sh           # garde les images (reconstruction rapide)
#   bash e2e/recette/recette-down.sh --images  # supprime aussi les images construites
#
# Ne touche qu'au projet compose « bmad-recette » (jamais au dev ni à bmad-e2e).
set -euo pipefail
export MSYS_NO_PATHCONV=1

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ICI"

OPTIONS=(down -v --remove-orphans)
for argument in "$@"; do
  case "$argument" in
    --images) OPTIONS+=(--rmi local) ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $argument" >&2; exit 2 ;;
  esac
done

docker compose -p bmad-recette -f docker-compose.recette.yml "${OPTIONS[@]}"
# Sources exportées par « recette-up.sh --sources » : inutiles une fois les images construites.
rm -rf .sources
echo "Banc de recette arrêté et supprimé."
