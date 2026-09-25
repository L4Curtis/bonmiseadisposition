# Archive

Documents de chantier écrits pendant le développement, entre mars et juin 2026. Ils **ne décrivent pas
l'application actuelle** : les écrans, les routes, les chiffres et parfois les choix techniques ont changé
depuis. La documentation à jour est dans [docs/INDEX.md](../INDEX.md).

## Pourquoi les garder

Ils expliquent d'où viennent certains choix que le code seul ne justifie pas. Avant de « simplifier » un de
ces points, relisez le document d'origine :

- la signature dessinée dans un canevas HTML natif plutôt qu'avec une bibliothèque ([phase 3](phase3.md)) ;
- les PDF figés en base plutôt que sur disque, et la configuration chiffrée en base plutôt que dans des
  variables d'environnement ([plan initial](projet_bon_de_mise_a_disposition.md), [phase 3](phase3.md)) ;
- les protections de la [phase 5](phase5.md) (limitation de débit, contestations) et la
  [revue de code de juin](CODE_REVIEW_2026-06-11.md), dont les constats ont façonné les contrôles d'accès
  et les transitions de statut ;
- la [proposition de conformité légale](phase-legal-compliance.md) : champs, photos d'équipement et écrans
  envisagés en mars. Seule la rétention des données a été réalisée. Le reste sert de point de départ si le
  sujet revient, en particulier pour les photos d'équipement.

L'historique git les conserverait aussi, mais un dossier se lit plus facilement qu'un ancien commit.

## Contenu

| Document | Date | Ce qu'il contient |
|---|---|---|
| [projet_bon_de_mise_a_disposition.md](projet_bon_de_mise_a_disposition.md) | mars 2026 | Plan de développement initial : besoin, périmètre, choix techniques, planning |
| [phase1.md](phase1.md) | mars 2026 | Fondations : NestJS, Prisma, React, Docker, authentification |
| [phase2.md](phase2.md) | mars 2026 | Administration : annuaire LDAP, catalogue, filiales, écrans de configuration |
| [phase3.md](phase3.md) | mars 2026 | Cœur métier : bons, signatures, PDF, emails, portail du collaborateur |
| [phase4.md](phase4.md) | mars 2026 | Tableau de bord IT, journal d'audit, exports CSV |
| [phase5.md](phase5.md) | mars 2026 | Limitation de débit, contestations, premier déploiement (reverse proxy maison `nginx/nginx.conf`, supprimé depuis) |
| [phase6.md](phase6.md) | mars 2026 | Sélecteur de vue (voué à disparaître) et corrections de sécurité |
| [phase-legal-compliance.md](phase-legal-compliance.md) | mars 2026 | Proposition de conformité légale, en grande partie non réalisée |
| [CODE_REVIEW_2026-06-11.md](CODE_REVIEW_2026-06-11.md) | juin 2026 | Revue de code complète et suivi des corrections |

## Règles

- On ne met pas à jour un document archivé : on corrige la documentation vivante.
- Un document de chantier daté ou dépassé rejoint ce dossier, avec une ligne d'en-tête qui le signale et une
  entrée dans le tableau ci-dessus.
