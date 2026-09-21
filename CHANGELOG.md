# Changelog

Historique des évolutions notables de l'application. Les entrées les plus récentes sont en haut.

---

## 2026-09-21 — Créer un bon : moins de friction à chaque saisie

La tâche la plus répétitive de l'équipe IT — chaque amélioration s'y paie autant de fois qu'il y a de bons créés.

### Ajouté
- **Filiale pré-remplie depuis le collaborateur** : dès qu'un collaborateur choisi dans l'autocomplétion a une
  filiale connue de l'annuaire, elle est désormais présélectionnée — sans jamais écraser un choix déjà fait à
  la main, qui reste modifiable ensuite. Sans filiale connue (compte d'annuaire incomplet, collaborateur créé
  manuellement sans filiale précisée), rien ne change.
- **Date de mise à disposition pré-remplie à aujourd'hui** : renseignée dans l'immense majorité des bons, elle
  n'a plus besoin d'être saisie ou cliquée à chaque création (le raccourci « Aujourd'hui » reste disponible
  pour y revenir). Reste vide en modification d'un brouillon existant, où elle vient du bon lui-même.
- **Doublon de numéro de série signalé dès la saisie** : l'avertissement « déjà en circulation sur un autre
  bon » n'arrivait qu'à la soumission, après avoir rempli tout le formulaire. Il apparaît désormais sur la
  ligne concernée dès la sortie du champ N° Série, sans bloquer la saisie ni multiplier les appels réseau —
  l'IT garde la main pour passer outre en connaissance de cause, comme aujourd'hui à l'envoi.
- **Repartir d'un bon existant** : bouton dans la section Équipements pour reprendre les articles d'un bon déjà
  saisi (le cas du kit standard remis à chaque arrivée), sans reprendre le collaborateur, les dates ni les
  numéros de série/inventaire, propres à chaque exemplaire.
- **Saisie au lecteur de code-barres** : dans le champ N° Série d'une ligne, la touche Entrée valide la ligne et
  place le curseur dans le N° Série de la ligne suivante (même article, prête pour le prochain scan) — de quoi
  enchaîner plusieurs exemplaires identiques sans lâcher le lecteur ni jamais soumettre le formulaire par
  accident.
- **Brouillon conservé** : la saisie en cours d'un nouveau bon est désormais sauvegardée dans le navigateur et
  restaurée à la réouverture de la page (fermeture accidentelle, session expirée), avec un bandeau discret et
  un moyen de repartir de zéro. Effacée dès que le bon est créé.

---

## 2026-09-21 — Tableau de bord orienté action, et accessibilité

### Ajouté
- **Bloc « À traiter aujourd'hui »** sur l'onglet « Aujourd'hui » du tableau de bord : les sept compteurs
  disaient combien, jamais quoi faire. Le nouveau bloc liste le travail réel — brouillons jamais envoyés (les
  plus anciens d'abord), signatures en attente au-delà du seuil configuré (avec proposition de relance) et
  bons actifs dont la restitution prévue est dépassée (avec proposition d'initier la restitution) — chaque
  ligne menant directement au bon concerné, et un lien « voir tout » par catégorie vers la liste filtrée. Une
  catégorie vide n'est pas affichée ; si tout est à jour, un message rassurant remplace le bloc.
- **Alerte « tâches planifiées » sur le tableau de bord** : une tâche `@Cron` en erreur ou en retard (visible
  jusqu'ici seulement dans Admin → Configuration → Monitoring) déclenche désormais une alerte discrète sur le
  tableau de bord IT, avec un lien direct vers le monitoring. Réservée aux administrateurs ; invisible dès que
  tout va bien, et pour tout autre rôle (aucun appel à la route, donc aucune erreur 403 à gérer).

### Corrigé
- **Disposition des tuiles du tableau de bord** : sept tuiles en 3 colonnes laissaient la dernière seule sur
  sa ligne. Passées à 4 colonnes (comme les tuiles « Volumes » de l'onglet Délais), elles se répartissent
  désormais en 4+2 ou 4+3 selon le contexte, sans ligne à un seul élément.
- **Accessibilité — titres de page** : le tableau de bord et les dix pages de Configuration n'avaient aucun
  `h1` (le tableau de bord affichait son titre en `h2` ; les pages de Configuration n'en avaient aucun). Ajout
  d'un titre unique par page, visible sur le tableau de bord, visuellement masqué mais lisible par un lecteur
  d'écran sur les pages de Configuration (où le titre visible équivalent existe déjà par ailleurs et ne doit
  pas être doublé).
- **Accessibilité — boutons sans nom accessible** : boutons à icône seule sans `aria-label` sur Admin →
  Filiales (modifier/supprimer une filiale, désormais nommés avec la filiale concernée) et sur Admin →
  Configuration (actualiser les tâches planifiées, actualiser le statut SMB, réessayer un export échoué,
  bascule « Active » du formulaire de filiale).
- **Accessibilité — tableaux sans intitulé** : ajout d'un `aria-label` aux deux tableaux de l'onglet « Délais »
  (délai envoi → signature, bons en attente par étape) et à celui des exports SMB échoués sur la page
  Monitoring, comme les autres tableaux de l'application.

---

## 2026-09-21 — Historique d'un matériel : une page dédiée, accessible depuis l'inventaire

### Ajouté
- **Page `/materiel/:reference`** : la traçabilité d'un matériel existait déjà (tous les bons où son numéro
  apparaît) mais restait invisible — accessible uniquement en cliquant le numéro de série dans la fiche d'un
  bon, sans rien qui indique que c'est cliquable, et absente de l'inventaire, l'écran où l'on va pourtant
  chercher un matériel en premier. Le numéro de série est désormais cliquable partout où il s'affiche (fiche
  du bon, inventaire), avec un intitulé accessible et un soulignement au survol. La page réunit l'état actuel
  (chez qui, depuis quand, ou « rendu le … », ou « déclaré non rendu »), la suite des détenteurs du plus
  récent au plus ancien avec lien vers chaque bon, et un export CSV. Remplace l'ancienne modale
  (`SerialHistoryModal`) : une seule façon de consulter un historique, avec une adresse partageable. Accès IT
  (admin, technicien) ; la direction peut consulter, sans lien vers les bons (même règle que l'inventaire).
- **Le numéro d'inventaire compte désormais autant que le numéro de série** : jusqu'ici saisi mais inutilisé
  nulle part (ni cliquable, ni cherchable), il ouvre maintenant le même historique et est reconnu par la
  recherche globale (Ctrl+K) au même titre qu'un numéro de série.

---

## 2026-09-21 — Alerte « départ d'un collaborateur »

### Ajouté
- **Alerte « départs avec matériel »** : rien ne reliait jusqu'ici la procédure de départ à l'application —
  quand la synchronisation LDAP désactivait un compte, personne n'était prévenu qu'il détenait encore du
  matériel, qui partait avec la personne. En fin de synchronisation, un email récapitulatif unique prévient
  désormais l'IT (nom, filiale, nombre d'équipements, ancienneté du prêt le plus ancien), sans jamais
  renvoyer deux fois pour la même personne. Alerte seule : aucune action automatique sur les bons, la
  restitution reste présentielle depuis la fiche du bon. Tuile « Départs avec matériel » sur le tableau de
  bord IT, filtre `?compte=` et pastille « Compte désactivé » dans l'inventaire par collaborateur.

---

## 2026-09-21 — Dépendances : plus aucune vulnérabilité connue

Montées de version majeures, une par lot, chacune validée par les tests, le démarrage réel du binaire
compilé et les parcours de bout en bout.

### Sécurité
- **NestJS 10 → 12** : ferme les trois vulnérabilités hautes du backend (`qs`, `file-type` et la copie de
  `multer` qu'il embarquait).
- **nodemailer 8 → 10** : ferme le contournement de `disableFileAccess` par l'option `raw`.
- **@azure/msal-node 2 → 6** et **`uuid` retiré** au profit de `crypto.randomUUID` (Node 22) : la version
  corrigée d'`uuid` est en ESM pur, inutilisable depuis un backend CommonJS, et le paquet ne servait qu'à
  nommer deux fichiers.
- **react-router 6 → 7** : la ligne 6 n'a jamais reçu le correctif de l'open redirect. Migration mécanique
  (le paquet `react-router-dom` fusionne dans `react-router`), les garde-fous applicatifs restent en place.

`npm audit --omit=dev` : backend 12 → 0, frontend 5 → 0.

### Corrigé
- **Démarrage de l'application avec NestJS 12** : `JwtAuthGuard` héritait d'un `@Optional()` qui ne l'est
  plus depuis la version 11. Sans constructeur explicite, une dépendance que personne ne fournit devenait
  obligatoire et l'application entière refusait de démarrer. Détecté par le démarrage du binaire compilé,
  pas par les tests unitaires.

### Dette assumée
- Les paquets NestJS 12 sont livrés en ESM, la suite Jest reste en CommonJS : une transformation Babel les
  convertit pour les tests, et un fichier interne utilisant `import.meta.url` y est remplacé par une
  doublure. La production, elle, charge le vrai fichier. À solder le jour où la suite passera en ESM.
- `@nestjs/schematics` reste en version 11 : sa version 12 exige TypeScript 6. C'est un outil de génération
  de code, jamais exécuté en production ni en CI.

---

## 2026-09-20 — Avant l'ouverture de la production : garde-fous, supervision, dette

Chantier de fiabilisation mené avant de remplir la production. Chaque point répond à un risque constaté,
pas à une envie de propreté.

### Mise en production
- **La production ne suit plus la branche.** Jusqu'ici, tout push sur `main` partait en production via
  l'étiquette `latest`, sans passer par la recette. Désormais la recette suit `main`, et la production est
  épinglée sur un numéro de version (`APP_IMAGE_TAG`) publié en posant un tag `vX.Y.Z`. Retour arrière =
  remettre la version précédente. Procédure et limites (les migrations ne se défont pas) dans
  `deploy/README.md`.
- **Rien ne sort sans être testé.** La CI vérifiait seulement le backend, sans couverture, alors que l'image
  du frontend partait quand même en production : ses 471 tests ne tournaient jamais. Elle lance maintenant
  le typage et les tests des deux côtés, rejoue les migrations sur un vrai PostgreSQL, exécute les requêtes
  SQL brutes pour de bon, détecte un schéma modifié sans migration, applique le seuil de couverture, et joue
  les parcours de bout en bout.

### Ajouté
- **Tests de bout en bout** (`e2e/`, Playwright) : création d'un bon, cachet IT, envoi et réception de
  l'email, signature en présentiel, refus d'envoi à un collaborateur sans adresse, déclaration de matériel
  non rendu, PV de clôture, clôture sans signature, inventaire par collaborateur. Ils tournent contre
  l'application réellement construite depuis les sources, avec une base et un serveur d'emails jetables,
  et conditionnent la publication des images. Une régression bloquante (cachet IT refusé sur un brouillon)
  n'avait été vue que par un parcours navigateur — et ces tests ont trouvé deux défauts de plus dès leur
  écriture (voir Corrigé).
- **Supervision** : `/api/health/ready` vérifie que la base répond et renvoie 503 sinon — c'est l'adresse à
  donner à la sonde Zabbix, et le healthcheck Docker l'utilise. Admin → Configuration → Monitoring affiche
  désormais l'état des tâches planifiées (synchro LDAP, rappels, rétention, relance des exports) : dernier
  passage, durée, erreur éventuelle, retard, avec la version et le commit déployés.
- **LDAPS prêt** : l'application accepte une connexion chiffrée vers un contrôleur de domaine signé par la
  CA interne (certificat de la CA à monter, `NODE_EXTRA_CA_CERTS`), et traduit les erreurs TLS en messages
  actionnables au lieu d'un code technique.

### Sécurité
- Correctifs de dépendances sans changement de version majeure (postcss, nanoid, multer, fflate, msal-node).
  Ce qui reste exige des montées majeures (NestJS, react-router, nodemailer), planifiées.
- **Secrets de production retirés de l'environnement de développement** : la base locale contenait les vrais
  identifiants de la boîte Office 365, et un email de test en était réellement parti. `docker-compose.dev.yml`
  démarre maintenant Mailpit (tous les emails de dev y arrivent, aucun ne sort) et
  `backend/scripts/dev-scrub-secrets.js` efface ces secrets, en refusant de s'exécuter ailleurs qu'en local.
- Images en Node 22 : Node 20 n'est plus maintenu depuis avril 2026.

### Corrigé
- **Restitution par email vers une adresse inutilisable** : l'envoi d'une mise à disposition vérifiait
  l'adresse du collaborateur, l'initiation d'une restitution non. Pour un compte créé à la main, sans
  adresse, le bon basculait en attente d'une signature que personne ne pouvait demander, sans le moindre
  message. Le refus renvoie maintenant vers la signature présentielle, comme à l'envoi.
- **Archivage d'un bon sans son procès-verbal** : quand le matériel perdu était déclaré *avant* de faire
  signer la restitution du reste, la signature archivait le bon sans émettre le PV d'équipements non
  restitués — le document qui acte la perte — et la signature IT enregistrée pour ce PV restait orpheline.
  Un tel bon reste désormais en restitution partielle, le PV est émis, et l'archivage a lieu à sa signature
  ou par clôture sans signature.

### Modifié
- **Interface plus légère** : les graphiques du tableau de bord ne sont chargés qu'à l'ouverture d'un onglet
  qui en contient — l'onglet « Aujourd'hui » passe de 132 kB à 5 kB compressés.
- L'état de la configuration et la liste des filiales ne sont plus demandés plusieurs fois par page.
- Après un changement de mot de passe imposé, l'utilisateur revient sur la page qu'il avait demandée.
- **Fichiers volumineux découpés** (ldap, rétention, export SMB, notifications, indicateurs du parc,
  catalogue, modèles PDF, contrôleur des bons) : mêmes routes, mêmes requêtes, mêmes messages — vérifié par
  deux relectures ancien/nouveau, fonction par fonction.

---

## 2026-09-18 — Inventaire : lecture par collaborateur

### Ajouté
- **Vue « Par collaborateur »** de l'inventaire : une ligne par personne avec son service, sa filiale, le
  nombre d'équipements détenus, ceux en retard et l'ancienneté du prêt le plus ancien. Un clic déplie le
  détail de son matériel, chargé à ce moment-là. La vue choisie vit dans l'URL, et les filtres (recherche,
  filiale, catégorie, situation, retards) s'appliquent aux deux lectures.
- Nouvelle route `GET /reporting/inventory/by-collaborateur` : mêmes filtres que la liste, tri par nombre
  d'équipements ou par ancienneté, pagination. Le regroupement réutilise la construction de filtres
  existante et se fait en mémoire, pour ne pas dupliquer ces conditions en SQL — une duplication de cette
  logique avait déjà causé un écart entre écrans.

Cas d'usage visés : préparer un départ (tout ce qu'une personne doit rendre), repérer les accumulations,
faire le point filiale par filiale.

Le regroupement est plafonné à 10 000 équipements côté serveur ; au-delà, la page le dit et invite à
affiner les filtres, plutôt que de présenter un classement partiel comme s'il était complet.

---

## 2026-09-18 — Configuration, modèles d'emails et inventaire : lisibilité et outils

### Ajouté
- **État de la configuration** : chaque rubrique (Général, Active Directory, Entra, SMTP, Rappels, Tokens,
  Export SMB, Horodatage, Rétention) affiche si elle est configurée, incomplète, désactivée ou jamais
  renseignée, avec la conséquence concrète (« SMTP incomplet : aucun lien de signature ne part, seule la
  signature présentielle fonctionne ») et la date de dernière modification. Synthèse sur la page Général,
  pastille dans le menu. Seule la présence des clés est testée : aucune valeur secrète n'est lue ni renvoyée.
- **Modèles d'emails** : recherche, filtre par catégorie et par destinataire, badge « Personnalisé » sur les
  modèles modifiés, et **envoi d'un email de test** à une adresse choisie, rendu avec les variables
  d'exemple, sans créer ni modifier de bon, tracé dans le journal d'audit.
- **Inventaire** : ancienneté du prêt affichée et triable, tuiles cliquables qui filtrent la liste, retards
  signalés sur toute la ligne avec le nombre de jours, export CSV reprenant filtres, tri, ancienneté et retard.

### Corrigé
- Page des modèles : accents manquants du titre, du sous-titre et des libellés de configuration PDF ; la
  pastille de catégorie porte désormais son libellé.
- Badge « Modifie » renommé « Personnalisé » sur les modèles d'emails et de PDF.

---

## 2026-09-18 — Catalogue, filiales et données de démonstration

### Ajouté
- **Page Catalogue repensée** : vrais onglets avec compteurs, barre d'outils sur une ligne, filtre d'état
  (les éléments désactivés sont masqués par défaut, pour le catalogue comme pour les packs), description
  visible sous le modèle, états vides qui proposent l'action suivante, colonne Statut affichée seulement
  quand des éléments désactivés sont visibles.
- **Modèle CSV du catalogue** : une ligne d'exemple par catégorie autorisée et un rappel des valeurs
  acceptées, pour qu'un administrateur n'ait pas à deviner. Les lignes commençant par « # » sont des
  commentaires, ignorées à l'import côté navigateur comme côté serveur.
- **Import et export CSV des filiales** : export léger ou avec les images encodées en base64, modèle
  téléchargeable, import avec aperçu puis compte rendu ligne par ligne (créées, mises à jour, ignorées).
  Filtre d'état également sur les filiales.
- **Jeu de données de démonstration** (`backend/scripts/demo-data.sql`, version à coller dans une console
  dans `backend/scripts/demo-data-a-coller.txt`) : filiales, collaborateurs dont des comptes sans adresse,
  catalogue, packs et 140 bons répartis sur douze mois avec signatures, emails, rappels, contestations et
  journal d'audit. Rejouable, et suppression fournie.

### Sécurité
- **Injection de formules CSV** : les exports produits côté navigateur passent désormais par le même
  échappement que le serveur (guillemets doublés, apostrophe devant `=`, `+`, `-`, `@`, tabulation et
  retour chariot).
- **Images importées** (logo et cachet des filiales) : type réellement vérifié par les octets d'en-tête
  et non par l'extension, taille plafonnée, nom de fichier toujours généré par l'application.
- **Import du catalogue** : message listant les catégories acceptées, doublons détectés à l'intérieur du
  fichier, limite de 500 lignes.

### Corrigé
- **Configuration incohérente entre plusieurs conteneurs backend** : le cache mémoire de la configuration
  n'était vidé que sur l'instance qui recevait l'enregistrement. La date de dernière écriture en base sert
  désormais de version partagée, relue au plus toutes les cinq secondes : une modification se propage à
  tous les conteneurs en quelques secondes.

---

## 2026-09-18 — Collaborateurs sans compte Active Directory, et rôles SSO enfin diagnosticables

Les compagnons de chantier n'ont pas de compte dans l'annuaire : ils n'existaient donc pas dans
l'application et ne pouvaient pas recevoir de matériel. Par ailleurs, une personne placée dans un groupe
Entra n'obtenait pas son rôle, sans aucune explication visible.

### Ajouté
- **Collaborateur créé à la main** : prénom et nom suffisent, l'adresse email est facultative. Création
  depuis le formulaire du bon quand la recherche ne donne rien (le compte est alors sélectionné
  automatiquement) et depuis l'annuaire. Modification et désactivation réservées à ces comptes ; les comptes
  de l'annuaire restent en lecture seule. Création et modification tracées dans le journal d'audit.
- Ces comptes ne peuvent jamais se connecter, ni en SSO faute d'adresse, ni en local faute de mot de passe,
  et la synchronisation Active Directory ne peut ni les désactiver ni les écraser.
- **Diagnostic SSO** dans Configuration → Entra ID : les dernières connexions, le nombre de groupes reçus,
  le rôle attribué et, en cas d'échec, la raison exacte. Le cas « revendication de groupes non configurée »
  et celui des utilisateurs appartenant à trop de groupes sont nommés distinctement.

### Corrigé
- **Aucun rôle attribué à la connexion SSO** : sans la revendication de groupes sur l'inscription
  d'application Entra, le jeton n'en contient aucun, l'application conservait le rôle enregistré et n'en
  disait rien en dehors des journaux du conteneur. La page de configuration rappelle désormais la
  manipulation à faire, et le diagnostic l'affiche.
- La correspondance des identifiants de groupe ignore désormais les espaces et la casse : un identifiant
  collé depuis le portail Entra ne fait plus échouer la correspondance en silence.
- **Le dialogue de création de collaborateur soumettait le formulaire du bon** : son contenu est affiché
  dans un portail mais reste enfant du formulaire dans l'arbre React, et l'événement remontait. Le message
  « Sélectionnez un collaborateur » s'affichait alors que la création venait d'aboutir.
- Une adresse absente est acceptée partout : création de bon, signature présentielle, PDF, exports CSV et
  écrans affichent « — ». Aucun email n'est tenté vers une adresse vide, avec une trace explicite dans
  l'historique des envois du bon plutôt qu'une erreur technique.
- La note « rôle recalculé depuis Entra » ne s'affiche plus sur les comptes créés à la main.

---

## 2026-09-18 — Couleurs : tout l'écran suit enfin le thème de l'application

Un utilisateur a signalé une modale bleue (« Initier la restitution ») dans une application rouge. Le bleu
n'était pas isolé : 67 fichiers utilisaient des couleurs de palette codées en dur, qui ignorent la couleur
de marque et, pour beaucoup, le thème sombre.

### Ajouté
- **Jetons `success` et `warning`** (clair et sombre) en plus de `primary` et `destructive`. Leur absence
  expliquait le recours au vert et à l'ambre bruts.
- **Règle de couleur** inscrite dans la feuille de styles : accent, sélection et information en `primary` ;
  danger, suppression et erreur en `destructive` ; réussite et matériel rendu en `success` ; attente et
  vigilance en `warning` ; le reste en neutre.

### Corrigé
- **Les cinq modales d'action** forment une famille cohérente : restitution et cachet informatique en rouge,
  non-restitution et clôture unilatérale en destructif, matériel retrouvé en vert. Lignes sélectionnées et
  cases à cocher au rouge de l'application.
- **Plus aucune couleur de palette** dans le code de l'interface : statuts de bon, badges, toasts, journal
  d'audit, contestations, portail collaborateur, page de signature publique, inventaire, catalogue et
  tableau de bord passent tous par les jetons.
- Le journal d'audit utilisait dix teintes décoratives ; il utilise désormais quatre tons porteurs de sens.
- Les variantes `dark:` devenues inutiles ont été retirées : les jetons gèrent les deux thèmes.
- Bouton destructif : texte en `destructive-foreground` au lieu d'un blanc codé en dur.

---

## 2026-09-18 — Tableau de bord : apparition des contenus et périodes sans activité

### Ajouté
- **Apparition en cascade** des tuiles et des cartes sur les quatre onglets, et non plus seulement sur
  « Aujourd'hui » : les blocs arrivent l'un après l'autre au lieu de surgir d'un coup en fin de chargement.
  Le contenu d'un graphique remplace son squelette en fondu, et le changement d'onglet se fait en fondu.
- **Respect du réglage « réduire les animations »** du système : toutes les animations du tableau de bord
  sont désactivées quand il est actif, ce qui n'était pas le cas.
- **Bandeau « Aucune activité sur la période choisie »** sur Délais et Incidents, avec un bouton
  « Voir les 12 derniers mois ». Avant, une période sans mouvement affichait une grille de zéros et de
  tirets, sans dire s'il ne s'était rien passé ou si l'application était en panne.
- **États vides des graphiques** de l'onglet Délais : volumes, mode de signature et délais par type
  affichent un message explicite au lieu d'un repère vide.

### Corrigé
- Les classes d'animation étaient composées à l'exécution : Tailwind ne les voyait pas et ne générait
  aucun CSS, si bien que la cascade de l'onglet « Aujourd'hui » ne jouait pas. Classes désormais écrites
  en toutes lettres dans un module dédié.

---

## 2026-09-18 — Catalogue, parc et saisie : audit et améliorations

Audit du catalogue, des packs et de la gestion du matériel (documentation Outline, code, données réelles),
puis mise en œuvre des correctifs. Vérifié sur une instance locale avec données de production anonymisées.

### Ajouté
- **Situation d'un équipement du parc** : « En attente de signature », « En circulation », « En litige ».
  Le matériel remis dont le bon attend encore la signature, et celui d'un bon contesté, faisaient partie du
  parc réel mais étaient absents de l'inventaire et des indicateurs. Colonne, filtre et tuile dédiés,
  colonne « Situation » dans l'export CSV, répartition `bySituation` dans le résumé et dans `/kpi/parc`.
- **Import CSV du catalogue** (`POST /equipment/catalog/import`, 500 lignes maximum) : compte rendu créés,
  réactivés, ignorés, erreurs ligne par ligne. Bouton d'import et export CSV sur la page Catalogue.
- **Journal d'audit du catalogue et des packs** : création, modification, désactivation, réactivation,
  composition d'un pack et import en masse sont désormais tracés comme le reste de l'application.
- **Page Catalogue** : recherche, filtre par catégorie, tri, pagination, duplication de pack, saisie directe
  des quantités, navigation clavier et rôles ARIA sur la recherche d'article.
- **Saisie d'un bon** : quantité à l'ajout depuis le catalogue, duplication de ligne, collage d'une colonne
  de numéros de série depuis un tableur, signalement immédiat d'un numéro en double, navigation clavier
  dans la recherche du catalogue.
- **Recherche globale** : l'équipement et le numéro de série qui ont déclenché le résultat sont affichés,
  et une erreur réseau ne se confond plus avec une absence de résultat.
- **Tests SQL contre une vraie base** (`backend/src/__tests__/sql-real-db.spec.ts`, activés par
  `RUN_DB_TESTS=1`) : les specs habituels simulent `$queryRaw` et ne voient pas les erreurs que seule
  PostgreSQL détecte. Deux d'entre elles étaient déjà arrivées en production.

### Corrigé
- **Rechargement d'une page ou ouverture d'un lien direct** : l'application revenait au tableau de bord.
  La requête d'authentification annulée au double montage de React marquait le chargement comme terminé,
  l'application se croyait déconnectée et perdait l'URL demandée.
- **Répartition par situation en erreur 500** : l'expression `CASE` répétée dans le `SELECT` et le
  `GROUP BY` était liée comme deux paramètres distincts. Regroupement par position de colonne.
- **Libellés du catalogue non normalisés** : espaces retirés à l'enregistrement, unicité désormais
  insensible à la casse (index fonctionnel partiel sur les articles actifs), doublons existants désactivés
  par migration. « Dell » et « dell » ne comptent plus comme deux modèles distincts.
- **Action « Supprimer » qui désactivait** : renommée « Désactiver » partout, avec badge et bouton
  « Réactiver » pour les articles et packs désactivés.
- **Page Catalogue** : plus de rechargement complet du catalogue et des packs après chaque action.
- **Validation d'API du catalogue** : longueurs bornées, valeurs nettoyées, identifiant d'article de pack
  validé en UUID (un identifiant malformé renvoyait une erreur 500 au lieu d'un 400).
- **Clé étrangère** `bon_equipments.catalog_item_id` passée en `ON DELETE RESTRICT` : une suppression
  physique d'article ne peut plus casser la traçabilité d'un bon signé.
- **Historique d'un numéro de série et conflits de série** : troncature désormais signalée.
- Accents manquants et oublis de thème sombre dans le module Catalogue et les modales de restitution,
  de non-restitution et de matériel retrouvé ; libellés liés aux champs dans les formulaires.
- Test de santé de la base de développement : `pg_isready` interrogeait une base inexistante, ce qui
  écrivait une erreur fatale dans les journaux toutes les dix secondes.

---

## 2026-09-17 — Déploiement avec base PostgreSQL sur une machine dédiée

### Ajouté
- `deploy/docker-compose.db.yml` (Portainer, aucun fichier sur l'hôte) : PostgreSQL 16 dédié ; un service
  `db-setup` génère le certificat TLS, `pg_hba.conf` (rôle `app` seul, depuis `APP_HOST_IP` seule, TLS
  obligatoire) et le script qui crée `app` non superutilisateur ; port lié à l'IP LAN, fuseau UTC ;
  service `db-backup` (dump quotidien par socket local, rétention 14 jours).
- `deploy/docker-compose.app.yml` : backend + frontend vers la base externe en `sslmode=require`,
  variables obligatoires vérifiées au déploiement, nom du volume `data` paramétrable pour une reprise,
  service `data-backup` (archive quotidienne du volume `data`).
- `deploy/README.md` : génération des secrets (PowerShell et bash), déploiement pas à pas dans Portainer,
  restauration, reprise d'une installation existante, dépannage.

### Corrigé
- Documentation : le mot de passe PostgreSQL se génère en hexadécimal (`openssl rand -hex 24`).
  Un mot de passe base64 peut contenir « / » ou « + », qui cassent l'URL `DATABASE_URL`.

---

## 2026-09-17 — Réduction de la dette technique : découpage des gros fichiers

Refactor sans changement de comportement : chaque fichier d'origine garde son chemin et ses exports
publics et devient une façade qui délègue à des modules de moins de 400 lignes. Deux relectures
indépendantes ont comparé l'ancien et le nouveau code fonction par fonction sans relever de dérive.

### Backend
- `bons.service.ts` (1 691 → 188 lignes) : requêtes, export CSV, validations, étapes du cycle de vie.
- `pdf.service.ts` (1 116 → 397) : modules de rendu PDFKit ; PDF produit identique à l'octet près.
- `notification.service.ts` (1 010 → 352) et `templates.service.ts` (609 → 161) : transport SMTP,
  journal des envois, messages par type, rappels, modèles par défaut.
- `signature.service.ts` (909 → 244) et `auth.service.ts` (629 → 204) : tokens, signature, cachet IT,
  correspondance groupes Entra → rôle, SSO, connexion locale, jetons de session.

### Frontend
- Page de signature (924 → 210), création de bon (829 → 168), liste des bons (538 → 112),
  actions de la fiche (353 → 112), portail et fiche collaborateur, Inventaire, en-tête,
  pages d'administration (modèles PDF et emails, catalogue, contestations, audit, filiales).

### Tests
- Specs et tests ajoutés pour les modules extraits (881 tests backend, 274 frontend).
- Délais maximaux relevés (Jest 20 s, Vitest 15 s, `findBy`/`waitFor` 5 s) et préchargement du
  tableau de bord dans le test du rôle Direction, pour supprimer les échecs aléatoires sous charge.

### Points relevés, non corrigés (hors refactor)
- `email-xss.spec.ts` recopie les fonctions d'échappement au lieu d'importer `notification/messages/`.
- `revokeToken()` lance la purge des jetons révoqués sans `.catch`.
- Libellé « Aucune filiale configuree » sans accents ; variable inutilisée dans le portail collaborateur.
- Documentation `docs/phase-legal-compliance.md` : marquée « Implémentation complète » alors que les
  phases A, B et C (hors rétention) ne sont pas implémentées.

---

## 2026-09-17 — Correctifs après recette sur l'instance de test

Recette effectuée en navigateur (thème sombre, parcours complet d'un bon) après le déploiement
du tableau de bord KPI.

### Corrigé

- **Envoi d'un bon impossible depuis l'interface** : le flux « Envoyer » appose le cachet IT
  avant l'envoi, et le backend refusait depuis la veille le cachet sur un brouillon. Le cachet
  est de nouveau accepté sur un brouillon ; seuls les bons clos ou contestés le refusent.
- Tableau de bord : les tuiles « Non rendus déclarés » et « Retrouvés » comptaient deux fois
  chaque déclaration (deux entrées d'audit par action) ; comptage corrigé.
- Thème sombre : le toast de succès, l'alerte de la page de changement de mot de passe, les
  boutons « Non rendu » et « Annuler » de la fiche et les cases à cocher des modales de
  restitution utilisaient des couleurs claires codées en dur ; ils passent par les couleurs
  sémantiques du thème.
- Onglets Incidents et Délais : tuiles sur trois colonnes (libellés complets) et indication
  « n en cours » placée dans la tuile.
- À la première connexion sans préférence enregistrée, un administrateur arrive sur la vue
  administrateur et un technicien sur la vue technicien, au lieu de la vue collaborateur.

- **Compte sans adresse email valide** (ex. `admin@local` ou un compte AD sans mail) : l'envoi
  et le renvoi d'un lien de signature sont refusés avec un message explicite proposant la
  signature présentielle, au lieu d'un échec silencieux côté SMTP. Un avertissement s'affiche
  dès la sélection du collaborateur à la création du bon et en bandeau sur la fiche du bon.
- **Emails à lien bloqués sur une instance configurée** : la page d'administration pré-remplit
  `general.app_url` avec `FRONTEND_URL` tant qu'aucune valeur n'est enregistrée, mais le service
  d'emails ne lisait que la base et refusait d'envoyer. Il applique désormais le même repli
  (`app_url`, sinon `FRONTEND_URL`) ; l'erreur explicite ne subsiste que si aucune des deux n'existe.
- Export SMB : quand le chemin d'export n'est pas monté, l'export est tracé en échec dans le
  monitoring (réessayable) au lieu de disparaître silencieusement.

- Lien de signature remplacé par une relance ou une nouvelle demande : la page affiche
  « Lien remplacé » et invite à ouvrir le dernier email reçu, au lieu de « Lien expiré ».
- PDF : le certificat de signature électronique précise la phase de chaque signature
  (« Collaborateur — mise à disposition », « Collaborateur — restitution », cachet IT avec sa
  phase) ; les modèles de restitution, de clôture et d'avenant ont des textes par défaut
  adaptés (« Équipements restitués », « avoir restitué ») au lieu de ceux de la mise à
  disposition.

### Documentation

- README : procédure de réinitialisation du mot de passe `admin@local` et de levée du verrou
  anti-brute-force depuis le serveur ; montage CIFS du partage SMB depuis Docker (un chemin UNC
  n'est pas accessible depuis le conteneur).

---

## 2026-09-17 — Tableau de bord KPI, rôle Direction, seuil de retard configurable

Remplacement du tableau de bord IT et de la page Reporting par une page unique à onglets
résumant l'activité de l'application (parc prêté, délais de traitement, incidents), et ouverture
de son accès en lecture seule à un nouveau rôle Direction. Détail technique dans
[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) et [docs/security.md](docs/security.md).

### Tableau de bord

- Nouvelle page `/dashboard` à quatre onglets : Aujourd'hui (contenu inchangé de l'ancien
  tableau de bord), Parc, Délais et Incidents.
- Sélecteur de période (7 jours, 30 jours, 90 jours, 12 mois ou dates personnalisées) et filtre
  par filiale, mémorisés dans l'adresse de la page pour pouvoir être partagés ou retrouvés après
  rechargement.
- Chaque indicateur est comparé à la période précédente de même durée, avec un delta affiché sur
  la tuile correspondante.
- Onglet Parc : équipements actuellement prêtés (total, par catégorie, par filiale, modèles les
  plus prêtés), part hors catalogue, couverture des numéros de série, courbe d'évolution du
  stock prêté, retards de restitution avec le détail des dix cas les plus anciens, matériel
  déclaré non rendu ou retrouvé.
- Onglet Délais : volumes de bons créés/envoyés/archivés/annulés, délai entre la création et
  l'envoi, délai entre l'envoi et la signature par type de document (avec part signée sous 48 h
  et sous 7 jours), répartition entre signature à distance/en présentiel/par mandataire, durée
  moyenne d'un prêt, étapes actuellement en attente de signature avec leur ancienneté.
- Onglet Incidents : matériel non rendu ou retrouvé, procès-verbaux de clôture émis, clôtures
  unilatérales avec leurs motifs, annulations, contestations (délai médian de résolution, taux
  d'acceptation), efficacité des rappels de signature par rang, nombre de bons ayant reçu trois
  rappels ou plus, emails non délivrés.
- L'ancienne page Reporting (`/admin/reports`) redirige désormais vers l'onglet Parc du tableau
  de bord.

### Rôle Direction

- Nouveau rôle « Direction » : accès en lecture seule au tableau de bord (hors onglet
  Aujourd'hui, arrivée directe sur Parc) et à la page Inventaire ; aucun accès aux bons
  individuels, aux utilisateurs ni à l'administration.
- Attribution automatique par groupe Entra ID dédié (configurable dans Configuration → Entra) ;
  comme pour les rôles IT existants, les groupes Entra font foi à chaque connexion et
  recalculent le rôle en conséquence.
- Attribution manuelle possible depuis la page Utilisateurs (réservée aux administrateurs) ;
  pour un compte synchronisé avec Entra, cette attribution manuelle ne tient que jusqu'à la
  prochaine connexion, où le groupe Entra reprend la main. Une note s'affiche dans l'interface
  pour le signaler. Le changement de rôle est refusé sur son propre compte et sur le dernier
  administrateur actif restant.
- Navigation adaptée : menu réduit à Tableau de bord et Inventaire, pas de recherche globale,
  pas de bouton de création de bon, références de bon non cliquables dans l'inventaire.

### Définitions unifiées et configuration

- Le retard de signature était calculé différemment selon les trois écrans existants ; il n'y a
  désormais qu'une seule définition, utilisée partout (`/bons`, statistiques, tableau de bord).
- Le seuil de retard (auparavant fixé à 7 jours en dur) est configurable dans Configuration →
  Rappels et pris en compte immédiatement (sous réserve du cache de 60 secondes du tableau de
  bord).
- **Correction de fuseau horaire** : les bornes de période et les regroupements par jour/semaine/
  mois du tableau de bord traitaient par erreur les horodatages stockés en UTC comme des heures
  de Paris, ce qui décalait d'une à deux heures les séries autour de minuit (onglet Délais
  notamment). Les calculs passent désormais explicitement par UTC avant conversion.
- Les libellés de catégories d'équipement et l'échappement des cellules CSV n'existent plus
  qu'à un seul endroit du code, partagé par tous les exports.

### Données et migrations

- Nouvelle valeur d'énumération pour les rôles utilisateur (`direction`).
- Neuf nouveaux index sur les tables de signatures, bons, équipements, contestations, journal
  d'audit et journal de notifications, pour que les agrégations du tableau de bord restent
  rapides à mesure que le volume de données augmente.
- Les deux migrations correspondantes sont idempotentes (rejouables sans effet sur une base déjà
  à jour).

### Retraits

- La page Reporting et ses deux points d'accès historiques (`/admin/reports`,
  `GET /api/reports/overview`, export CSV dédié) sont supprimés ; l'export du parc en
  circulation et les emails non délivrés restent disponibles via l'inventaire et le monitoring
  administrateur.
- L'ancien tableau de bord IT (page dédiée) est remplacé par le nouvel onglet « Aujourd'hui »,
  au contenu identique.

### Tests

- Nouvelle suite de tests backend pour le module KPI (période, cache, fragments SQL, chaque
  service d'onglet), les définitions unifiées et la garde d'accès par rôle.
- Nouvelle suite de tests frontend pour le tableau de bord (page à onglets, tuiles, graphiques,
  sélecteur de période), la navigation par rôle et la gestion des rôles depuis la page
  Utilisateurs.

---

## 2026-09-16 — Mise à jour pré-production

Revue complète avant mise en production : sécurité, fiabilité du workflow des bons, emails,
PDF et données. Deux nouvelles fonctionnalités (inventaire, rappel avant restitution). Détail
technique complet dans [docs/security.md](docs/security.md) et
[AGENDA.md](AGENDA.md) (section 11, pièges connus).

### Sécurité

- Correction d'un double comptage de la limitation de débit (rate limiting) qui pouvait
  déclencher des blocages prématurés sur certaines actions.
- Le rafraîchissement de session est désormais limité par utilisateur plutôt que par adresse
  IP : un réseau partagé (agence, VPN) ne pénalise plus tous ses utilisateurs à la fois.
- Verrouillage anti-brute-force revu : verrouillage d'un compte après 10 échecs de connexion
  depuis la même adresse IP en 30 minutes, verrouillage d'une adresse IP après 30 échecs tous
  comptes confondus.
- Nouveau bouton de déverrouillage manuel d'un compte verrouillé, sur la page Utilisateurs.
- Le cookie de session de rafraîchissement est désormais correctement révoqué à la
  déconnexion.
- La redirection après connexion est validée par comparaison d'origine plutôt que par une
  expression régulière, pour fermer un contournement possible de la protection existante.
- Les adresses email sont systématiquement normalisées en minuscules, avec une contrainte
  empêchant deux comptes de ne différer que par la casse.
- La synchronisation avec l'annuaire Active Directory s'interrompt désormais si elle
  désactiverait plus de 20 % des comptes actifs (et au moins 5), pour éviter une désactivation
  massive accidentelle en cas d'erreur de configuration.
- La purge des comptes disparus de l'annuaire ne supprime plus jamais physiquement un compte :
  elle se contente de le désactiver.
- Le mot de passe administrateur initial généré automatiquement est désormais supprimé du
  disque dès le premier changement de mot de passe.
- Durée minimale de conservation avant anonymisation portée à 60 mois (plancher non
  contournable), avec un aperçu (dry-run) obligatoire de moins de 24 heures avant toute
  exécution réelle.

### Workflow des bons

- Le déclenchement du procès-verbal de clôture est désormais recalculé à partir de l'état réel
  des équipements plutôt que déduit d'un indicateur séparé, plus fiable.
- Un équipement déclaré retrouvé après une restitution partielle ne referme plus le bon tant
  que d'autres équipements restent en attente.
- Un bon ne peut plus être annulé une fois la signature de mise à disposition apposée ; il faut
  désormais passer par la restitution ou la clôture unilatérale.
- Les changements de statut vérifient l'état de départ du bon au moment de l'écriture, pour
  éviter que deux actions simultanées ne se contredisent.
- La création et l'envoi d'un bon sont bloqués si le collaborateur ou la filiale concernée est
  inactif.
- L'envoi d'un bon en cas de conflit de numéro de série avec un autre bon actif demande
  désormais une confirmation explicite avant de continuer.
- Les numéros de série et d'inventaire saisis sont nettoyés des espaces superflus à
  l'enregistrement, et les doublons de numéro de série à l'intérieur d'un même bon sont
  détectés.

### Signature et portail

- Le lien de signature en présentiel n'est plus valable que 2 heures (contre une durée plus
  longue auparavant, alignée sur les liens envoyés par email).
- Un bon annulé ou contesté affiche désormais un écran d'information dédié sur la page de
  signature, plutôt qu'une erreur générique.
- Le portail collaborateur affiche une mention quand une signature en présentiel est en cours,
  sans exposer de lien cliquable à l'utilisateur.
- Après un échec réseau pendant la signature, la page revérifie l'état du bon avant d'afficher
  une erreur, pour éviter un message trompeur si la signature a en fait abouti.

### Emails et rappels

- L'adresse d'expédition des emails et l'URL publique de l'application doivent désormais être
  configurées explicitement dans l'administration ; sans cela, l'envoi échoue avec un message
  d'erreur explicite au lieu d'un envoi silencieux ou d'un lien invalide.
- Nouvel historique des emails consultable depuis la fiche de chaque bon, avec le statut
  d'envoi et le message d'erreur le cas échéant.
- Le rappel automatique programmé n'invalide plus par erreur un lien de signature en
  présentiel encore valide.

### PDF et archivage

- Les documents PDF utilisent désormais une police intégrée capable d'afficher les caractères
  accentués et spéciaux, à la place des polices standard plus limitées.
- Le cachet de la filiale s'affiche désormais sur le PDF lorsqu'il est configuré.
- Une colonne de numérotation des lignes d'équipement est disponible en option sur le PDF.
- Nouvel endpoint administrateur pour régénérer les PDF manquants lorsqu'une signature existe
  sans document associé.
- La génération d'un document PDF, son archivage et l'écriture du journal d'audit se font
  désormais en une seule opération cohérente (tout ou rien).
- Purge automatique et indépendante des pièces jointes anciennes, distincte du délai
  d'anonymisation des bons.

### Données et migrations

- Ajout d'index manquants sur les colonnes les plus sollicitées par les recherches et les
  filtres, pour préserver les performances à mesure que le volume de données augmente.
- Nouvelles contraintes d'unicité sur les emails (insensible à la casse), les articles de
  catalogue et les noms de filiale ; les doublons existants sont détectés avant application de
  ces contraintes, avec instructions de correction si nécessaire (voir README.md).

### Frontend

- Correction de boutons du formulaire de création de bon qui pouvaient soumettre le formulaire
  par erreur au lieu d'ouvrir une recherche.
- Les listes et pages d'administration gèrent désormais proprement les erreurs de chargement,
  avec un message explicite et un bouton de nouvelle tentative.
- Les actions de suppression proposent désormais une confirmation avant d'agir.

### Nouvelles fonctionnalités

- **Vue Inventaire du parc prêté** (`/inventaire`) : liste filtrable des équipements
  actuellement chez les collaborateurs, avec export CSV et résumé par catégorie et filiale.
- **Rappel avant restitution prévue** : email automatique envoyé au collaborateur avant la date
  de restitution prévue d'un bon, délai configurable (par défaut 7 jours, désactivable).

### Tests

- Ajout d'une suite de tests frontend (Vitest) couvrant la création de bon, la connexion et des
  composants partagés.
- Extension des tests backend sur la machine à états des bons, le verrouillage anti-brute-force
  et la synchronisation LDAP.
