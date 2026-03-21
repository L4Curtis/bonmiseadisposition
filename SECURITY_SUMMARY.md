# Résumé des Corrections de Sécurité — 2026-03-21

**Application** : Bons de mise à disposition — Groupe Livio
**Session** : Audit et hardening complet
**Commit** : `3cc3573`
**Status** : ✅ Tout implémenté et testé

---

## Vue d'ensemble

Une session complète d'audit de sécurité a identifié 17 vulnérabilités. **10 ont été corrigées**, 7 jugées non pertinentes ou hors scope pour un système interne.

### Résultat en une phrase
> **10 vulnerabilités corrigées** : IDOR, LDAP injection, IP spoofing, rate limiting, password policy, brute force, autorisation, CSP, HSTS, audit trail.

---

## Tableau récapitulatif

| Impact | ID | Correction | Fichier | Statut |
|--------|----|-----------|---------|---------
| 🔴 CRITIQUE | SEC-01 | IDOR on POST /bons/:id/contestation | bons.controller.ts | ✅ |
| 🔴 CRITIQUE | SEC-02 | LDAP Injection via user_filter | ldap.service.ts | ✅ |
| 🔴 CRITIQUE | SEC-03 | IP Spoofing (X-Forwarded-For) | nginx.conf + controllers | ✅ |
| 🟠 HAUTE | SEC-04 | Rate limit POST /auth/refresh | auth.controller.ts | ✅ |
| 🟠 HAUTE | SEC-06 | Password policy (12+ chars, spécial) | auth.service.ts | ✅ |
| 🟠 HAUTE | SEC-07 | Brute force (30 min lockout) | auth.service.ts | ✅ |
| 🟠 HAUTE | SEC-08 | Config admin restricted to admin role | admin.controller.ts | ✅ |
| 🟡 MOYENNE | SEC-10 | CSP headers (frame-ancestors, etc) | main.ts | ✅ |
| 🟢 BASSE | SEC-14 | HSTS header (1 year) | main.ts | ✅ |
| 🟢 BASSE | SEC-16 | Audit trail (login/logout/password) | auth.controller.ts | ✅ |

---

## Corrections critiques (3)

### SEC-01 — IDOR Contestation
**Risque** : Un collaborateur pouvait contester le bon d'un autre.
**Fix** : Ajout de `verifyCollaboratorAccess()` avant la création de contestation.
```typescript
// Vérifier que user.email === bon.collaborateur.email
await this.bonsService.verifyCollaboratorAccess(bonId, user.email);
```

### SEC-02 — LDAP Injection
**Risque** : Filtre LDAP configurable pouvait être injecté pour exfiltrer des données AD.
**Fix** : Validation syntaxique du filtre avant utilisation.
```typescript
// Valider : commence par ( et finit par ), pas de caractères spéciaux
private validateLdapFilter(filter: string): void { ... }
```

### SEC-03 — IP Spoofing
**Risque** : Header `X-Forwarded-For` forgeable faussait les logs d'audit d'IP.
**Fix** : nginx écrase X-Forwarded-For avec l'IP réelle du client.
```nginx
proxy_set_header X-Forwarded-For $remote_addr;
```

---

## Corrections hautes priorité (4)

### SEC-04 — Rate Limit Refresh Token
**Risque** : Aucune limite sur `/auth/refresh` → brute force 10k tokens/minute.
**Fix** : Throttle 20 req/min sur l'endpoint.
```typescript
@Throttle({ default: { limit: 20, ttl: 60000 } })
async refresh(...) { ... }
```

### SEC-06 — Password Policy
**Risque** : Politique faible (8 chars) + pas de caractère spécial + pas de max.
**Fix** : Min 12 chars, maj+min+spécial requis, max 128 (anti-DoS bcrypt).
```
✅ Min 12 caractères
✅ Min 1 majuscule
✅ Min 1 minuscule
✅ Min 1 caractère spécial
✅ Max 128 caractères
```

### SEC-07 — Brute Force Protection
**Risque** : Aucun verrouillage de compte après N tentatives échouées.
**Fix** : 10 tentatives échouées = verrouillage 30 minutes.
```typescript
if (attempts.count >= 10) {
  attempts.lockedUntil = Date.now() + 30 * 60 * 1000; // 30 min
}
```

### SEC-08 — Config Admin Restricted
**Risque** : Technicians pouvaient lire la structure config (tenant_id, clés API).
**Fix** : Catégories sensibles restreintes à admin uniquement.
```typescript
const adminOnlyCategories = ['entra', 'ldap', 'smtp', 'smb'];
```

---

## Corrections moyennes/basses (3)

### SEC-10 — CSP Renforcée
**Fix** : Ajout directives : `frame-ancestors 'none'`, `connect-src 'self'`, `font-src 'self'`.

### SEC-14 — HSTS
**Fix** : Header `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

### SEC-16 — Audit Trail
**Fix** : 4 nouveaux événements tracés : `login_local_success`, `login_local_failed`, `logout`, `password_changed`.

---

## Non implémenté (7)

| ID | Sévérité | Raison |
|----|----------|--------|
| SEC-05 | Haute | JWT revocation → nécessite Redis, tokens courts (15 min) |
| SEC-09 | Moyenne | SameSite strict → casserait flux email, `lax` suffisant |
| SEC-11 | Moyenne | MaxLength signatureDataUrl → validation globale 2MB existe |
| SEC-12 | Moyenne | Content-Disposition PDF → déjà présent |
| SEC-13 | Moyenne | Vérification signataire → déjà en `signature.service.ts` |
| SEC-15 | Basse | Cookie `__Host-` prefix → marginal sur domaine interne |
| SEC-17 | Basse | Validation MIME uploads → whitelist extension suffisante |

---

## Impact sur le code

**Fichiers modifiés** : 8
**Total lignes ajoutées** : ~179
**Nouvelles dépendances** : 0
**Migrations DB** : 0

```
backend/src/admin/admin.controller.ts        +10
backend/src/auth/auth.controller.ts          +41
backend/src/auth/auth.service.ts             +45
backend/src/bons/bons.controller.ts          +28
backend/src/ldap/ldap.service.ts             +33
backend/src/main.ts                          +8
backend/src/signature/signature.controller.ts +3
nginx/nginx.conf                             ±11
```

---

## Test & Validation

### Critères minimaux de validation

✅ LDAP filters rejetés si syntaxe invalide
✅ Collaborateur ne peut contester que ses bons
✅ `POST /auth/refresh` → 429 après 20 req/min
✅ Mot de passe rejeté si < 12 chars ou pas spécial
✅ Compte verrouillé 30 min après 10 échecs
✅ Technician ne peut pas lire entra/ldap/smtp/smb
✅ Headers CSP et HSTS présents
✅ Événements d'auth dans audit logs

---

## Déploiement

**Aucune action requise** :
- ❌ Pas de variable d'environnement nouvelle
- ❌ Pas de migration DB
- ❌ Pas de rebuild d'image Docker

**Procédure** :
```bash
docker pull ghcr.io/l4curtis/bonmiseadisposition-backend:latest
docker compose -f docker-compose.prod.yml up -d
```

---

## Documentation complète

Pour les détails exhaustifs, détails d'implémentation, code snippets et checklist post-déploiement :

👉 **[docs/phase6-security.md](docs/phase6-security.md)**

---

## Contacts & Support

**Questions sur la sécurité** ?
- Consultez `/docs/phase6-security.md`
- Vérifiez `/backend/src/auth/auth.service.ts` (brute force, password policy)
- Vérifiez `/backend/src/ldap/ldap.service.ts` (validation filtre)
- Vérifiez `/nginx/nginx.conf` (headers, rate limiting)

---

**Dernière mise à jour** : 2026-03-21
**Commit** : `3cc3573`
