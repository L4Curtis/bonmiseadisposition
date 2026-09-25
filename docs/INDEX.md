# Documentation

La documentation est rangée par lecteur, avec une seule source par sujet :

- **Utilisateurs** (techniciens, administrateurs, direction) : la
  [documentation Outline](https://docs.peduzzi.local/doc/bons-de-mise-a-disposition-dl5FheIogB), qui décrit ce
  que l'on voit à l'écran.
- **Développeurs** et **exploitants** : ce dépôt.
- **Historique** des changements : le [journal des modifications](../CHANGELOG.md), seul endroit où l'on
  écrit « nouveau » ou « auparavant ».

## Développeur

| Document | Contenu |
|---|---|
| [README](../README.md) | Ce qu'est l'application, démarrage rapide d'un poste de développement, outils de la base de dev |
| [Architecture](architecture.md) | Vue d'ensemble, vocabulaire, modules du backend, structure du frontend, rôles et droits, cycle de vie d'un bon, carte des routes d'API, pièges connus |
| [Conventions du frontend](frontend-guide.md) | Appels d'API, listes, dates, libellés, formulaires, accessibilité, mobile |
| [Tests](testing-guide.md) | Tests unitaires backend et frontend, base réelle, contrat HTTP, bout en bout |
| [Guide du testeur](../e2e/recette/GUIDE-TESTEUR.md) | Banc de recette jetable (`bmad-recette`) : démarrage, comptes par rôle, jeu de données, gabarit Playwright, format du rapport |
| [Sécurité](security.md) | Règles à respecter dans le code, points de contrôle après déploiement |
| [Journal des modifications](../CHANGELOG.md) | Ce qui a changé, lot par lot |

## Exploitant

| Document | Contenu |
|---|---|
| [deploy/README.md](../deploy/README.md) | Seul mode d'emploi d'exploitation : installation sur deux machines, reverse proxy et adresse IP des signataires, premier accès, LDAPS, sauvegarde et restauration, mise à jour et retour arrière, deuxième instance, dépannage, installation tout-en-un en annexe |
| [Sécurité](security.md) | Points de contrôle après déploiement |
| [Documentation Outline](https://docs.peduzzi.local/doc/bons-de-mise-a-disposition-dl5FheIogB) | Infrastructure réelle, configuration de l'application, exploitation au quotidien |

## Par question

| Question | Où chercher |
|---|---|
| Comment démarrer sur un nouveau poste ? | [README](../README.md#démarrage-rapide-développeur) |
| Quels modules, quelles données ? | [Architecture, § 3](architecture.md#3-backend) |
| Qui a le droit de faire quoi ? | [Architecture, § 5](architecture.md#5-rôles-et-droits) ; route par route : [`route-access.md`](../backend/src/auth/__tests__/__snapshots__/route-access.md), tenu à jour par un test ; règles : [Sécurité](security.md) |
| Comment un bon passe-t-il d'un statut à l'autre ? | [Architecture, § 6](architecture.md#6-cycle-de-vie-dun-bon) |
| Quelle route, pour quels rôles ? | [Architecture, § 7](architecture.md#7-carte-des-routes-dapi) |
| Quels pièges éviter (SQL, fuseau horaire, migrations) ? | [Architecture, § 8](architecture.md#8-pièges-connus-et-conventions) |
| Quel mot employer à l'écran ? | [Architecture, § 2](architecture.md#2-vocabulaire) |
| Comment écrire et lancer un test ? | [Tests](testing-guide.md) |
| Comment tester l'application comme un utilisateur ? | [Guide du testeur](../e2e/recette/GUIDE-TESTEUR.md) |
| Quelles règles de sécurité ? | [Sécurité](security.md) |
| Comment installer l'application ? | [deploy/README.md](../deploy/README.md) |
| Comment mettre à jour, publier une version, revenir en arrière ? | [deploy/README.md, § 8](../deploy/README.md#8-mettre-à-jour-publier-une-version-revenir-en-arrière) |
| Comment sauvegarder et restaurer ? | [deploy/README.md, § 7](../deploy/README.md#7-sauvegarde-et-restauration) |
| D'où vient l'adresse IP enregistrée sur une signature ? | [deploy/README.md, § 4](../deploy/README.md#4-reverse-proxy-nginx-proxy-manager) et [Architecture, § 1](architecture.md#1-vue-densemble) |
| Comment configurer l'annuaire, Entra ID, le SMTP ? | [Documentation Outline](https://docs.peduzzi.local/doc/bons-de-mise-a-disposition-dl5FheIogB), et [deploy/README.md, § 6](../deploy/README.md#6-ldaps) pour LDAPS |
| Qu'est-ce qui a changé récemment ? | [Journal des modifications](../CHANGELOG.md) |
| Pourquoi ce choix ancien ? | [Archive](archive/README.md) : documents de chantier de mars à juin 2026 |
