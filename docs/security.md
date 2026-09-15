# Sécurité — Référence complète

> Document consolidé issu des phases 6 et 7 (2026-03-21). Contient toutes les corrections implémentées, les règles non-négociables pour le développement futur, et les checklists de validation.

---

## Résumé : ce qui a été corrigé

### Phase 6 — Hardening initial (10 corrections)

| ID | Sévérité | Correction | Fichier |
|----|----------|------------|---------|
| SEC-01 | Critique | IDOR : `verifyCollaboratorAccess()` sur `POST /bons/:id/contestation` | `bons.controller.ts` |
| SEC-02 | Critique | LDAP injection : validation syntaxique du `user_filter` | `ldap.service.ts` |
| SEC-03 | Critique | IP spoofable : `X-Real-IP` (nginx) au lieu de `X-Forwarded-For` | `nginx.conf` + controllers |
| SEC-04 | Haute | Rate limit : `@Throttle(20/min)` sur `POST /auth/refresh` | `auth.controller.ts` |
| SEC-06 | Haute | Password policy : min 12 chars, maj+min+spécial, max 128 | `auth.service.ts` |
| SEC-07 | Haute | Brute force : verrouillage 30 min après 10 échecs | `auth.service.ts` |
| SEC-08 | Haute | Config sensible (ldap/smtp/entra/smb) restreinte à `@Roles('admin')` | `admin.controller.ts` |
| SEC-10 | Moyenne | CSP : `frame-ancestors 'none'`, `connect-src`, `font-src` | `main.ts` |
| SEC-14 | Basse | HSTS : `maxAge 31536000 + includeSubDomains` | `main.ts` |
| SEC-16 | Basse | Audit trail : `login_success/failed`, `logout`, `password_changed` | `auth.controller.ts` |

### Phase 7 — Audit OWASP complet (22 corrections supplémentaires)

| ID | Sévérité | Correction | Fichier(s) |
|----|----------|------------|-----------|
| C-01 | Critique | `.gitignore` couvre `**/.env` et `backend/.env` | `.gitignore` |
| C-02 | Critique | `JWT_SECRET` dans `docker-compose.prod.yml` | `docker-compose.prod.yml` |
| C-03 | Critique | `mustChangePassword` enforced serveur dans `JwtAuthGuard` | `jwt-auth.guard.ts` |
| H-01 | Haute | `CreateContestationDto` avec `@MaxLength(2000)` | `bons/dto/actions.dto.ts` |
| H-02 | Haute | DTOs validés pour toutes les actions bons (`@IsUUID`, `@Matches`, etc.) | `bons/dto/actions.dto.ts` |
| H-03 | Haute | SVG retiré des uploads ; anciens SVGs en `Content-Disposition: attachment` | `filiales.module.ts` |
| H-04 | Haute | Audit logs restreints à `@Roles('admin')` | `audit.controller.ts` |
| H-05 | Haute | Templates PATCH/DELETE/POST restreints à `@Roles('admin')` | `templates.controller.ts` |
| H-06 | Haute | CSRF middleware `X-Requested-With` sur POST/PUT/PATCH/DELETE | `main.ts`, `api.ts` |
| H-07 | Haute | SMB path validation `isSafeExportPath()` | `smb.service.ts` |
| M-01 | Moyenne | Brute-force persisté en DB via `AuditLog` (survit aux redémarrages) | `auth.service.ts` |
| M-02 | Moyenne | `passwordHash` exclu de toutes les réponses API users | `users.service.ts` |
| M-03 | Moyenne | Open redirect : `/^\/[^/]/` (bloque `//evil.com`) | `auth.controller.ts` |
| M-04 | Moyenne | Rate limit 5/min sur upload logo/stamp | `filiales.controller.ts` |
| M-07 | Moyenne | `X-Forwarded-For: $remote_addr` dans nginx frontend | `frontend/nginx.conf` |
| M-08 | Moyenne | Pagination audit logs plafonnée à 100 | `audit.controller.ts` |
| M-09 | Moyenne | `ResolveContestationDto` avec `@IsIn(['resolved', 'rejected'])` | `contestation.controller.ts` |
| L-01 | Basse | Cookie `access_token` path restreint à `/api` | `auth.service.ts` |
| L-02 | Basse | CSP header complet dans `frontend/nginx.conf` | `frontend/nginx.conf` |
| L-03 | Basse | Dockerfile frontend : `USER nginx-app` (non-root, port 8080) | `frontend/Dockerfile` |
| L-04 | Basse | Docker-compose mis à jour pour le port 8080 | `docker-compose.*.yml` |

---

## OWASP Top 10 — Statut actuel

| # | Catégorie | Statut |
|---|-----------|--------|
| A01 | Broken Access Control | ✅ `mustChangePassword` server-side, IDOR fixé, audit admin-only |
| A02 | Cryptographic Failures | ✅ `JWT_SECRET` en prod, cookie path restreint, `ENCRYPTION_KEY` canari |
| A03 | Injection | ✅ DTOs validés (`@IsUUID`, `@IsIn`, `@MaxLength`), LDAP filter validé |
| A04 | Insecure Design | ✅ Brute-force persisté en DB, CSRF middleware |
| A05 | Security Misconfiguration | ✅ SVG bloqué, `X-Forwarded-For` corrigé, CSP frontend+backend |
| A06 | Vulnerable Components | ⚠️ Lancer `npm audit` régulièrement |
| A07 | Auth Failures | ✅ `mustChangePassword` serveur, brute-force DB, password policy 12 chars |
| A08 | Data Integrity | ✅ `@IsIn`, `@IsEnum` sur toutes les actions sensibles |
| A09 | Security Logging | ✅ Audit admin-only, login/logout/password tracés, pagination plafonnée |
| A10 | SSRF | ✅ SMB path validation, aucune URL utilisateur vers serveur |

---

## Ce qui est volontairement non implémenté

| ID | Raison |
|----|--------|
| SEC-05 | **JWT revocation** : nécessite Redis. Access tokens à durée courte (15 min). Rapport effort/risque défavorable pour système interne. |
| SEC-09 | **SameSite strict** : casse les liens email → app. `lax` suffisant en interne. |
| SEC-11 | **MaxLength signatureDataUrl** : validation globale 2MB déjà présente (suffisant). |
| SEC-15 | **Cookie `__Host-` prefix** : gain marginal sur domaine unique interne. |

---

## Règles non-négociables pour le développement futur

### 1. Tout endpoint `@Body()` doit utiliser un DTO validé
```typescript
// INTERDIT
@Body('message') message: string
// OBLIGATOIRE
@Body() dto: CreateXxxDto  // avec @IsString() @MaxLength(...)
```

### 2. Le header CSRF doit être présent sur tous les appels frontend
```typescript
// frontend/src/lib/api.ts — ne pas supprimer
headers: { 'X-Requested-With': 'XMLHttpRequest', ... }
```

### 3. Les réponses API users n'incluent jamais `passwordHash`
```typescript
// INTERDIT
prisma.user.findMany({ include: { filiale: true } })
// OBLIGATOIRE — utiliser safeSelect dans users.service.ts
prisma.user.findMany({ select: this.safeSelect })
```

### 4. Uploads : SVG interdit, rate limit 5/min obligatoire
```typescript
const allowedMime = /^image\/(jpeg|png|gif|webp)$/;
@Throttle({ default: { limit: 5, ttl: 60000 } })
```

### 5. Les cookies d'auth ont un path restreint
```typescript
// access_token  → path: '/api'
// refresh_token → path: '/api/auth/refresh'
```

### 6. Le SMB path est validé avant écriture
```typescript
if (!this.isSafeExportPath(smbPath)) return;
```

### 7. Les logs d'audit sont réservés à `@Roles('admin')`

### 8. La modification des templates email est réservée à `@Roles('admin')`

---

## Checklist post-déploiement

### Critique
- [ ] `backend/.env` absent du dépôt git (`git log --all -- backend/.env` → vide)
- [ ] `JWT_SECRET` défini dans Portainer avant déploiement
- [ ] Login avec `mustChangePassword=true` → API `403` sauf `/auth/change-password`

### Haute
- [ ] `POST /api/bons/:id/contestation` avec message > 2000 chars → `400`
- [ ] Upload SVG via `/api/filiales/:id/logo` → rejeté
- [ ] `GET /api/audit` avec compte technician → `403`
- [ ] `PATCH /api/admin/email-templates/:id` avec compte technician → `403`
- [ ] `POST /api/bons/:id/sign-it` sans header `X-Requested-With` → `403`
- [ ] SMB path `/etc` dans config → rejeté
- [ ] `POST /api/bons/:id/contestation` par collaborateur sur un bon d'autrui → `403`
- [ ] Filtre LDAP invalide (`(|(objectClass=*))`) → `400`

### Moyenne
- [ ] 11 `login_local_failed` en 30 min → verrouillage persisté après restart
- [ ] `GET /api/users` → aucun champ `passwordHash` dans la réponse
- [ ] Redirect `returnTo=//evil.com` → redirige vers `/` uniquement
- [ ] Upload logo 6 fois en 1 min → `429`
- [ ] `GET /api/audit?limit=999999` → retourne max 100 entrées
- [ ] 21 appels `POST /auth/refresh` en 1 min → `429`

### Infrastructure
- [ ] Header `Content-Security-Policy` présent sur toutes les réponses
- [ ] Container frontend tourne en user `nginx-app` (`docker exec <frontend> whoami`)
- [ ] `X-Forwarded-For` = IP réelle (non spoofable via nginx)
- [ ] `Strict-Transport-Security` présent sur les réponses HTTPS

---

## Troubleshooting sécurité

### Compte verrouillé
**Symptôme** : `403 — Compte temporairement verrouillé`
- Attendre 30 minutes (automatique, compteur en DB sur `AuditLog`)
- Ou redémarrer le backend **ne suffit plus** (brute-force persisté en DB depuis M-01)
- Pour déverrouiller manuellement : supprimer les `AuditLog` `login_local_failed` des 30 dernières minutes pour cet email

### Filtre LDAP rejeté
**Symptôme** : `400 — LDAP filter contains invalid characters`
- Valides : `(objectClass=person)`, `(&(objectClass=person)(cn=*))`, `(|(cn=*)(mail=*))`
- Interdits : caractères spéciaux non-échappés, injections type `(|(objectClass=*))`

### Monitoring à surveiller
- `login_local_failed` → tentatives brute force en cours
- `account_locked` → comptes verrouillés
- `ldap_validation_failed` → filtres LDAP rejetés
