# Guide du testeur — banc de recette « bmad-recette »

Le banc de recette est une copie **jetable** de l'application, isolée du poste de développement : sa propre base,
son propre Mailpit, ses propres ports. Il repart **du même jeu de données** à chaque démarrage, d'une vague de
recette à l'autre. On y teste l'application **comme un vrai utilisateur**, dans **Chrome réel en mode fenêtré**,
sur ordinateur et sur téléphone émulé, en prenant des captures d'écran **que l'on regarde**.

## 1. Démarrer, arrêter

Depuis la racine du dépôt, dans Git Bash (Windows) ou un terminal Linux :

```bash
bash e2e/recette/recette-up.sh                      # construit depuis l'arbre de travail, démarre, amorce
bash e2e/recette/recette-up.sh --sources HEAD       # construit depuis le dernier commit (arbre de travail instable)
bash e2e/recette/recette-up.sh --sans-construction  # réutilise les images déjà construites
bash e2e/recette/recette-down.sh                    # arrête et supprime tout (données comprises)
bash e2e/recette/recette-down.sh --images           # … et supprime aussi les images
```

- `recette-up.sh` supprime d'abord un éventuel banc précédent : **chaque démarrage repart de zéro**.
- Durée mesurée sur le poste le 24/09/2026 : construction ≈ 1 min 50 s (backend 1 min 09 s, frontend 37 s, cache
  Docker en place), démarrage 20 s, amorçage 3 min 02 s ; soit **≈ 5 min 15 s** en tout, **3 min 30 s** sans
  construction. `recette-up.sh` affiche ces durées à la fin.
- Seul le projet compose `bmad-recette` est touché : jamais les conteneurs de dev (`bondemiseadisposition-*`) ni la
  pile E2E (`bmad-e2e`).
- Seul l'orchestrateur (ou l'agent désigné) construit les images. Les testeurs **utilisent** un banc déjà démarré.

| Quoi | Adresse |
|---|---|
| Application | <http://localhost:8082> — bouton « Connexion avec un compte local » |
| Mailpit (emails capturés) | <http://localhost:8027> — API : `http://localhost:8027/api/v1/…` |

## 2. Comptes

Tous les comptes ci-dessous sont des **comptes locaux** (pas d'annuaire ni d'Entra sur le banc). Les mots de passe
sont des valeurs de recette, factices, propres à ce banc.

La colonne « Clé » est ce que l'on passe à `t.connecter(…)` dans le gabarit (§ 7) ; le § 4 l'utilise aussi.

| Clé | Rôle | Nom | Identifiant (email) | Mot de passe | Particularité |
|---|---|---|---|---|---|
| `admin` | Admin | Nadia Lefèvre | `nadia.lefevre@recette.test` | `Recette-Admin#2026` | |
| `technicien` | Technicien | Thomas Girard | `thomas.girard@recette.test` | `Recette-Tech#2026` | Filiale Nord |
| `technicien2` | Technicien | Julie Moreau | `julie.moreau@recette.test` | `Recette-Tech#2026` | Filiale Sud |
| `direction` | Direction | Marc Dubois | `marc.dubois@recette.test` | `Recette-Direction#2026` | Lecture seule (tableau de bord, inventaire) |
| `collaborateur` | Collaborateur | Léa Martin | `lea.martin@recette.test` | `Recette-Collab#2026` | Adresse valide, portail bien rempli |
| `collaborateur-hugo` | Collaborateur | Hugo Petit | `hugo.petit@recette.test` | `Recette-Collab#2026` | Adresse valide : signe, conteste, a un PV à signer |
| `collaborateur-karim` | Collaborateur | Karim Haddad | `karim.haddad@recette` | `Recette-Collab#2026` | **Adresse invalide** (domaine sans point) : se connecte, mais aucun lien ne peut lui être envoyé |
| `collaborateur-sophie` | Collaborateur | Sophie Bernard | `sophie.bernard@recette.test` | `Recette-Collab#2026` | **A changé de filiale** (Sud → Est) ; ses bons restent sur Sud |
| — | Collaborateur | Paul Rousseau | `paul.rousseau@recette.test` | (ne se connecte plus) | **Parti** : compte désactivé, détient encore du matériel |
| — | Collaborateur | Ahmed Benali | (aucune adresse) | (ne se connecte pas) | **Compagnon de chantier** sans adresse : présentiel uniquement |

- Aucun écran de changement de mot de passe n'est imposé : plusieurs testeurs peuvent utiliser le même compte en
  même temps.
- Le compte technique `admin@local` existe aussi, dans son état de **premier démarrage** (mot de passe initial
  `RecetteInitial#2026`, changement imposé à la première connexion). Ne l'utilisez **que** pour tester cet écran :
  une fois le mot de passe changé, il l'est pour tous.
- Figurants (volume) : 16 collaborateurs « importés de l'annuaire » (`prenom.nom@recette.test`, ils reçoivent des
  emails mais ne se connectent pas) et un second compagnon sans adresse, Mathis Lopez.

## 3. Le jeu de données

- **Filiales** : *Bâtir Nord* (NORD, Lille), *Rénov Sud* (SUD, Marseille), *Services Est* (EST, Strasbourg), chacune
  avec un logo et un cachet ; plus *Ancienne agence Ouest*, **désactivée**, sans logo ni bon.
- **Catalogue** : 16 articles actifs couvrant toutes les catégories (portables Dell, Lenovo, Apple ; mini-PC HP ;
  écrans ; souris ; clavier ; casque ; téléphones ; sacoche ; station d'accueil ; câble ; clé de sécurité), et un
  article **retiré** (HP ProBook 450 G7). **Packs** : « Pack poste nomade », « Pack chef de chantier ».
- **Bons** : 64 au total, étalés sur environ sept mois — les 22 situations ci-dessous, puis 42 bons ordinaires
  (clôturés, en cours, à signer, annulés, brouillons) pour donner du volume aux listes, à la pagination, à
  l'inventaire et au tableau de bord. Numéros de série lisibles (`DL5450-0007`), numéros d'inventaire `INV-00012`.
  Deux brouillons reprêtent un portable déjà rendu (historique d'équipement sur deux bons).
- Tout a été produit par l'**API réelle**, en rejouant les gestes de l'interface : signatures scellées, PDF de
  preuve, journal d'audit et emails sont ceux qu'aurait produits un vrai utilisateur. Les dates ont ensuite été
  reculées, et les PDF régénérés par l'application elle-même pour porter ces dates.

## 4. Les situations : quel bon ouvrir

Les références ont la forme `BON-<année de l'amorçage>-00NN` ; l'année ci-dessous est celle du 24/09/2026.
`recette-up.sh` vérifie à chaque amorçage que chaque bon a bien la référence et le statut annoncés, et réaffiche ce
tableau en fin de sortie. La note de chaque bon rappelle sa situation (« Recette S07 : … »).

Colonne « Qui la voit » : les clés du § 2. « IT » veut dire `admin`, `technicien` ou `technicien2`, indifféremment :
un technicien voit les bons de toutes les filiales.

| # | Référence | Statut interne | Libellé cible (lexique) | Situation | Qui la voit |
|---|---|---|---|---|---|
| S01 | BON-2026-0001 | `draft` | Brouillon | Brouillon préparé à partir d'un pack, numéros de série à saisir | IT |
| S02 | BON-2026-0002 | `sent_mise_dispo` | Remise à signer | Envoyé aujourd'hui, lien valide (Hugo peut signer) | IT ; `collaborateur-hugo` (lien dans Mailpit) |
| S03 | BON-2026-0003 | `sent_mise_dispo` | Remise à signer, **signature en retard** | Envoyé il y a 10 jours, lien expiré | IT ; `collaborateur` (Léa) |
| S04 | BON-2026-0004 | `active` | En cours | Remise signée à distance par Léa | IT ; `collaborateur` (Léa, portail) |
| S05 | BON-2026-0005 | `sent_restitution` | Restitution à signer | Restitution demandée il y a 2 jours, lien valide | IT ; `collaborateur-hugo` (lien dans Mailpit) |
| S06 | BON-2026-0006 | `partially_returned` | Restitution en cours — équipements encore chez la collaboratrice | Restitution partielle signée, 2 équipements encore détenus | IT ; `collaborateur` (Léa) |
| S07 | BON-2026-0007 | `partially_returned` | Restitution en cours — PV à signer | PV de non-restitution émis, à signer par Hugo | IT ; `collaborateur-hugo` (lien dans Mailpit) |
| S08 | BON-2026-0008 | `partially_returned` | Restitution en cours — PV à signer, lien expiré | PV dont le lien a expiré (à renvoyer) | IT ; `collaborateur` (Léa) |
| S09 | BON-2026-0009 | `contested` | Contesté | Contestation ouverte hier par Hugo | IT (Contestations) ; `collaborateur-hugo` |
| S10 | BON-2026-0010 | `archived` | Clôturé | Clôturé normalement (restitution signée au guichet) | IT ; `collaborateur-sophie` |
| S11 | BON-2026-0011 | `archived` | Clôturé (sans signature) | Compagnon reparti avant de signer la restitution | IT |
| S12 | BON-2026-0012 | `active` | En cours | **Collaborateur parti** (compte désactivé) qui détient encore 3 équipements | IT ; `direction` |
| S13 | BON-2026-0013 | `active` | En cours | **Collaboratrice mutée** Sud → Est ; le bon reste sur Sud | IT ; `collaborateur-sophie` |
| S14 | BON-2026-0014 | `cancelled` | Annulé | Annulé après envoi (email d'annulation dans Mailpit) | IT |
| S15 | BON-2026-0015 | `archived` | Clôturé | PV signé, puis **équipement retrouvé** (avenant) | IT ; `collaborateur-hugo` |
| S16 | BON-2026-0016 | `active` | En cours, **retour en retard** | Date de restitution prévue dépassée de 5 jours | IT ; `direction` |
| S17 | BON-2026-0017 | `partially_returned` | Restitution en cours — restitution partielle à signer | Restitution partielle demandée hier, pas encore signée | IT |
| S18 | BON-2026-0018 | `partially_returned` | Restitution en cours — perte déclarée | Casque déclaré perdu, les 2 autres équipements encore détenus | IT |
| S19 | BON-2026-0019 | `draft` | Brouillon | Collaborateur à l'**adresse invalide** : l'envoi par email doit être refusé | IT |
| S20 | BON-2026-0020 | `active` | En cours (remise constatée sans signature) | Compagnon sans adresse, remise constatée sans signature | IT |
| S21 | BON-2026-0021 | `contested` | Contesté | Contestation ouverte depuis 9 jours, jamais prise en charge | IT ; `collaborateur` (Léa) |
| S22 | BON-2026-0022 | `active` | En cours | Karim (adresse invalide), remise signée au guichet | IT ; `collaborateur-karim` (portail) |

**Partage du banc entre testeurs** : les bons ci-dessus sont communs à tous. Un testeur qui **agit** sur une
situation (signe, renvoie un lien, clôture…) la fait disparaître pour les autres. Règle : chaque testeur **ne modifie
que les situations qui lui sont confiées** par l'orchestrateur ; pour tout autre geste, il **crée son propre bon**
(formulaire « Nouveau bon », collaborateur au choix) et le mène où il veut. Lire, filtrer, exporter : sans limite.

**À ne pas signaler** (artefacts connus du banc, pas des défauts de l'application) :
- Dans Mailpit, tous les emails sont datés du jour de l'amorçage, même ceux d'un bon daté de plusieurs mois.
- Comptes, filiales, articles et packs sont datés du jour de l'amorçage : seuls les bons, et ce qui s'y rattache
  (signatures, PDF, journal, emails journalisés), ont été reculés dans le temps.
- S08 : le PV a été émis le jour de l'amorçage et son lien expiré artificiellement une heure plus tard.
- Les comptes « annuaire » n'ont jamais été synchronisés avec un vrai annuaire (aucun annuaire sur le banc).
- Le rappel quotidien part à 9 h (heure de Paris) : un banc qui tourne à ce moment-là envoie de vrais rappels.

**Déjà connu, à signaler une seule fois (cosmétique)** : à l'ouverture de la page de connexion, `anomalies.json`
relève deux réponses 401 (`/api/auth/me`, `/api/auth/refresh`) et les erreurs de console associées : l'application
vérifie s'il existe déjà une session.

## 5. Chaque testeur a sa propre adresse client

Le backend plafonne certaines routes **par adresse client** (connexion, signature, cachet IT…). Tous les testeurs
travaillant depuis le même poste, ils partageraient ces plafonds et recevraient des erreurs 429 « Trop de
requêtes » qu'aucune équipe réelle ne verrait. Chaque testeur se présente donc avec **sa propre adresse**, dans
l'en-tête `CF-Connecting-IP`, que le nginx du banc accepte (réglage `TRUST_CF_CONNECTING_IP=1` de la pile).
Le gabarit s'en charge : l'adresse est dérivée du nom du testeur (`testeur: 'mobile-collab'` → `10.x.y.z`). Donnez
donc un **nom de testeur unique** par agent et par session. L'en-tête n'est posé que sur les requêtes vers le banc :
envoyé aussi aux polices Google (option `extraHTTPHeaders` de Playwright), il ferait échouer leur contrôle CORS et
l'application s'afficherait avec une police de secours. N'utilisez donc pas `extraHTTPHeaders` pour cet en-tête.

## 6. Lire un email et un lien de signature dans Mailpit

Interface : <http://localhost:8027>. API (JSON) :

| Besoin | Requête |
|---|---|
| Derniers messages | `GET http://localhost:8027/api/v1/messages?limit=50` |
| Messages d'un destinataire | `GET http://localhost:8027/api/v1/search?query=to:"lea.martin@recette.test"` |
| Messages d'un bon | filtrer les résultats sur `Subject` contenant `[BON-2026-0007]` |
| Contenu d'un message | `GET http://localhost:8027/api/v1/message/<ID>` → champs `HTML`, `Text`, `Subject`, `To` |
| Aperçu HTML | `http://localhost:8027/view/<ID>.html` |

Le lien de signature est dans le HTML : `http://localhost:8082/signer/<jeton>`. Il faut être **connecté avec le
compte du destinataire** pour signer à distance (connecté en IT, on signe « en présentiel » pour le compte du
collaborateur, ce qui n'est possible que pour un lien présentiel).

```js
const { lienDeSignature } = require('C:/Users/clemieux/Claude/BonDeMiseADisposition/e2e/recette/gabarit-testeur.cjs');
const chemin = await lienDeSignature('hugo.petit@recette.test', { reference: 'BON-2026-0007' }); // '/signer/…'
```

Ne videz pas la boîte Mailpit : elle est commune à tous les testeurs.

## 7. Gabarit Playwright (`e2e/recette/gabarit-testeur.cjs`)

Le gabarit lance **Chrome installé sur le poste** (`channel: 'chrome'`), **en fenêtre** (`headless: false`), avec un
léger ralenti (`slowMo: 150`). Le module Playwright est pris dans `e2e/node_modules`.

| Fonction | Rôle |
|---|---|
| `ouvrirSession({ testeur, profil, rapport })` | Ouvre Chrome et une session (adresse client propre au testeur) |
| `t.connecter('admin' \| 'technicien' \| 'technicien2' \| 'direction' \| 'collaborateur' \| 'collaborateur-hugo' \| 'collaborateur-karim' \| 'collaborateur-sophie')` | Connexion locale par rôle (ou `t.connecter(email, motDePasse)`) |
| `t.aller('/bons')` | Navigation relative à <http://localhost:8082> |
| `t.capture('nom')` | Capture **pleine page** numérotée dans `<rapport>/captures/NN-<profil>-nom.png` ; `{ pleinePage: false }` pour l'écran seul |
| `t.captureDefilee('nom')` | Pour les écrans IT, qui défilent dans un conteneur interne (la capture pleine page s'y arrête à la hauteur de l'écran) : une capture par écran, en descendant jusqu'en bas |
| `t.signer(zone?)` | Tracé sur le premier canevas de signature : souris sur bureau, **doigt** (événements tactiles) sur mobile |
| `t.lienDeSignature(adresse, { reference })` | Dernier lien `/signer/…` reçu dans Mailpit |
| `t.autreSession({ testeur, profil })` | Seconde session dans le même Chrome (ex. IT d'un côté, collaborateur de l'autre) |
| `t.page`, `t.contexte` | Objets Playwright, pour tout le reste |
| `t.fermer()` | Écrit `<rapport>/anomalies.json` (erreurs de console, exceptions, réponses HTTP ≥ 400, requêtes échouées, avec la capture qui les précède) et **ferme Chrome** |

Profils : `bureau-1440` (1440×900), `bureau-1280` (1280×800), `iphone13`, `iphone13-paysage`, `pixel7`,
`pixel7-paysage` (appareils Playwright : tactile, ratio de pixels, agent mobile).

Parcours prêt à copier (enregistrez-le dans votre dossier de travail, lancez `node parcours.cjs`) :

```js
'use strict';
const { ouvrirSession } = require('C:/Users/clemieux/Claude/BonDeMiseADisposition/e2e/recette/gabarit-testeur.cjs');

const RAPPORT = 'C:/Users/clemieux/.claude/jobs/<job>/tmp/refonte/recette/<vague>-<testeur>';

(async () => {
  const t = await ouvrirSession({ testeur: 'mobile-collab-lea', profil: 'iphone13', rapport: RAPPORT });
  try {
    await t.connecter('collaborateur');
    await t.capture('portail-accueil');
    await t.page.getByText('BON-2026-0004').first().click();
    await t.page.waitForLoadState('networkidle');
    await t.capture('portail-fiche-bon');

    // Même parcours en paysage, dans le même Chrome
    const paysage = await t.autreSession({ testeur: 'mobile-collab-lea-paysage', profil: 'iphone13-paysage' });
    await paysage.connecter('collaborateur');
    await paysage.capture('portail-accueil-paysage');
  } finally {
    const anomalies = await t.fermer();
    console.log(`${anomalies.length} anomalie(s) technique(s) relevée(s)`);
  }
})();
```

Démonstration rapide (connexion + une capture) :
`node e2e/recette/gabarit-testeur.cjs --profil pixel7 --role direction --rapport C:/…/demo`

Règles d'usage :
- **Au plus 4 Chrome ouverts en même temps** sur le poste (mémoire). Toujours finir par `t.fermer()` (bloc
  `finally`), même en cas d'erreur.
- Le mode sans fenêtre ne suffit pas : ce qui compte est ce qu'un utilisateur **voit**.
- Sur mobile, vérifier en particulier : aucun défilement horizontal de la page, cibles tactiles d'au moins 44 px,
  textes lisibles sans zoom, fenêtres et formulaires utilisables au doigt, portrait **et** paysage.

## 8. Regarder chaque capture

**Règle : ouvrez chaque capture avec l'outil de lecture d'image (Read) et regardez-la avant de conclure.** Un
parcours qui « passe » sans erreur peut afficher une page vide, un texte tronqué, un bouton hors écran, un tableau
qui déborde. Aucun constat ne se rédige sans avoir vu l'image ; aucun parcours ne se déclare réussi sans avoir vu
ses captures. Relisez aussi `anomalies.json` : une erreur de console ou une réponse 500 est un constat en soi.

## 9. Format du rapport

Un rapport par testeur, en français, dans le dossier de rapport (à côté de `captures/` et `anomalies.json`) :

```markdown
# Recette <vague> — <testeur> (<rôle>, <profil(s)>)

## Parcours joués
1. <parcours> — <bons utilisés> — résultat : conforme / constats n° …

## Constats
### [BLOQUANT | GÊNANT | COSMÉTIQUE] n° 1 — <titre court>
- Rôle et profil : technicien, pixel7-paysage
- Capture : captures/07-pixel7-paysage-fiche-bon.png
- Étapes de reproduction :
  1. Se connecter en technicien (`thomas.girard@recette.test`).
  2. Ouvrir BON-2026-0006.
  3. …
- Constaté : …
- Attendu : …

## Anomalies techniques (anomalies.json)
- <n> erreurs de console, <n> réponses HTTP ≥ 400 : <résumé, rattaché aux constats ci-dessus>
```

Gravité :
- **Bloquant** : l'utilisateur ne peut pas finir sa tâche (action impossible, erreur, donnée fausse ou perdue).
- **Gênant** : il y arrive, mais difficilement ou avec un risque d'erreur (libellé trompeur, action cachée,
  écran inutilisable au doigt, défilement horizontal, information manquante).
- **Cosmétique** : aspect sans effet sur la tâche (alignement, espacement, accent manquant, couleur).

## 10. Dépannage

- **Port 8082 ou 8027 déjà pris** : un banc tourne déjà (`docker ps --filter name=bmad-recette`) ; l'arrêter avec
  `recette-down.sh`.
- **« Banc partiellement amorcé »** : un amorçage a échoué en route ; `recette-down.sh` puis `recette-up.sh`.
- **La construction échoue** alors que le dernier commit est sain : l'arbre de travail contient des travaux en cours ;
  `recette-up.sh --sources HEAD`.
- **429 « Trop de requêtes »** : deux testeurs partagent le même nom de testeur, ou un script n'utilise pas le gabarit.
- **Journaux** : `docker compose -p bmad-recette -f e2e/recette/docker-compose.recette.yml logs backend`.

## 11. Pour qui maintient le banc

- `docker-compose.recette.yml` : la pile. `recette-up.sh` / `recette-down.sh` : démarrage et arrêt.
- `amorcage/amorcer.cjs` : l'amorçage. Rejouable : un amorçage allé à son terme marque la base (commentaire
  `bmad-recette : amorcage termine`) ; relancé sur un banc marqué, il n'ajoute rien, même si des testeurs y ont créé
  des bons, et réaffiche le bilan. Un banc non marqué mais non vide est refusé (amorçage interrompu).
  - `donnees/personnes.cjs` : tous les comptes (source unique) ; `donnees/referentiels.cjs` : filiales, catalogue,
    packs ; `donnees/situations.cjs` : les 22 situations ; `donnees/volume.cjs` : les 42 bons de volume (tirage à
    graine fixe).
  - `lib/actions.cjs` : **tous** les appels à l'API (référentiels, gestes métier dans l'ordre d'appels de
    l'interface, lectures de contrôle) ; `lib/client-api.cjs` : session, en-têtes, erreurs. **Si une route, une
    forme de réponse ou l'ordre des gestes change (vagues 2 et 3), ce sont les seuls fichiers à adapter** : chaque
    réponse lue y est contrôlée, et l'amorçage s'arrête sur un message qui le rappelle.
  - `lib/hors-api.cjs` : les gestes faits en SQL faute de route (comptes locaux et « annuaire », départ, mutation,
    lien expiré) ; à adapter si le schéma des tables `users` ou `signatures` change.
  - `etapes/phases.cjs` et `conteneur/decaler-temps.cjs` : le recul des dates. Les actions sont jouées en cinq phases
    (remise, signature de la remise, restitution, signature de la restitution, clôture) ; à la fin de chaque phase,
    les dates de ce que chaque bon a fait sont reculées du nombre de jours voulu par son scénario, dans toutes les
    tables rattachées à un bon (colonnes découvertes dans le schéma), les signatures sont rescellées et les PDF
    régénérés par l'application. Une étape qui produit un document non régénérable (PV encore à signer, clôture sans
    signature, avenant) doit rester à 0 jour : l'amorçage refuse sinon.
  - `etapes/verification.cjs` : contrôle final (statuts, références, intégrité des signatures).
