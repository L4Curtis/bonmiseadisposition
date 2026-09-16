# Changelog

Historique des évolutions notables de l'application. Les entrées les plus récentes sont en haut.

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
