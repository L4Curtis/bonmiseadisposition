#!/usr/bin/env bash
#
# Vérifie, sur l'image frontend réelle, l'adresse IP du client que nginx
# transmet au backend (X-Real-IP et X-Forwarded-For), avec et sans l'option
# TRUST_CF_CONNECTING_IP. Vérifie aussi ce qui ne doit pas bouger : en-têtes
# de sécurité, taille maximale des requêtes, utilisateur non root.
#
# Montage : un réseau Docker jetable, un faux backend (nginx qui renvoie les
# en-têtes reçus) qui porte le nom « backend », et le frontend à tester. Les
# requêtes partent du conteneur du faux backend : son adresse est donc le
# $remote_addr attendu quand aucun en-tête n'est cru.
#
# Usage, depuis la racine du dépôt :
#   bash frontend/docker/test-client-ip.sh
#       construit l'image frontend, la teste, puis la supprime
#   IMAGE=bmad-e2e-frontend bash frontend/docker/test-client-ip.sh
#       teste une image déjà construite (par exemple celle de la pile E2E)
#
# Tout ce que le script crée (conteneurs, réseau, image construite) est
# supprimé à la fin, même en cas d'échec. Code de sortie non nul si un
# contrôle échoue.
set -euo pipefail
# Git Bash sous Windows : ne pas réécrire les chemins passés à « docker exec ».
export MSYS_NO_PATHCONV=1

ICI="$(cd "$(dirname "$0")" && pwd)"
SUFFIXE="$$"
RESEAU="bmad-ip-test-$SUFFIXE"
FAUX_BACKEND="bmad-ip-test-backend-$SUFFIXE"
FRONT="bmad-ip-test-front-$SUFFIXE"
IMAGE_CONSTRUITE=""
ECHECS=0

# Faux backend : répond à toute requête par les deux en-têtes que le frontend
# lui a transmis, sur une ligne. Tourne sous l'utilisateur non root de l'image,
# d'où les chemins dans /tmp.
CONF_FAUX_BACKEND='
daemon off;
worker_processes 1;
pid /tmp/faux-backend.pid;
error_log /dev/stderr warn;
events {}
http {
    access_log off;
    client_body_temp_path /tmp/cb;
    proxy_temp_path /tmp/pt;
    fastcgi_temp_path /tmp/ft;
    uwsgi_temp_path /tmp/ut;
    scgi_temp_path /tmp/st;
    client_max_body_size 10m;
    server {
        listen 4000;
        location / {
            default_type text/plain;
            return 200 "x-real-ip=$http_x_real_ip|x-forwarded-for=$http_x_forwarded_for";
        }
    }
}'

nettoyer() {
  docker rm -f "$FRONT" "$FAUX_BACKEND" >/dev/null 2>&1 || true
  docker network rm "$RESEAU" >/dev/null 2>&1 || true
  if [ -n "$IMAGE_CONSTRUITE" ]; then
    docker rmi "$IMAGE_CONSTRUITE" >/dev/null 2>&1 || true
  fi
}
trap nettoyer EXIT

ok() { printf '  OK     %s\n' "$1"; }
echec() { printf '  ÉCHEC  %s\n         %s\n' "$1" "$2"; ECHECS=$((ECHECS + 1)); }

preparer_image() {
  if [ -n "${IMAGE:-}" ]; then
    echo "Image testée : $IMAGE"
    return
  fi
  IMAGE="bmad-ip-test-frontend:$SUFFIXE"
  echo "Construction de l'image frontend ($IMAGE)…"
  # Contexte relatif : sous Git Bash, un chemin absolu « /c/… » ne serait pas
  # compris par docker (conversion des chemins désactivée plus haut).
  (cd "$ICI/.." && docker build -q -t "$IMAGE" . >/dev/null)
  IMAGE_CONSTRUITE="$IMAGE"
}

demarrer_faux_backend() {
  docker network create "$RESEAU" >/dev/null
  docker run -d --name "$FAUX_BACKEND" --network "$RESEAU" --network-alias backend \
    -e CONF="$CONF_FAUX_BACKEND" --entrypoint sh "$IMAGE" \
    -c 'printf "%s\n" "$CONF" > /tmp/faux-backend.conf && exec nginx -c /tmp/faux-backend.conf' >/dev/null
  IP_CLIENT="$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$FAUX_BACKEND")"
  echo "Adresse de la connexion (\$remote_addr attendu) : $IP_CLIENT"
}

# Relance le frontend avec les options données (« -e VAR=valeur »), puis attend
# qu'il réponde.
demarrer_front() {
  docker rm -f "$FRONT" >/dev/null 2>&1 || true
  docker run -d --name "$FRONT" --network "$RESEAU" "$@" "$IMAGE" >/dev/null
  local essai
  for essai in $(seq 1 50); do
    if docker exec "$FAUX_BACKEND" curl -fsS -o /dev/null "http://$FRONT:8080/" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  echo "Le frontend ne répond pas. Journal du conteneur :" >&2
  docker logs "$FRONT" >&2 || true
  exit 1
}

# cas <libellé> <adresse attendue> [en-têtes curl…]
cas() {
  local libelle="$1" attendue="$2" obtenu
  shift 2
  obtenu="$(docker exec "$FAUX_BACKEND" curl -fsS "$@" "http://$FRONT:8080/api/ip" 2>&1 || true)"
  if [ "$obtenu" = "x-real-ip=$attendue|x-forwarded-for=$attendue" ]; then
    ok "$libelle"
  else
    echec "$libelle" "attendu $attendue, reçu par le backend : $obtenu"
  fi
}

tester_sans_option() {
  echo "Sans TRUST_CF_CONNECTING_IP (défaut) :"
  demarrer_front
  cas "aucun en-tête : adresse de la connexion" "$IP_CLIENT"
  cas "CF-Connecting-IP envoyé par le client : ignoré" "$IP_CLIENT" -H 'CF-Connecting-IP: 6.6.6.6'
  cas "X-Real-IP posé par le reverse proxy : retenu" "203.0.113.7" -H 'X-Real-IP: 203.0.113.7'
  cas "X-Real-IP en IPv6 : retenu" "2001:db8::7" -H 'X-Real-IP: 2001:db8::7'
  cas "X-Real-IP l'emporte sur CF-Connecting-IP" "203.0.113.7" \
    -H 'CF-Connecting-IP: 6.6.6.6' -H 'X-Real-IP: 203.0.113.7'
  cas "X-Forwarded-For du client : jamais cru ni recopié" "$IP_CLIENT" -H 'X-Forwarded-For: 6.6.6.6'
  cas "X-Real-IP qui n'est pas une adresse : ignoré" "$IP_CLIENT" -H 'X-Real-IP: <script>'
  cas "X-Real-IP fait de chiffres hexadécimaux sans séparateur : ignoré" "$IP_CLIENT" -H 'X-Real-IP: cafe'
  cas "X-Real-IP multiple : ignoré" "$IP_CLIENT" -H 'X-Real-IP: 6.6.6.6, 7.7.7.7'
  # nginx réunit deux lignes du même en-tête en « a, b » : la liste est écartée.
  cas "X-Real-IP envoyé deux fois : ignoré" "$IP_CLIENT" -H 'X-Real-IP: 6.6.6.6' -H 'X-Real-IP: 7.7.7.7'
  cas "X-Real-IP entouré d'espaces : retenu sans eux" "203.0.113.7" -H 'X-Real-IP:   203.0.113.7   '
  cas "X-Real-IP IPv4 mappée en IPv6 : retenu" "::ffff:203.0.113.7" -H 'X-Real-IP: ::ffff:203.0.113.7'
  cas "X-Real-IP IPv6 avec zone (%eth0) : ignoré" "$IP_CLIENT" -H 'X-Real-IP: fe80::1%eth0'

  echo "Avec TRUST_CF_CONNECTING_IP=0 :"
  demarrer_front -e TRUST_CF_CONNECTING_IP=0
  cas "CF-Connecting-IP envoyé par le client : ignoré" "$IP_CLIENT" -H 'CF-Connecting-IP: 6.6.6.6'
}

tester_avec_option() {
  echo "Avec TRUST_CF_CONNECTING_IP=1 :"
  demarrer_front -e TRUST_CF_CONNECTING_IP=1
  cas "CF-Connecting-IP : retenu" "6.6.6.6" -H 'CF-Connecting-IP: 6.6.6.6'
  cas "CF-Connecting-IP l'emporte sur X-Real-IP" "6.6.6.6" \
    -H 'CF-Connecting-IP: 6.6.6.6' -H 'X-Real-IP: 203.0.113.7'
  cas "sans CF-Connecting-IP : X-Real-IP" "203.0.113.7" -H 'X-Real-IP: 203.0.113.7'
  cas "aucun en-tête : adresse de la connexion" "$IP_CLIENT"
  cas "CF-Connecting-IP qui n'est pas une adresse : ignoré" "$IP_CLIENT" -H 'CF-Connecting-IP: pas-une-ip'
  cas "CF-Connecting-IP en IPv6 : retenu" "2001:db8::6" -H 'CF-Connecting-IP: 2001:db8::6'
}

tester_valeur_invalide() {
  echo "Avec TRUST_CF_CONNECTING_IP=oui (valeur invalide) :"
  docker rm -f "$FRONT" >/dev/null 2>&1 || true
  docker run -d --name "$FRONT" --network "$RESEAU" -e TRUST_CF_CONNECTING_IP=oui "$IMAGE" >/dev/null
  local essai etat=""
  for essai in $(seq 1 50); do
    etat="$(docker inspect -f '{{.State.Running}} {{.State.ExitCode}}' "$FRONT")"
    [ "${etat%% *}" = "false" ] && break
    sleep 0.2
  done
  if [ "${etat%% *}" = "false" ] && [ "${etat##* }" != "0" ] \
    && docker logs "$FRONT" 2>&1 | grep -q 'TRUST_CF_CONNECTING_IP'; then
    ok "le conteneur refuse de démarrer et nomme l'option en cause"
  else
    echec "le conteneur refuse de démarrer et nomme l'option en cause" \
      "état « $etat », journal : $(docker logs "$FRONT" 2>&1 | tail -n 3 | tr '\n' ' ')"
  fi
}

# en_tete <libellé> <motif grep -i attendu dans les en-têtes de la page d'accueil>
en_tete() {
  if printf '%s' "$ENTETES_ACCUEIL" | grep -qi -- "$2"; then ok "$1"; else echec "$1" "motif absent : $2"; fi
}

tester_protections() {
  echo "Protections inchangées :"
  demarrer_front
  ENTETES_ACCUEIL="$(docker exec "$FAUX_BACKEND" curl -fsS -D - -o /dev/null "http://$FRONT:8080/")"
  en_tete "Content-Security-Policy" "^content-security-policy: default-src 'self';.*frame-ancestors 'none'"
  en_tete "X-Frame-Options" "^x-frame-options: DENY"
  en_tete "X-Content-Type-Options" "^x-content-type-options: nosniff"
  en_tete "Referrer-Policy" "^referrer-policy: strict-origin-when-cross-origin"
  en_tete "Permissions-Policy" "^permissions-policy: camera=()"
  en_tete "Cache-Control du shell HTML" "^cache-control: no-store"

  local code
  docker exec "$FAUX_BACKEND" sh -c 'head -c 1500000 /dev/zero > /tmp/1500k && head -c 2500000 /dev/zero > /tmp/2500k'
  code="$(docker exec "$FAUX_BACKEND" curl -s -o /dev/null -w '%{http_code}' --data-binary @/tmp/1500k "http://$FRONT:8080/api/ip")"
  [ "$code" = "200" ] && ok "requête de 1,5 Mo acceptée" || echec "requête de 1,5 Mo acceptée" "code HTTP $code"
  code="$(docker exec "$FAUX_BACKEND" curl -s -o /dev/null -w '%{http_code}' --data-binary @/tmp/2500k "http://$FRONT:8080/api/ip")"
  [ "$code" = "413" ] && ok "requête de 2,5 Mo refusée (413)" || echec "requête de 2,5 Mo refusée (413)" "code HTTP $code"

  local uid
  uid="$(docker exec "$FRONT" awk '/^Uid:/ { print $2 }' /proc/1/status)"
  [ "$uid" = "1001" ] && ok "nginx tourne sans les droits root (uid 1001)" || echec "nginx tourne sans les droits root" "uid $uid"
}

preparer_image
demarrer_faux_backend
tester_sans_option
tester_avec_option
tester_valeur_invalide
tester_protections

if [ "$ECHECS" -gt 0 ]; then
  echo "$ECHECS contrôle(s) en échec."
  exit 1
fi
echo "Tous les contrôles sont passés."
