# Documentation — Index Complet

> Navigation rapide vers tous les documents du projet.

---

## Phase par Phase

### Phase 1 — Fondations
**[phase1.md](phase1.md)**
- NestJS + TypeScript backend (JWT, Passport)
- Prisma ORM + PostgreSQL 16
- React 18 + Vite frontend
- Docker dev setup
- Auth locale + guards NestJS

### Phase 2 — Administration
**[phase2.md](phase2.md)**
- LDAP sync (cron 6h)
- Catalogue d'équipements (11 catégories)
- Filiales (logos, cachets)
- Configuration UI (LDAP, Entra, SMTP, SMB)
- Upload fichiers (Multer 5MB)

### Phase 3 — Cœur métier
**[phase3.md](phase3.md)**
- Bons de mise à disposition (workflow)
- Signatures électroniques (canvas HTML5)
- Génération PDF (Puppeteer)
- Notifications email (SMTP, cron rappels)
- Portail collaborateur

### Phase 4 — Tableau de bord & Audit
**[phase4.md](phase4.md)**
- Dashboard IT (KPIs, activité récente)
- Export CSV (compatible Excel FR)
- Journal d'audit (paginé, filtrable)
- Statistiques par filiale

### Phase 5 — Contestations & Déploiement
**[phase5.md](phase5.md)**
- Rate limiting (@nestjs/throttler)
- Module Contestations (workflow open → in_review → resolved/rejected)
- Renvoi manuel de liens de signature
- Docker Compose production (Nginx reverse proxy TLS)
- Déploiement via Portainer

### Phase 6 — Sécurité & Hardening
**[phase6-security.md](phase6-security.md)** ⭐ NOUVEAU
- 10 vulnérabilités critiques/haute corrigées (2026-03-21)
- IDOR, LDAP injection, IP spoofing, rate limit, password policy, brute force, auth audit trail
- CSP + HSTS headers
- Détails complets d'implémentation + checklist de test

### Phase 6 (alternative) — Switcher de vue utilisateur
**[phase6.md](phase6.md)**
- Switcher de vue utilisateur (style GLPI)
- UiViewContext pour filtrer la navigation selon le rôle
- Persistance localStorage par utilisateur

---

## Résumés & Références rapides

### Résumé sécurité
**[../SECURITY_SUMMARY.md](../SECURITY_SUMMARY.md)** ⭐ NOUVEAU
- Vue d'ensemble : 10 corrections en une page
- Tableau récapitulatif des risques/fixes
- Critères de validation minimaux
- Lien vers documentation complète

### Contexte complet
**[../AGENDA.md](../AGENDA.md)**
- Tout ce qu'il faut savoir pour reprendre le développement
- Stack technique
- 15 modules NestJS
- 13 modèles Prisma
- 14 pages frontend
- Points critiques de sécurité
- Décisions techniques
- Endpoints API référence rapide
- Déploiement
- Fichiers clés
- Pièges connus

### Architecture projet
**[../PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md)**
- Arborescence complète de fichiers
- Détail de chaque dossier (backend, frontend, nginx, docker)
- Modèles Prisma avec énums
- API endpoints par module
- Sidebar navigation
- Routing frontend
- Workflow métier
- Infrastructure Docker
- Sécurité (résumé)
- Variables d'environnement
- Dépendances principales

### README principal
**[../README.md](../README.md)**
- CI/CD GitHub Actions
- Déploiement Portainer
- Variables d'environnement
- Développement local

---

## Plan d'accès rapide

### Je veux comprendre...

| Question | Document |
|----------|----------|
| **Quels sont les risques de sécurité corrigés ?** | [SECURITY_SUMMARY.md](../SECURITY_SUMMARY.md) |
| **Comment fonctionne le hardening en détail ?** | [phase6-security.md](phase6-security.md) |
| **Qu'est-ce qu'il y a dans ce projet ?** | [AGENDA.md](../AGENDA.md) (section 1-4) |
| **Comment déployer en production ?** | [phase5.md](phase5.md) (section 6) |
| **Quels sont les endpoints API ?** | [AGENDA.md](../AGENDA.md) (section 8) ou [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) (section "API Backend") |
| **Comment fonctionne le workflow des bons ?** | [phase3.md](phase3.md) (section 1) |
| **Quelle est la structure de fichiers ?** | [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) |
| **Comment configurer LDAP/SMTP/Entra ?** | [phase2.md](phase2.md) ou [AGENDA.md](../AGENDA.md) (section 1) |
| **Quels sont les pièges à éviter ?** | [AGENDA.md](../AGENDA.md) (section 11) |
| **Comment développer localement ?** | [README.md](../README.md) (section "Développement local") |

---

## Checklist par rôle

### Pour l'administrateur système (déploiement)
- [ ] Lire [README.md](../README.md) — CI/CD & déploiement Portainer
- [ ] Lire [phase5.md](phase5.md) — Configuration Docker production
- [ ] Vérifier [phase6-security.md](phase6-security.md) — Checklist post-déploiement
- [ ] Consulter [AGENDA.md](../AGENDA.md) — Section 9 pour déboguer

### Pour l'architecte système
- [ ] Lire [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) — Architecture complète
- [ ] Lire [AGENDA.md](../AGENDA.md) — Stack et décisions techniques
- [ ] Lire [phase6-security.md](phase6-security.md) — Hardening & justification
- [ ] Consulter les phases 1-5 selon les domaines (auth, workflow, etc.)

### Pour le développeur backend
- [ ] Lire [AGENDA.md](../AGENDA.md) — Modules NestJS, modèles Prisma, endpoints
- [ ] Phase spécifique : [phase1.md](phase1.md) (auth), [phase2.md](phase2.md) (config), [phase3.md](phase3.md) (bons), [phase4.md](phase4.md) (audit), [phase5.md](phase5.md) (contestations)
- [ ] Lire [phase6-security.md](phase6-security.md) — Corrections de sécurité impactant le code

### Pour le développeur frontend
- [ ] Lire [AGENDA.md](../AGENDA.md) — Pages React, routing, types
- [ ] Phase spécifique : [phase1.md](phase1.md) (setup), [phase3.md](phase3.md) (pages), [phase4.md](phase4.md) (dashboard)
- [ ] Lire [phase6.md](phase6.md) — Switcher de vue utilisateur (UX)

### Pour le testeur/QA
- [ ] Lire [SECURITY_SUMMARY.md](../SECURITY_SUMMARY.md) — Critères de validation sécurité
- [ ] Lire [phase6-security.md](phase6-security.md) — Section "Validation & Test" (scénarios détaillés)
- [ ] Lire [AGENDA.md](../AGENDA.md) — Section 11 (pièges connus)
- [ ] Consulter la phase spécifique du feature testé

---

## Chronologie des versions

| Version | Date | Focus | Commit |
|---------|------|-------|--------|
| Phase 1 | Q1 2026 | Fondations NestJS/React/Docker | — |
| Phase 2 | Q1 2026 | Admin LDAP/catalogue/config | — |
| Phase 3 | Q1 2026 | Bons/signatures/PDF/emails | — |
| Phase 4 | Q1 2026 | Dashboard/audit/export | — |
| Phase 5 | Q1 2026 | Contestations/deploiement prod | — |
| Phase 6A | 2026-03-20 | Switcher vue utilisateur (UX) | `34ce9d4` |
| Phase 6B | 2026-03-21 | Hardening sécurité (10 fixes) | `3cc3573` |
| Docs | 2026-03-21 | Documentation phase 6 sécurité | `a3689d8` |

---

## Ressources externes

### Sécurité
- [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)
- [CWE-639: LDAP Injection](https://cwe.mitre.org/data/definitions/639.html)
- [CSP Guide MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [bcrypt Security OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)

### Frameworks
- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma ORM](https://www.prisma.io/docs/)
- [React 18](https://react.dev/)
- [shadcn/ui](https://ui.shadcn.com/)

### DevOps
- [Docker Documentation](https://docs.docker.com/)
- [Nginx Configuration](https://nginx.org/en/docs/)
- [PostgreSQL 16](https://www.postgresql.org/docs/16/)

---

## Mise à jour de la documentation

Cette documentation est **générée à partir du code source** et mise à jour régulièrement.

**Dernière mise à jour** : 2026-03-21
**Commit** : `a3689d8` (documentation phase 6 sécurité)

Pour signaler une incohérence ou une omission :
1. Vérifier le code source (source de vérité)
2. Signaler via issue ou commit correction
3. Mettre à jour la documentation correspondante

---

**Bonne lecture !** 📚
