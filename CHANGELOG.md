# Changelog

Historique des évolutions notables de l'application. Les entrées les plus récentes sont en haut.

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

### Documentation

- README : procédure de réinitialisation du mot de passe `admin@local` et de levée du verrou
  anti-brute-force depuis le serveur.

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
