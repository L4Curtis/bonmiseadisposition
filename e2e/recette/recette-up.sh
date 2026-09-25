#!/usr/bin/env bash
# Démarre le banc de recette « bmad-recette » à partir de zéro : construit les
# images depuis les sources du dépôt, démarre la pile, attend que l'API soit
# prête, amorce le jeu de données, puis affiche les adresses et les comptes.
#
# Usage (depuis n'importe quel dossier, Git Bash sous Windows ou Linux) :
#   bash e2e/recette/recette-up.sh                      # sources = arbre de travail du dépôt
#   bash e2e/recette/recette-up.sh --sources HEAD       # sources = une révision git (ici le dernier commit)
#   bash e2e/recette/recette-up.sh --sans-construction  # réutilise les images déjà construites
#
# --sources <révision> exporte backend/ et frontend/ de cette révision dans
# e2e/recette/.sources (git archive : lecture seule, le dépôt n'est pas
# modifié) et construit depuis cet export. Utile quand l'arbre de travail
# contient des travaux en cours qui ne compilent pas encore.
#
# Toujours une base neuve : un banc existant est d'abord supprimé (données
# comprises), pour que chaque vague de recette parte du même jeu de données.
# Ne touche qu'au projet compose « bmad-recette » (jamais au dev ni à bmad-e2e).
# Guide des testeurs : e2e/recette/GUIDE-TESTEUR.md
set -euo pipefail

# Git Bash : ne pas réécrire en chemins Windows les arguments qui ressemblent
# à des chemins Unix. Les chemins passés ci-dessous sont tous relatifs.
export MSYS_NO_PATHCONV=1

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ICI"

PROJET="bmad-recette"
URL_APP="http://localhost:8082"
DELAI_API_S=300
CONSTRUIRE=1
REVISION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --sans-construction) CONSTRUIRE=0 ;;
    --sources) REVISION="${2:?--sources attend une révision git (ex. HEAD)}"; shift ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Option inconnue : $1" >&2; exit 2 ;;
  esac
  shift
done

compose() {
  docker compose -p "$PROJET" -f docker-compose.recette.yml "$@"
}

duree() {
  local secondes=$1
  printf '%d min %02d s' $((secondes / 60)) $((secondes % 60))
}

command -v docker >/dev/null || { echo "docker est introuvable." >&2; exit 1; }
command -v node >/dev/null || { echo "node est introuvable (Node 22 attendu)." >&2; exit 1; }
command -v curl >/dev/null || { echo "curl est introuvable." >&2; exit 1; }
if [ "$CONSTRUIRE" -eq 0 ] && ! docker image inspect "$PROJET-backend" "$PROJET-frontend" >/dev/null 2>&1; then
  echo "Images $PROJET-backend / $PROJET-frontend absentes : relancer sans --sans-construction." >&2
  exit 1
fi

debut=$(date +%s)

echo "── Suppression d'un éventuel banc précédent (projet $PROJET)"
compose down -v --remove-orphans >/dev/null 2>&1 || true

if [ -n "$REVISION" ] && [ "$CONSTRUIRE" -eq 1 ]; then
  command -v git >/dev/null || { echo "git est introuvable." >&2; exit 1; }
  echo "── Export des sources de la révision $REVISION ($(git -C ../.. rev-parse --short "$REVISION"))"
  rm -rf .sources
  mkdir -p .sources
  git -C ../.. archive --format=tar "$REVISION" backend frontend | tar -x -C .sources
  export RECETTE_SOURCES=.sources
fi

if [ "$CONSTRUIRE" -eq 1 ]; then
  # Une image à la fois : la mémoire du poste est comptée.
  echo "── Construction de l'image backend"
  compose build backend
  echo "── Construction de l'image frontend"
  compose build frontend
fi
fin_construction=$(date +%s)

echo "── Démarrage de la pile"
# --no-build : les images sont construites plus haut, une à la fois ; compose
# ne doit jamais en construire deux en parallèle de lui-même.
compose up -d --no-build

echo "── Attente de l'API ($URL_APP/api/health/ready)"
limite=$(( $(date +%s) + DELAI_API_S ))
until curl -fsS "$URL_APP/api/health/ready" >/dev/null 2>&1; do
  if [ "$(date +%s)" -ge "$limite" ]; then
    echo "L'API ne répond pas après ${DELAI_API_S} s. Journaux du backend :" >&2
    compose logs --tail 80 backend >&2 || true
    exit 1
  fi
  sleep 2
done
fin_demarrage=$(date +%s)

echo "── Amorçage du jeu de données"
node amorcage/amorcer.cjs
fin=$(date +%s)

echo
echo "Temps : construction $(duree $((fin_construction - debut))), démarrage $(duree $((fin_demarrage - fin_construction))), amorçage $(duree $((fin - fin_demarrage))) — total $(duree $((fin - debut)))."
echo "Arrêt et suppression du banc : bash e2e/recette/recette-down.sh"
