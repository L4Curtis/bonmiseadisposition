# Documentation — Index

> Navigation vers tous les documents du projet.

---

## Phases de développement

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
- Génération PDF (PDFKit)
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

### Phase 6A — Switcher de vue utilisateur
**[phase6.md](phase6.md)**
- Switcher de vue utilisateur (style GLPI)
- UiViewContext pour filtrer la navigation selon le rôle
- Persistance localStorage par utilisateur

### Phase 6B — Sécurité & Hardening
**[security.md](security.md)** ⭐
- 32 vulnérabilités corrigées (hardening initial + audit OWASP complet)
- IDOR, LDAP injection, IP spoofing, rate limit, password policy, brute force, CSRF
- CSP + HSTS headers, non-root Docker, brute-force persisté en DB
- Règles non-négociables pour le développement futur
- Checklist post-déploiement complète

### Phase 7 — Qualité & Tests
- TypeScript strict mode activé sur tout le backend
- 226 tests backend (unitaires + intégration)
- Couverture > 80% backend

### Phase 8 — Templates PDF personnalisables
- 4 templates PDF personnalisables (mise à disposition, restitution, clôture, avenant)
- Config JSON structurée (couleurs, polices, marges, textes, visibilité sections)
- Preview PDF en temps réel dans l'admin
- Validation stricte (class-validator nested DTOs)
- Page admin : `/admin/pdf-templates`

### Mise à jour pré-production (2026-09-16)
**[../CHANGELOG.md](../CHANGELOG.md)**
- Corrections sécurité, workflow des bons, signature/portail, emails, PDF et données
- Nouvelles fonctionnalités : vue Inventaire du parc prêté, rappel avant restitution prévue
- Détail complet des corrections par domaine dans le changelog

---

## Références opérationnelles

### Sauvegarde & reprise d'activité ⭐ CRITIQUE
**[SAUVEGARDE-REPRISE.md](SAUVEGARDE-REPRISE.md)**
- Les 3 éléments indissociables : base PostgreSQL + volume `data/` + `ENCRYPTION_KEY`
- Scripts `scripts/backup.sh` / `scripts/restore.sh` (dump + archive + manifeste SHA-256)
- Séquestre de la clé, planification cron, RPO/RTO
- Canari `ENCRYPTION_KEY` au démarrage (fail-fast si la clé a changé)

### Architecture & décisions techniques
**[../AGENDA.md](../AGENDA.md)**
- Stack technique complète
- 15 modules NestJS, 13 modèles Prisma, 14 pages frontend
- Endpoints API référence rapide
- Décisions techniques et pièges connus

### Structure détaillée
**[../PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md)**
- Arborescence complète de fichiers
- Modèles Prisma avec énums
- API endpoints par module
- Routing frontend et workflow métier
- Infrastructure Docker et variables d'environnement

### Guide de tests
**[testing-guide.md](testing-guide.md)**
- Stratégie de test (unitaire, intégration, E2E)
- Patterns Jest/NestJS, fixtures, mocks
- Objectifs de couverture, priorités par service

### Conformité légale (document de travail, non implémenté)
**[phase-legal-compliance.md](phase-legal-compliance.md)** ⚠️
- Décrit des fonctionnalités **non présentes dans le code actuel** (conditions générales
  versionnées, photos d'équipements, valeur estimée, police d'assurance) : à considérer comme
  une proposition, pas comme une référence de l'existant. Le service de rétention/anonymisation
  qu'il mentionne, lui, est bien implémenté — voir [security.md](security.md).

### README principal
**[../README.md](../README.md)**
- CI/CD GitHub Actions
- Déploiement Portainer (étape par étape)
- Variables d'environnement obligatoires
- Développement local

---

## Accès rapide par question

| Question | Document |
|----------|----------|
| **Comment déployer en production ?** | [README.md](../README.md) + [phase5.md](phase5.md) |
| **Comment sauvegarder / restaurer ?** | [SAUVEGARDE-REPRISE.md](SAUVEGARDE-REPRISE.md) |
| **Quelles sont les règles de sécurité ?** | [security.md](security.md) |
| **Comment fonctionne le workflow des bons ?** | [phase3.md](phase3.md) |
| **Quels sont les endpoints API ?** | [AGENDA.md](../AGENDA.md) (section 8) |
| **Comment configurer LDAP/SMTP/Entra ?** | [phase2.md](phase2.md) + [AGENDA.md](../AGENDA.md) |
| **Quelle est la structure de fichiers ?** | [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) |
| **Comment personnaliser les PDFs ?** | [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) (section "Système de templates PDF") |
| **Quels sont les pièges à éviter ?** | [AGENDA.md](../AGENDA.md) (section 11) |
| **Comment développer localement ?** | [README.md](../README.md) (section "Développement local") |
| **Quelles sont les nouveautés de la dernière mise à jour ?** | [../CHANGELOG.md](../CHANGELOG.md) |

---

## Checklist par rôle

### Administrateur système (déploiement)
- [ ] [README.md](../README.md) — déploiement Portainer, variables d'environnement
- [ ] [phase5.md](phase5.md) — configuration Docker production
- [ ] [SAUVEGARDE-REPRISE.md](SAUVEGARDE-REPRISE.md) — **mettre en place les sauvegardes + séquestrer `ENCRYPTION_KEY`**
- [ ] [security.md](security.md) — checklist post-déploiement

### Développeur backend
- [ ] [AGENDA.md](../AGENDA.md) — modules NestJS, modèles Prisma, endpoints, pièges
- [ ] [security.md](security.md) — règles non-négociables de développement
- [ ] Phases spécifiques selon le domaine

### Développeur frontend
- [ ] [AGENDA.md](../AGENDA.md) — pages React, routing, types
- [ ] [phase6.md](phase6.md) — switcher de vue utilisateur (UX)

### Architecte / lead tech
- [ ] [PROJECT_STRUCTURE.md](../PROJECT_STRUCTURE.md) — architecture complète
- [ ] [AGENDA.md](../AGENDA.md) — stack et décisions techniques
- [ ] [security.md](security.md) — hardening et justifications

---

## Chronologie

| Version | Date | Focus |
|---------|------|-------|
| Phase 1–4 | Q1 2026 | Fondations, admin, bons, dashboard |
| Phase 5 | Q1 2026 | Contestations, déploiement prod |
| Phase 6A | 2026-03-20 | Switcher vue utilisateur |
| Phase 6B | 2026-03-21 | Hardening sécurité (10 fixes) |
| Phase 7 | 2026-03-21 | Audit OWASP + 22 fixes supplémentaires, TypeScript strict, 226 tests |
| Phase 8 | 2026-03-25 | Templates PDF personnalisables |
| Corrections | 2026-06 | Fixes catalogue, email, notifications |
| Mise à jour pré-production | 2026-09-16 | Sécurité, workflow des bons, signature/portail, emails, PDF, données, inventaire, rappel de restitution — voir [CHANGELOG.md](../CHANGELOG.md) |

---

**Dernière mise à jour** : 2026-09-16
