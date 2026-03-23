FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine AS production
RUN addgroup -g 1001 -S nginx-app && adduser -S nginx-app -u 1001 -G nginx-app \
  && touch /var/run/nginx.pid \
  && chown -R nginx-app:nginx-app /var/run/nginx.pid /var/cache/nginx /var/log/nginx
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Run as non-root (nginx listens on port 8080 — see nginx.conf)
USER nginx-app
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
