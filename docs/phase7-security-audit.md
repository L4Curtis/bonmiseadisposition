# Phase 7 — Audit de Sécurité Complet (2026-03-21)

> **Statut** : Toutes les corrections implémentées.
> **Date** : 2026-03-21
> **Scope** : Audit OWASP Top 10 complet — 29 vulnérabilités analysées, 22 corrigées.

---

## Résumé des corrections

| ID | Sévérité | Correction | Fichier(s) |
|----|----------|------------|-----------|
| C-01 | 🔴 Critical | `.gitignore` couvre maintenant `**/.env` et `backend/.env` | `.gitignore` |
| C-02 | 🔴 Critical | `JWT_SECRET` ajouté dans `docker-compose.prod.yml` | `docker-compose.prod.yml` |
| C-03 | 🔴 Critical | `mustChangePassword` enforced server-side dans `JwtAuthGuard` | `jwt-auth.guard.ts` |
| H-01 | 🟠 High | `CreateContestationDto` avec `@MaxLength(2000)` | `bons/dto/actions.dto.ts` |
| H-02 | 🟠 High | DTOs validés pour toutes les actions bons (`@IsUUID`, `@Matches`, etc.) | `bons/dto/actions.dto.ts` |
| H-03 | 🟠 High | SVG retiré des uploads ; anciens SVGs servis en `Content-Disposition: attachment` | `filiales.module.ts`, `filiales.controller.ts` |
| H-04 | 🟠 High | Audit logs restreints à `@Roles('admin')` uniquement | `audit.controller.ts` |
| H-05 | 🟠 High | Templates PATCH/DELETE/POST restreints à `@Roles('admin')` | `templates.controller.ts` |
| H-06 | 🟠 High | CSRF middleware `X-Requested-With` sur tous les POST/PUT/PATCH/DELETE | `main.ts`, `api.ts`, `Filiales.tsx` |
| H-07 | 🟠 High | SMB path validation `isSafeExportPath()` (bloque `/etc`, `/proc`, etc.) | `smb.service.ts` |
| M-01 | 🟡 Medium | Brute-force persisté en DB via `AuditLog` (survit aux redémarrages) | `auth.service.ts` |
| M-02 | 🟡 Medium | `passwordHash` exclu de toutes les réponses API users (`safeSelect`) | `users.service.ts` |
| M-03 | 🟡 Medium | Open redirect renforcé `/^\/[^/]/` (bloque `//evil.com`) | `auth.controller.ts` |
| M-04 | 🟡 Medium | Rate limit 5/min sur upload logo/stamp | `filiales.controller.ts` |
| M-07 | 🟡 Medium | `X-Forwarded-For: $remote_addr` dans nginx frontend (plus spoofable) | `frontend/nginx.conf` |
| M-08 | 🟡 Medium | Pagination audit logs plafonnée à 100 entrées max | `audit.controller.ts`, `audit.service.ts` |
| M-09 | 🟡 Medium | `ResolveContestationDto` avec `@IsIn(['resolved', 'rejected'])` | `contestation.controller.ts` |
| L-01 | 🟢 Low | Cookie `access_token` restreint à `path: '/api'` (scope minimal) | `auth.service.ts`, `auth.controller.ts` |
| L-02 | 🟢 Low | CSP header complet dans `frontend/nginx.conf` | `frontend/nginx.conf` |
| L-03 | 🟢 Low | Dockerfile frontend : `USER nginx-app` (non-root, port 8080) | `frontend/Dockerfile` |
| L-04 | 🟢 Low | Docker-compose mis à jour pour le port 8080 | `docker-compose.yml`, `docker-compose.prod.yml` |

---

## Détail des corrections critiques

### C-03 — `mustChangePassword` enforcement serveur

**Problème** : La redirection vers `/change-password` était gérée uniquement côté frontend. Un appel API direct ignorait l'obligation de changer de mot de passe.

**Correction** :
```typescript
// auth/guards/jwt-auth.guard.ts
const MUST_CHANGE_EXEMPTIONS = [
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/auth/refresh',
];

handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
  if (err || !user) throw err || new UnauthorizedException('Authentication required');
  if (user.mustChangePassword) {
    const request = context.switchToHttp().getRequest();
    const isExempted = MUST_CHANGE_EXEMPTIONS.some((p) => request.path.startsWith(p));
    if (!isExempted) {
      throw new ForbiddenException('Vous devez changer votre mot de passe avant de continuer');
    }
  }
  return user;
}
```

**Résultat** : Toute requête API (sauf les 4 routes exemptées) retourne `403` tant que `mustChangePassword === true`.

---

### H-06 — Protection CSRF

**Problème** : Pas de mécanisme CSRF côté serveur. `sameSite: lax` insuffisant contre les attaques depuis un sous-domaine.

**Correction backend** (`main.ts`) :
```typescript
function csrfMiddleware(req, res, next) {
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!stateChangingMethods.includes(req.method)) return next();
  if (CSRF_EXEMPT_PATHS.some((p) => req.path.startsWith(p))) return next();
  const requestedWith = req.headers['x-requested-with'];
  if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
    return res.status(403).json({ message: 'CSRF protection: header X-Requested-With manquant' });
  }
  return next();
}
```

**Correction frontend** (`api.ts`) :
```typescript
const CSRF_HEADER = { 'X-Requested-With': 'XMLHttpRequest' };
// Ajouté à tous les appels fetch (api.get/post/put/patch/delete + refresh + uploads)
```

**Routes exemptées** (pas de cookie auth actif) :
- `POST /api/auth/callback` (OAuth — protégé par le paramètre `state`)
- `POST /api/auth/local-login` (login initial — aucun cookie)

---

### M-01 — Brute-force persisté en DB

**Problème** : Le tracking des tentatives échouées était in-memory (`Map`). Un redémarrage du backend réinitialisait les compteurs.

**Ancienne implémentation** :
```typescript
// In-memory, perdu au redémarrage
private readonly loginAttempts = new Map<string, { count: number; lockedUntil?: Date }>();
```

**Nouvelle implémentation** :
```typescript
// Utilise AuditLog (déjà rempli par le controller)
private async checkBruteForce(email: string): Promise<void> {
  const windowStart = new Date(Date.now() - 30 * 60 * 1000);
  const recentFailures = await this.prisma.auditLog.count({
    where: {
      userEmail: email,
      action: 'login_local_failed',
      createdAt: { gte: windowStart },
    },
  });
  if (recentFailures >= 10) {
    throw new UnauthorizedException('Compte temporairement verrouillé...');
  }
}
```

**Avantages** :
- Survit aux redémarrages
- Visible dans les logs d'audit
- Aucun nouveau schéma DB requis

---

### H-02 — DTOs validés pour actions bons

**Fichier** : `backend/src/bons/dto/actions.dto.ts` (nouveau)

```typescript
export class CreateContestationDto {
  @IsString() @MinLength(1) @MaxLength(2000) message!: string;
}

export class InitiateRestitutionDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) returnedEquipmentIds?: string[];
}

export class InitiateInPersonDto {
  @IsEnum(['mise_disposition', 'restitution']) type!: 'mise_disposition' | 'restitution';
}

export class DeclareNotReturnedDto {
  @IsArray() @IsUUID('4', { each: true }) equipmentIds!: string[];
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
  @IsOptional() @Matches(/^data:image\//) @MaxLength(2_000_000) signatureDataUrl?: string;
}

export class MarkFoundDto {
  @IsArray() @IsUUID('4', { each: true }) equipmentIds!: string[];
  @IsOptional() @Matches(/^data:image\//) @MaxLength(2_000_000) signatureDataUrl?: string;
}
```

---

## Infrastructure

### Dockerfile frontend — non-root

```dockerfile
FROM nginx:alpine AS production
RUN addgroup -g 1001 -S nginx-app && adduser -S nginx-app -u 1001 -G nginx-app \
  && touch /var/run/nginx.pid \
  && chown -R nginx-app:nginx-app /var/run/nginx.pid /var/cache/nginx /var/log/nginx
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx-app        # ← ajouté
EXPOSE 8080           # ← port non-root
CMD ["nginx", "-g", "daemon off;"]
```

**Impact** : Docker-compose mis à jour (`3000:8080`, `5147:8080`).

### CSP frontend nginx

```nginx
add_header Content-Security-Policy
  "default-src 'self';
   script-src 'self' 'unsafe-inline';
   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
   img-src 'self' data: blob:;
   font-src 'self' https://fonts.gstatic.com;
   connect-src 'self';
   frame-ancestors 'none';
   form-action 'self';" always;
```

---

## OWASP Top 10 — Statut post-audit

| # | Catégorie | Statut |
|---|-----------|--------|
| A01 | Broken Access Control | ✅ `mustChangePassword` enforced serveur, audit admin-only, templates admin-only |
| A02 | Cryptographic Failures | ✅ JWT_SECRET dans prod compose, cookie path restreint |
| A03 | Injection | ✅ DTOs validés (`@IsUUID`, `@IsIn`, `@MaxLength`), LDAP déjà protégé |
| A04 | Insecure Design | ✅ Brute-force persisté, CSRF middleware |
| A05 | Security Misconfiguration | ✅ SVG bloqué, `X-Forwarded-For` corrigé, CSP frontend |
| A06 | Vulnerable Components | ⚠️ `npm audit` à lancer régulièrement |
| A07 | Identification & Auth Failures | ✅ `mustChangePassword` serveur, brute-force DB-persisté |
| A08 | Software & Data Integrity | ✅ `@IsIn`, `@IsEnum` sur toutes les actions |
| A09 | Security Logging & Monitoring | ✅ Audit admin-only, pagination plafonnée |
| A10 | SSRF | ✅ SMB path validation, aucune URL utilisateur vers serveur |

---

## Règles de sécurité à respecter (non-négociables)

> Ces règles découlent des vulnérabilités corrigées. Tout développement futur DOIT les respecter.

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

### 4. Uploads : SVG est interdit, rate limit 5/min obligatoire
```typescript
// filiales.module.ts — ne pas ajouter svg+xml
const allowedMime = /^image\/(jpeg|png|gif|webp)$/;
// filiales.controller.ts — toujours présent
@Throttle({ default: { limit: 5, ttl: 60000 } })
```

### 5. Les cookies d'auth ont un path restreint
```typescript
// access_token → path: '/api'
// refresh_token → path: '/api/auth/refresh'
// Ne pas changer ces paths sans vérifier les impacts
```

### 6. Le SMB path est validé avant écriture
```typescript
// smb.service.ts — isSafeExportPath() doit être appelé avant toute opération
if (!this.isSafeExportPath(smbPath)) return;
```

### 7. Les logs d'audit sont réservés à `@Roles('admin')`
```typescript
// audit.controller.ts — ne pas ajouter 'technician'
@Roles('admin')
```

### 8. La modification des templates email est réservée à `@Roles('admin')`
```typescript
// templates.controller.ts — PATCH/DELETE/POST import
@Roles('admin')
```

---

## Checklist de validation post-déploiement

### Critical
- [ ] `backend/.env` absent du dépôt git (`git status` + `git log --all -- backend/.env`)
- [ ] `JWT_SECRET` défini dans Portainer/stack avant déploiement
- [ ] Login avec `mustChangePassword=true` → API retourne `403` sauf `/auth/change-password`

### High
- [ ] `POST /api/bons/:id/contestation` avec message > 2000 chars → `400`
- [ ] Upload SVG via `/api/filiales/:id/logo` → rejeté par Multer
- [ ] `GET /api/audit` avec compte technician → `403`
- [ ] `PATCH /api/admin/email-templates/:id` avec compte technician → `403`
- [ ] `POST /api/bons/:id/sign-it` sans header `X-Requested-With` → `403`
- [ ] SMB path `/etc` dans config → rejeté avec log d'erreur

### Medium
- [ ] 11 `login_local_failed` en 30 min → `401` verrouillage (persisté après restart)
- [ ] `GET /api/users` → réponse sans champ `passwordHash`
- [ ] Redirect `returnTo=//evil.com` → redirige vers `/` uniquement
- [ ] Upload logo 6 fois en 1 min → `429`
- [ ] `GET /api/audit?limit=999999` → retourne max 100 entrées

### Infrastructure
- [ ] `curl -i http://frontend/` → header `Content-Security-Policy` présent
- [ ] `docker ps` → container frontend tourne en user `nginx-app` (non-root)
- [ ] Nginx frontend : `X-Forwarded-For` = IP réelle (pas spoofable)

---

## Fichiers modifiés

```
.gitignore                                         (+2 lignes)
docker-compose.prod.yml                            (+2 lignes)
docker-compose.yml                                 (+1 ligne)
backend/src/auth/guards/jwt-auth.guard.ts          (+14 lignes)
backend/src/auth/auth.service.ts                   (brute-force refactorisé)
backend/src/auth/auth.controller.ts                (+returnTo fix, +cookie path)
backend/src/bons/bons.controller.ts                (DTOs utilisés)
backend/src/bons/dto/actions.dto.ts                NEW (+60 lignes)
backend/src/contestation/contestation.controller.ts (+ResolveContestationDto)
backend/src/contestation/dto/resolve-contestation.dto.ts  NEW (+12 lignes)
backend/src/audit/audit.controller.ts              (admin-only, cap limit)
backend/src/audit/audit.service.ts                 (cap Math.min)
backend/src/admin/email-templates.controller.ts          (write ops admin-only)
backend/src/filiales/filiales.module.ts            (SVG retiré)
backend/src/filiales/filiales.controller.ts        (Throttle, Content-Disposition)
backend/src/smb/smb.service.ts                     (+isSafeExportPath)
backend/src/users/users.service.ts                 (+safeSelect)
backend/src/main.ts                                (+csrfMiddleware)
frontend/src/lib/api.ts                            (+CSRF_HEADER)
frontend/src/pages/admin/Filiales.tsx              (+X-Requested-With upload)
frontend/nginx.conf                                (+CSP, port 8080, X-Forwarded-For)
frontend/Dockerfile                                (+USER nginx-app, port 8080)
```

---

## Déploiement

### Variables d'environnement requises (nouveauté)

```bash
# Obligatoire depuis cette phase (était absent du docker-compose.prod.yml)
JWT_SECRET=<openssl rand -hex 32>
```

### Commandes

```bash
# Vérifier qu'aucun .env n'est tracké
git log --all -- backend/.env
# → doit être vide

# Déployer
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d

# Vérifier que le frontend tourne non-root
docker exec -it <frontend_container> whoami
# → nginx-app
```

---

**Référence** : [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)
