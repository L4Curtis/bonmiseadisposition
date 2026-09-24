FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS production
RUN addgroup -g 1001 -S nginx-app && adduser -S nginx-app -u 1001 -G nginx-app \
  && touch /var/run/nginx.pid \
  && mkdir -p /etc/nginx/client-ip \
  && chown -R nginx-app:nginx-app /var/run/nginx.pid /var/cache/nginx /var/log/nginx
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Adresse IP du client : 0 = l'en-tête CF-Connecting-IP est ignoré (défaut),
# 1 = il est cru (uniquement derrière Cloudflare). Voir nginx.conf.
ENV TRUST_CF_CONNECTING_IP=0
# Le script écrit son choix au démarrage (entrypoint de l'image nginx) ; il
# tourne aussi ici, pour que l'image porte déjà le réglage par défaut. Le
# dossier appartient à l'utilisateur non root, qui le réécrit au démarrage.
COPY docker/40-client-ip.sh /docker-entrypoint.d/40-client-ip.sh
RUN chmod 755 /docker-entrypoint.d/40-client-ip.sh \
  && /docker-entrypoint.d/40-client-ip.sh \
  && chown -R nginx-app:nginx-app /etc/nginx/client-ip
# Run as non-root (nginx listens on port 8080 — see nginx.conf)
USER nginx-app
# Configuration vérifiée dès la construction (sous l'utilisateur final, pour que
# les dossiers temporaires éventuellement créés lui appartiennent).
RUN nginx -t
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
