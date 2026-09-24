#!/bin/sh
#
# Décide, au démarrage du conteneur, si nginx croit l'en-tête CF-Connecting-IP
# pour connaître l'adresse IP du client (voir « Adresse IP du client » dans
# nginx.conf, qui inclut le fichier écrit ici).
#
#   TRUST_CF_CONNECTING_IP=0 (défaut) : l'en-tête est ignoré, quelle que soit
#     sa valeur. C'est le cas derrière Nginx Proxy Manager.
#   TRUST_CF_CONNECTING_IP=1 : l'en-tête est cru. Seulement derrière
#     Cloudflare, quand AUCUNE requête ne peut atteindre ce conteneur sans y
#     passer (sinon n'importe quel poste choisit l'adresse enregistrée sur les
#     signatures), et pour les tests E2E.
#   Toute autre valeur arrête le conteneur : une faute de frappe ne doit pas
#     changer en silence l'adresse enregistrée sur les signatures.
#
# Lancé par l'entrypoint de l'image nginx officielle (dossier
# /docker-entrypoint.d/, qui s'interrompt si ce script échoue), et une fois à
# la construction de l'image : le fichier par défaut (en-tête ignoré) existe
# donc même si l'entrypoint est contourné.
set -eu

FICHIER=/etc/nginx/client-ip/cf-connecting-ip.conf

# $cf_connecting_ip_valide (défini dans nginx.conf) contient l'en-tête s'il a
# la forme d'une adresse IP, vide sinon ; ce fichier ne décide que de le
# retenir ou non.
CONF_CRUE='# Généré au démarrage par /docker-entrypoint.d/40-client-ip.sh : ne pas modifier.
# TRUST_CF_CONNECTING_IP=1 : CF-Connecting-IP est cru.
map $cf_connecting_ip_valide $cf_connecting_ip_retenu {
    default $cf_connecting_ip_valide;
}'

CONF_IGNOREE='# Généré au démarrage par /docker-entrypoint.d/40-client-ip.sh : ne pas modifier.
# TRUST_CF_CONNECTING_IP=0 : CF-Connecting-IP est ignoré.
map $cf_connecting_ip_valide $cf_connecting_ip_retenu {
    default "";
}'

case "${TRUST_CF_CONNECTING_IP:-0}" in
  1) contenu="$CONF_CRUE"; resume="CF-Connecting-IP cru (TRUST_CF_CONNECTING_IP=1)" ;;
  0) contenu="$CONF_IGNOREE"; resume="CF-Connecting-IP ignoré" ;;
  *)
    echo "$0: TRUST_CF_CONNECTING_IP=\"${TRUST_CF_CONNECTING_IP}\" n'est pas une valeur acceptée." >&2
    echo "$0: Valeurs possibles : 0 (défaut, en-tête CF-Connecting-IP ignoré) ou 1 (en-tête cru, uniquement derrière Cloudflare)." >&2
    exit 1
    ;;
esac

# Rien à écrire si le fichier est déjà le bon : le cas par défaut fonctionne
# donc aussi sur un système de fichiers en lecture seule.
if [ "$(cat "$FICHIER" 2>/dev/null || true)" != "$contenu" ]; then
  printf '%s\n' "$contenu" > "$FICHIER.tmp"
  mv "$FICHIER.tmp" "$FICHIER"
fi
echo "$0: adresse IP du client : $resume"
