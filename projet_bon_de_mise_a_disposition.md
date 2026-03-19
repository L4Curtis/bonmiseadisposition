# Plan de développement v2 — Application de gestion des bons de mise à disposition

## Contexte et objectifs

### Situation actuelle

L'équipe IT de Groupe Livio / Fresse GDO gère manuellement les bons de mise à disposition et de restitution de matériel informatique. Le processus actuel consiste à remplir un document Word avec les informations de l'équipement, le nom du collaborateur, la filiale, puis à l'imprimer pour signature physique. Ce fonctionnement pose plusieurs problèmes : traçabilité limitée, impossibilité de suivre les signatures en attente, pas de rappels automatiques, et difficulté à gérer les 14 filiales avec leurs logos respectifs.

### Objectif de l'application

Développer une application web interne permettant de créer, envoyer, signer électroniquement et archiver les bons de mise à disposition et de restitution de matériel IT, avec un dashboard de suivi complet pour l'IT et un portail collaborateur.

### Périmètre

- 14 filiales du groupe, chacune avec son logo et sa configuration (gérés dans le panel admin)
- Utilisateurs créateurs : équipe IT uniquement
- Signataires : tous les collaborateurs du groupe (authentifiés via SSO Entra ID pour vérifier l'identité)
- Portail collaborateur : chaque collaborateur peut consulter ses bons, télécharger les PDFs signés, et contester/commenter
- Toute la configuration (LDAP, Entra ID, SMTP, filiales, catalogue) est administrable via l'interface web
- Hébergement : Docker sur infrastructure interne, HTTPS via Nginx Proxy Manager

---

## Stack technique

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Backend** | NestJS (TypeScript) | Framework structuré, modules, guards, injectable — parfait pour une app métier avec auth complexe |
| **Frontend** | React + TypeScript + Vite | SPA rapide, écosystème riche pour les composants (canvas signature, tableaux, formulaires) |
| **Base de données** | PostgreSQL 16 | Relationnel robuste, JSON natif pour les métadonnées flexibles, excellent support Prisma |
| **ORM** | Prisma | Typage fort, migrations versionnées, introspection facile |
| **Auth SSO** | MSAL (Microsoft Entra ID) via OIDC | Tenant hybride existant, SSO pour IT + vérification identité signataires |
| **LDAP** | ldapjs | Récupération des infos collaborateurs (nom, email, filiale, service) depuis l'AD on-prem |
| **Envoi email** | Nodemailer (SMTP) ou Microsoft Graph API | Configurable dans l'admin : SMTP classique (port 25/465/587) ou Graph API OAuth2 |
| **Génération PDF** | Puppeteer (headless Chrome) | Rendu fidèle au template Word actuel, support images/logos, CSS complet |
| **Signature dessinée** | Canvas HTML5 natif | Canvas HTML5, export PNG, tactile + souris — pas de librairie externe (react-signature-canvas écarté : conflits React 18 StrictMode) |
| **UI Components** | shadcn/ui + Tailwind CSS | Composants accessibles, personnalisables, design propre |
| **Containerisation** | Docker Compose | Frontend (Nginx) + Backend (Node) + PostgreSQL + volumes persistants |
| **Reverse proxy** | Nginx Proxy Manager | HTTPS Let's Encrypt ou certificat interne, déjà en place |
| **Scheduler** | @nestjs/schedule (cron) | Rappels automatiques, nettoyage tokens expirés, sync LDAP |

---

## Architecture applicative

### Modules backend (NestJS)

**ConfigModule** — Configuration centralisée en base de données

Toute la configuration sensible est stockée en base PostgreSQL, chiffrée (AES-256-GCM), et éditable via le panel admin. Aucun redémarrage de l'application n'est nécessaire après modification.

Configurations gérées :
- **LDAP / LDAPS** : URL du serveur (choix LDAP port 389 ou LDAPS port 636), bind DN, bind password, search base, filtre utilisateurs, attributs à synchroniser, fréquence de sync
- **Entra ID (SSO)** : tenant ID, client ID, client secret, redirect URI, groupes mappés vers les rôles
- **SMTP / Email** : choix du mode (SMTP classique ou Microsoft Graph API), serveur SMTP, port, TLS/SSL/STARTTLS, identifiants, ou bien client ID/secret Graph API. Choix de l'adresse email d'envoi (From)
- **Rappels** : délais configurables (par défaut J+3, J+7, J+14), activation/désactivation, texte personnalisable des emails
- **Tokens de signature** : durée d'expiration configurable (par défaut 30 jours, synchronisée avec les rappels — voir section dédiée)
- **Général** : nom de l'application, URL publique, fuseau horaire

Le module expose un service injectable `ConfigService` qui charge les valeurs depuis la base avec un cache en mémoire (TTL 5 min), rafraîchi automatiquement après chaque modification via l'admin.

Test de connexion intégré : boutons "Tester la connexion LDAP", "Tester l'envoi d'un email", "Tester la connexion Entra ID" directement dans l'interface admin pour valider la configuration avant de sauvegarder.

**AuthModule** — Authentification et autorisation

Deux flux d'authentification distincts :

1. **Flux IT (complet)** : SSO Entra ID → accès au dashboard IT, création de bons, administration. Les groupes Entra/AD sont mappés vers les rôles applicatifs (configurable dans l'admin).
2. **Flux collaborateur (signature + portail)** : SSO Entra ID → vérifie que l'email du compte Microsoft correspond à l'email défini sur le bon. Si correspondance → accès autorisé à la page de signature + au portail collaborateur personnel. Si non-correspondance → refus avec message d'erreur.

JWT access token (15 min) + refresh token (8h) en httpOnly cookie secure. Guards NestJS par rôle : `admin`, `technician`, `collaborator`.

**UsersModule** — Gestion des utilisateurs et synchronisation LDAP

- Synchronisation périodique (fréquence configurable dans l'admin, par défaut toutes les 6h) des utilisateurs depuis l'AD via LDAP ou LDAPS (choix dans l'admin)
- Champs synchronisés : displayName, mail, department, company (filiale), title, sAMAccountName
- Cache local en base PostgreSQL pour éviter les requêtes LDAP à chaque recherche
- Association automatique filiale ↔ collaborateur via le champ `company` de l'AD et le nom de filiale configuré dans l'admin
- Recherche autocomplete côté frontend pour sélectionner un collaborateur lors de la création d'un bon
- Possibilité de forcer une re-sync manuelle depuis l'interface admin
- Indicateur de statut de la dernière synchronisation (succès/échec/date) visible dans l'admin

**BonsModule** — Cœur métier : gestion des bons

- CRUD complet : créer, lire, mettre à jour, supprimer (soft delete)
- Workflow d'états : `draft` → `sent_mise_dispo` → `active` → `sent_restitution` → `archived` (+ `cancelled` à tout moment sauf archivé)
- **Visibilité** : chaque bon n'est visible que par le collaborateur assigné (identifié par son adresse email LDAP) et par l'équipe IT. Un collaborateur ne voit jamais les bons d'un autre collaborateur.
- Historique de toutes les actions (audit trail) : qui a fait quoi et quand, avec email si SSO
- Filtres et recherche côté IT : par filiale, par statut, par collaborateur, par date

**EquipmentModule** — Catalogue de matériel, packs et saisie libre

Catalogue de modèles prédéfinis :
- Chaque item : catégorie (PC portable, PC fixe, écran, souris, clavier, casque, téléphone, housse, dock, câble, autre), marque, modèle, description
- Administration complète via le panel admin (CRUD)

Packs d'équipements (globaux, communs à toutes les filiales) :
- Un pack regroupe plusieurs items du catalogue sous un nom (ex: "Pack nouveau collaborateur" = PC portable + souris + housse + dock)
- Lors de la création d'un bon, le technicien peut sélectionner un pack → tous les items sont ajoutés d'un coup
- Les items d'un pack peuvent être retirés individuellement après ajout
- CRUD des packs dans l'admin

Saisie libre :
- Toujours disponible en complément : champ texte libre pour un équipement non référencé dans le catalogue
- Possibilité d'ajouter un numéro de série et un numéro d'inventaire sur chaque ligne (catalogue ou libre)

**SignatureModule** — Signature électronique avec vérification d'identité

Processus de signature (mise à disposition et restitution) :

1. Le technicien envoie le bon → un token unique est généré (UUID v4 + hash SHA-256)
2. Le collaborateur reçoit un email avec un lien contenant le token
3. En cliquant sur le lien, le collaborateur est redirigé vers la page de signature
4. **Vérification d'identité obligatoire** : le collaborateur doit s'authentifier via SSO Entra ID. L'application vérifie que l'adresse email du compte Entra correspond à l'email du collaborateur sur le bon. Si non-correspondance → accès refusé.
5. Une fois authentifié, le collaborateur voit le bon, coche "Lu et approuvé", dessine sa signature, et valide
6. Données capturées à la signature : image signature (PNG base64), adresse email Entra vérifiée, IP du signataire, user-agent, date/heure, géolocalisation optionnelle

**Cachet IT intégré dans les actions** :
- Avant chaque action IT (Envoyer / Présentiel / Initier restitution / Restitution présentielle), une modal de signature s'ouvre pour que le technicien appose son cachet
- Le cachet est stocké comme une `Signature` de type `it_cachet` avec `pdfType` explicite (`mise_disposition` ou `restitution`)
- Seule une fois le cachet apposé, l'action est enchaînée automatiquement (envoi email ou affichage lien présentiel)
- Les PNG de signature sont chiffrés AES-256-GCM sur disque

**Mode signature en présentiel (mise à disposition ET restitution)** :
- Disponible pour les deux types (pas seulement la restitution)
- Cas d'usage : collaborateur sur place ou compte email désactivé (restitution)
- Le technicien clique "Présentiel" ou "Restitution présentielle" → appose son cachet IT d'abord → un lien tokenisé est généré et affiché (pas d'email)
- Le collaborateur ouvre le lien sur le même appareil ou un écran partagé et signe
- Loggé avec mention "présentiel" (`isInPerson = true`), identité du technicien initiateur
- Vérification email ignorée en mode présentiel

Synchronisation tokens / rappels :
- La durée d'expiration du token est configurable dans l'admin (par défaut 30 jours)
- Le dernier rappel configuré doit toujours être envoyé AVANT l'expiration du token
- Validation automatique dans l'admin : si les rappels sont à J+3, J+7, J+14 et le token expire à J+7, l'admin affiche un avertissement "Le token expire avant le dernier rappel"
- Si un token expire alors qu'il y a encore des rappels planifiés → le système régénère automatiquement un nouveau token et met à jour le lien (le collaborateur reçoit le nouveau lien au prochain rappel)

**PdfModule** — Génération des bons en PDF

- Template HTML/CSS fidèle au document Word actuel
- Logo dynamique par filiale (chargé depuis la config filiale en base / stockage)
- Données injectées : nom entreprise (filiale), civilité + nom collaborateur, liste équipements (depuis catalogue/pack/libre), date, signatures
- Deux exemplaires sur la page (entreprise + collaborateur) comme dans le Word actuel
- Zone de signature : vide avant signature, puis remplie avec l'image de la signature dessinée + date + mention "Lu et approuvé"
- Zone cachet/signature du service IT (image uploadable par filiale dans l'admin)
- Export PDF via Puppeteer headless
- PDF accessible en téléchargement par le collaborateur concerné via son portail

**NotificationModule** — Emails et rappels

- Mode d'envoi configurable dans l'admin : SMTP classique (avec choix TLS/SSL/STARTTLS, port, serveur) ou Microsoft Graph API (OAuth2 client credentials)
- Adresse email d'envoi (From) configurable dans l'admin
- Templates email en HTML responsive : demande de signature mise à disposition, demande de signature restitution, confirmation de signature, rappels, contestation reçue
- Rappels automatiques : délais configurables dans l'admin (par défaut J+3, J+7, J+14)
- Synchronisation avec l'expiration des tokens (voir SignatureModule)
- Possibilité de renvoyer manuellement un lien depuis le dashboard IT
- Log de tous les emails envoyés (date, destinataire, type, statut, erreur éventuelle)

**FilialesModule** — Configuration multi-filiales (via admin)

- CRUD des filiales dans le panel admin : nom officiel, nom d'affichage (utilisé sur le bon), logo (upload image), cachet/signature SI (upload), adresse, SIRET
- Le nom de filiale est utilisé pour le mappage automatique avec le champ `company` de l'AD
- Lors de la création d'un bon, la filiale est sélectionnée → le logo et le nom correct apparaissent sur le bon et le PDF
- Activation/désactivation d'une filiale

**DashboardModule** — Tableaux de bord IT + collaborateur

Dashboard IT (techniciens et admins) :
- Cartes récapitulatives : bons en attente de signature, bons signés ce mois, bons en retard, total actifs
- Tableau principal : liste de tous les bons avec colonnes (référence, collaborateur, filiale, statut, date, actions)
- Filtres : filiale, statut, période, recherche texte
- Code couleur sur les statuts : vert = signé, orange = en attente, rouge = en retard
- Actions rapides : voir détails, renvoyer rappel, initier restitution, signature en présentiel, archiver
- Export CSV/Excel des données pour reporting

Portail collaborateur (via SSO Entra ID) :
- Le collaborateur se connecte avec son compte Microsoft
- Il ne voit QUE ses propres bons (filtrés par son adresse email)
- Vue liste : ses bons avec statut (en attente de signature, signé, matériel actif, restitué, archivé)
- Actions : télécharger le PDF signé, signer un bon en attente, contester un bon (formulaire avec commentaire)
- Contestation : le collaborateur peut signaler un problème sur un bon (équipement incorrect, matériel jamais reçu, etc.) → une notification est envoyée au technicien créateur → le technicien traite la contestation dans le dashboard IT

**AuditModule** — Logs et traçabilité

- Toutes les actions critiques sont loguées : création de bon, envoi de signature, signature effectuée, rappels envoyés, modifications, contestations, archivage
- Données capturées par log : action, date/heure, IP, user-agent, **adresse email** (récupérée via SSO Entra ID quand disponible), user ID interne, détails (JSONB)
- Pour les signatures en présentiel : log du technicien qui a initié + mention "présentiel"
- Consultable dans le panel admin avec filtres (par bon, par utilisateur, par date, par type d'action)

---

## Modèle de données (PostgreSQL)

### Tables principales

**app_config** (configuration centralisée, chiffrée)
- `id` (UUID, PK)
- `category` (VARCHAR) — ldap, entra, smtp, rappels, tokens, general
- `key` (VARCHAR) — ex: ldap_url, ldap_use_ssl, smtp_host, entra_client_id...
- `value` (TEXT) — chiffré AES-256-GCM pour les valeurs sensibles (passwords, secrets)
- `encrypted` (BOOLEAN) — indique si la valeur est chiffrée
- `description` (VARCHAR, nullable) — aide contextuelle affichée dans l'admin
- `updated_at` (TIMESTAMP)
- `updated_by_id` (UUID, FK → users, nullable)
- Contrainte UNIQUE sur (category, key)

**filiales**
- `id` (UUID, PK)
- `name` (VARCHAR) — nom officiel (utilisé pour le mappage AD company)
- `display_name` (VARCHAR) — nom affiché sur le bon
- `logo_path` (VARCHAR, nullable) — chemin du fichier logo
- `stamp_path` (VARCHAR, nullable) — chemin cachet/signature SI
- `address` (TEXT, nullable)
- `siret` (VARCHAR, nullable)
- `active` (BOOLEAN, default true)
- `created_at`, `updated_at` (TIMESTAMP)

**users** (synchronisés depuis LDAP)
- `id` (UUID, PK)
- `sam_account_name` (VARCHAR, unique)
- `display_name` (VARCHAR)
- `email` (VARCHAR)
- `department` (VARCHAR, nullable)
- `company` (VARCHAR) — nom filiale AD
- `title` (VARCHAR, nullable) — poste
- `filiale_id` (UUID, FK → filiales, nullable) — associé via le champ company
- `is_it_staff` (BOOLEAN, default false) — peut accéder au dashboard IT
- `role` (ENUM: admin, technician, collaborator, default collaborator)
- `last_ldap_sync` (TIMESTAMP)
- `active` (BOOLEAN)
- `created_at`, `updated_at`

**equipment_catalog** (modèles prédéfinis)
- `id` (UUID, PK)
- `category` (ENUM: pc_portable, pc_fixe, ecran, souris, clavier, casque, telephone, housse, dock, cable, autre)
- `brand` (VARCHAR) — ex: Lenovo, Logitech
- `model` (VARCHAR) — ex: ThinkBook 16 G6 IRL
- `description` (TEXT, nullable)
- `active` (BOOLEAN)
- `created_at`, `updated_at`

**equipment_packs** (packs globaux)
- `id` (UUID, PK)
- `name` (VARCHAR) — ex: "Pack nouveau collaborateur"
- `description` (TEXT, nullable)
- `active` (BOOLEAN)
- `created_at`, `updated_at`

**equipment_pack_items** (items d'un pack)
- `id` (UUID, PK)
- `pack_id` (UUID, FK → equipment_packs)
- `catalog_item_id` (UUID, FK → equipment_catalog)
- `quantity` (INT, default 1)
- `order` (INT) — ordre d'affichage

**bons**
- `id` (UUID, PK)
- `reference` (VARCHAR, unique) — numéro auto-généré ex: BON-2026-0042
- `filiale_id` (UUID, FK → filiales)
- `collaborateur_id` (UUID, FK → users)
- `collaborateur_email` (VARCHAR) — email au moment de la création (snapshot, car le LDAP peut changer)
- `created_by_id` (UUID, FK → users) — technicien IT créateur
- `civilite` (ENUM: mme, mr)
- `status` (ENUM: draft, sent_mise_dispo, active, sent_restitution, archived, cancelled, contested) — workflow simplifié (pas d'état intermédiaire signed) + contested pour les contestations collaborateur
- `date_mise_disposition` (DATE)
- `date_restitution` (DATE, nullable)
- `notes` (TEXT, nullable) — commentaires internes IT
- `pdf_mise_dispo_snapshot` (BYTES, nullable) — snapshot PDF immuable post-signature (stocké en DB, pas sur disque)
- `pdf_mise_dispo_snapshot_at` (TIMESTAMP, nullable)
- `pdf_restitution_snapshot` (BYTES, nullable) — snapshot PDF restitution
- `pdf_restitution_snapshot_at` (TIMESTAMP, nullable)
- `created_at`, `updated_at`

**bon_equipments** (équipements d'un bon)
- `id` (UUID, PK)
- `bon_id` (UUID, FK → bons)
- `catalog_item_id` (UUID, FK → equipment_catalog, nullable) — si depuis le catalogue
- `custom_label` (VARCHAR, nullable) — si saisie libre
- `serial_number` (VARCHAR, nullable)
- `inventory_number` (VARCHAR, nullable)
- `notes` (VARCHAR, nullable)
- `order` (INT) — ordre d'affichage
- `created_at`

**signatures**
- `id` (UUID, PK)
- `bon_id` (UUID, FK → bons)
- `type` (ENUM: mise_disposition, restitution, it_cachet) — `it_cachet` = cachet du technicien IT avant chaque action
- `token` (VARCHAR, unique) — UUID v4, lien email ou présentiel
- `token_expires_at` (TIMESTAMP) — défaut 7 jours
- `signed` (BOOLEAN, default false)
- `signature_image_path` (VARCHAR, nullable) — chemin relatif fichier `.enc` (AES-256-GCM dans `data/signatures/`)
- `signed_at` (TIMESTAMP, nullable)
- `signer_email` (VARCHAR, nullable) — email vérifié via SSO Entra ID
- `signer_ip` (VARCHAR, nullable)
- `signer_user_agent` (TEXT, nullable)
- `mention_lu_approuve` (BOOLEAN, default false)
- `is_in_person` (BOOLEAN, default false) — présentiel (vérification email ignorée)
- `initiated_by_id` (UUID, FK → users, nullable) — technicien initiateur si présentiel
- `created_at`

**contestations** (contestations collaborateur)
- `id` (UUID, PK)
- `bon_id` (UUID, FK → bons)
- `user_id` (UUID, FK → users) — collaborateur qui conteste
- `message` (TEXT) — motif de la contestation
- `status` (ENUM: open, in_review, resolved, rejected)
- `resolved_by_id` (UUID, FK → users, nullable) — technicien qui traite
- `resolution_message` (TEXT, nullable)
- `created_at`, `updated_at`

**notification_logs**
- `id` (UUID, PK)
- `bon_id` (UUID, FK → bons)
- `recipient_email` (VARCHAR)
- `type` (ENUM: mise_dispo_request, restitution_request, reminder, confirmation, contestation_alert)
- `sent_at` (TIMESTAMP)
- `status` (ENUM: sent, failed, bounced)
- `error_message` (TEXT, nullable)
- `reminder_number` (INT, nullable) — 1er, 2ème, 3ème rappel

**audit_logs**
- `id` (UUID, PK)
- `bon_id` (UUID, FK → bons, nullable)
- `user_id` (UUID, FK → users, nullable)
- `user_email` (VARCHAR, nullable) — email récupéré via SSO au moment de l'action
- `action` (VARCHAR) — ex: bon_created, signature_sent, bon_signed, bon_signed_in_person, reminder_sent, contestation_opened, config_updated
- `details` (JSONB) — métadonnées de l'action
- `ip_address` (VARCHAR, nullable)
- `user_agent` (TEXT, nullable)
- `created_at` (TIMESTAMP)

---

## Sécurité

### Authentification et autorisation

- **SSO Entra ID (OIDC)** pour tous les accès à l'application : équipe IT ET collaborateurs. Configuration (tenant ID, client ID, secret, redirect URI) stockée en base, modifiable dans l'admin.
- **Vérification d'identité à la signature** : le collaborateur doit se connecter via SSO Entra ID. L'email du compte Entra doit correspondre à l'email du bon. Cette vérification garantit que c'est bien la bonne personne qui signe.
- **Mode présentiel** : exception contrôlée pour la restitution quand le compte email est désactivé. Tracé dans les logs avec le technicien responsable.
- **Mappage de groupes** configurable dans l'admin : association groupe Entra/AD → rôle applicatif (admin, technician, collaborator).
- **JWT** : access token 15 min, refresh token 8h, stockage httpOnly cookie secure.
- **Visibilité des bons** : un collaborateur ne voit que ses propres bons (filtrés par email). L'équipe IT voit tous les bons.

### Sécurisation de l'application

- **HTTPS obligatoire** via Nginx Proxy Manager
- **CORS** restreint au domaine de l'application
- **Rate limiting** sur les endpoints de signature : max 10 tentatives par IP/minute
- **Helmet.js** pour les headers de sécurité (CSP, HSTS, X-Frame-Options)
- **Validation des inputs** : class-validator sur tous les DTOs NestJS
- **Sanitization** : protection XSS sur tous les champs texte
- **Audit trail complet** : toutes les actions loguées avec IP, user-agent, email SSO, timestamp
- **Chiffrement au repos** : images de signature chiffrées AES-256-GCM, configuration sensible chiffrée en base
- **LDAP ou LDAPS** : choix dans l'admin (LDAPS fortement recommandé, avertissement affiché si LDAP est sélectionné)
- **Clé de chiffrement maître** : seule variable d'environnement requise (`ENCRYPTION_KEY`), utilisée pour chiffrer/déchiffrer les valeurs sensibles en base

### Sécurisation Docker

- Images basées sur `node:20-alpine` (surface d'attaque minimale)
- Conteneurs en utilisateur non-root
- Volumes nommés pour la persistance (PDFs, logos, signatures)
- Réseau Docker interne entre les conteneurs (PostgreSQL non exposé)
- Healthchecks sur chaque conteneur

---

## Workflow détaillé

### Mise à disposition (création + signature)

1. Le technicien IT se connecte via SSO Entra ID
2. Il clique "Nouveau bon" → formulaire de création
3. Il sélectionne la filiale (liste issue de l'admin, avec preview du logo)
4. Il recherche le collaborateur (autocomplete depuis le cache LDAP → nom, email, service)
5. Il choisit la civilité (Mr./Mme.)
6. Il ajoute les équipements : depuis un pack (tous les items ajoutés d'un coup, modifiables individuellement), depuis le catalogue (autocomplete), ou en saisie libre. Numéro de série/inventaire optionnel par ligne.
7. Il définit la date de mise à disposition
8. Il clique "Envoyer" → **modal cachet IT** → IT trace sa signature → "Apposer et continuer"
9. `POST /bons/:id/sign-it { pdfType: 'mise_disposition' }` → cachet IT enregistré (type `it_cachet`)
10. `POST /bons/:id/send` → statut `sent_mise_dispo`, email avec lien tokenisé envoyé au collaborateur
11. Le collaborateur clique sur le lien → **redirection vers SSO Entra ID**
12. **Vérification d'identité** : l'email du compte Entra est comparé à l'email du bon. Si correspondance → accès. Sinon → page d'erreur.
13. Le collaborateur voit le bon, coche "Lu et approuvé", dessine sa signature, valide
14. Données enregistrées : PNG chiffré sur disque (`data/signatures/*.enc`), email vérifié, IP, user-agent, date/heure
15. Snapshot PDF généré en arrière-plan (Puppeteer → `Bytes` en DB)
16. Le statut passe à `active`

### Restitution — deux voies

**Voie 1 : Restitution par email (compte actif)**

1. Le technicien retrouve le bon actif dans le dashboard
2. Il clique "Initier restitution" → **modal cachet IT (pdfType=restitution)** → IT signe
3. `POST /bons/:id/sign-it { pdfType: 'restitution' }` → cachet IT restitution enregistré
4. `POST /bons/:id/initiate-restitution` → statut `sent_restitution`, email envoyé au collaborateur
5. Le collaborateur s'authentifie via SSO (même vérification d'identité)
6. Il signe la restitution → statut `archived`, snapshot PDF restitution généré en DB

**Voie 2 : Présentiel (mise à disposition ou restitution)**

1. Disponible pour les deux types (pas seulement la restitution)
2. Le technicien clique "Présentiel" ou "Restitution présentielle" → **modal cachet IT** → IT signe
3. `POST /bons/:id/initiate-inperson` → retourne `{bon, token}` sans envoyer d'email
4. Un lien est affiché → le collaborateur l'ouvre sur le même écran ou un autre appareil
5. SSO obligatoire mais vérification email ignorée (`isInPerson = true`)
6. Loggé avec mention "présentiel", identité du technicien initiateur

### Rappels automatiques (synchronisés avec les tokens)

- Cron job vérifie les bons en attente de signature selon les délais configurés dans l'admin
- Par défaut : J+3, J+7, J+14 (modifiable)
- **Synchronisation token/rappels** : le token de signature a une durée de vie configurable (par défaut 30 jours). L'admin affiche un avertissement si le dernier rappel est après l'expiration du token. Si un token expire avec des rappels restants, un nouveau token est auto-généré et le nouveau lien est envoyé au prochain rappel.
- Au-delà du dernier rappel : le bon apparaît en rouge dans le dashboard IT
- Renvoi manuel possible depuis le dashboard (régénère un nouveau token si expiré)

### Contestation (portail collaborateur)

1. Le collaborateur se connecte via SSO Entra ID
2. Il voit ses bons dans son portail personnel
3. Sur un bon, il clique "Contester" → formulaire avec champ commentaire (ex: "Je n'ai jamais reçu cette souris")
4. Le statut du bon passe à `contested`
5. Une notification est envoyée au technicien créateur du bon
6. Le technicien traite la contestation dans le dashboard : il peut la résoudre (modifier le bon, archiver) ou la rejeter avec un commentaire
7. Le collaborateur est notifié de la résolution

---

## Interface utilisateur (pages principales)

### Login

- Bouton "Se connecter avec Microsoft" (SSO Entra ID)
- Redirection automatique vers le bon dashboard selon le rôle (IT ou collaborateur)

### Dashboard IT (techniciens et admins)

- Cartes récapitulatives : bons en attente, bons signés ce mois, bons en retard, contestations ouvertes, total actifs
- Tableau principal avec tri/filtre : référence, collaborateur, filiale, statut, date, actions
- Filtres : filiale, statut, période, recherche texte
- Code couleur statuts : vert = signé/archivé, orange = en attente, rouge = en retard/contesté
- Actions rapides : voir détails, renvoyer rappel, initier restitution, signature en présentiel, archiver
- Export CSV/Excel

### Portail collaborateur

- Liste de ses bons personnels (email vérifié via SSO)
- Statuts visuels : en attente de signature, signé, matériel actif, restitué, archivé
- Bouton "Signer" sur les bons en attente (redirige vers la page de signature)
- Bouton "Télécharger le PDF" sur les bons signés
- Bouton "Contester" avec formulaire de commentaire
- Historique des contestations et leur résolution

### Création de bon

- Sélecteur de filiale avec preview du logo
- Recherche collaborateur (autocomplete LDAP : nom, email, service)
- Sélecteur de civilité
- Zone équipements : bouton "Ajouter un pack" (sélection d'un pack → items ajoutés), bouton "Ajouter depuis le catalogue" (autocomplete), bouton "Ajouter en saisie libre"
- Chaque ligne : label, marque/modèle (si catalogue), numéro de série, numéro inventaire, bouton supprimer
- Date de mise à disposition
- Notes internes IT (optionnel)
- Prévisualisation PDF
- Boutons : Enregistrer en brouillon / Envoyer pour signature

### Page de signature

- Accès via lien email → **SSO Entra ID obligatoire** (vérification email)
- Design épuré, logo de la filiale en en-tête
- Affichage du bon complet (identique au PDF)
- Mention légale de propriété et engagement de restitution
- Case à cocher "Lu et approuvé"
- Canvas de signature (responsive, fonctionne au doigt sur mobile et à la souris)
- Bouton "Signer" (disabled tant que case non cochée et signature vide)
- Page de confirmation après signature avec lien vers le portail

### Panel administration

**Configuration système :**
- LDAP/LDAPS : URL, port, SSL/TLS, bind DN, mot de passe, search base, filtre, fréquence sync + bouton test
- Entra ID : tenant ID, client ID, client secret, redirect URI, mappage groupes → rôles + bouton test
- SMTP/Email : choix SMTP ou Graph API, serveur, port, TLS/SSL/STARTTLS, identifiants, adresse From + bouton test
- Rappels : délais, activation, textes email
- Tokens : durée d'expiration + avertissement si désynchronisé avec les rappels

**Gestion des filiales :**
- Liste des filiales avec CRUD
- Upload logo + upload cachet IT
- Nom officiel (mappage AD) + nom d'affichage (sur le bon)

**Catalogue d'équipements :**
- Liste des items avec CRUD (catégorie, marque, modèle)
- Gestion des packs : créer un pack, y ajouter des items du catalogue, définir les quantités

**Logs d'audit :**
- Tableau avec filtres (par bon, par utilisateur, par email, par date, par type d'action)
- Détails JSONB consultables

**Synchronisation LDAP :**
- Statut de la dernière sync (date, succès/échec, nombre d'utilisateurs synchronisés)
- Bouton re-sync manuelle

---

## Planning de développement (réel — 5 phases doc)

> Le plan v2 initial prévoyait 8 phases. En pratique les phases 3 à 6 ont été fusionnées en une seule phase de livraison continue. Le planning ci-dessous reflète l'avancement réel.

### ✅ Phase 1 — Fondations (TERMINÉE)

- Monorepo NestJS + React + Docker Compose
- PostgreSQL 16 + Prisma (schéma complet 13 modèles)
- ConfigModule : chiffrement AES-256-GCM, cache 5 min
- AuthModule : SSO Entra ID via MSAL, JWT httpOnly cookie (access 15 min / refresh 8h)
- Guards rôle (admin, technician, collaborator), decorators `@Roles`, `@CurrentUser`
- Auth locale : `admin@local` / `admin` (bcrypt), créée au démarrage si absente en DB
- Setup wizard supprimé → remplacé par compte local par défaut
- Layout frontend : sidebar par rôle, header, routing protégé
- `GET /api/auth/dev-login` (DEV uniquement)
- ⚠️ Entra ID : "Token configuration → Add groups claim → Security groups → ID token" obligatoire pour le mapping des rôles

### ✅ Phase 2 — Administration et données de base (TERMINÉE)

- AdminModule : config LDAP / Entra ID / SMTP (lecture, écriture, tests)
- LdapModule : sync LDAP/LDAPS, cron 6h, `entry.attributes` (array lowercase), filtre domaines non-routables, diagnostic logging, purge utilisateurs
- FilialesModule : CRUD + upload logo/cachet (Multer, diskStorage dans `data/uploads/`)
- EquipmentModule : catalogue (catégories prédéfinies) + packs globaux (recherche client-side)
- UsersModule : liste, recherche autocomplete (debounce 300ms)
- Panel admin complet : Configuration, LDAP sync, Filiales, Catalogue, Utilisateurs
- SMTP test avec envoi email réel (`SmtpTestButton`)

### ✅ Phase 3 — Cœur métier, PDF, Signature, Notifications, Portail (TERMINÉE)

Couvre les phases 3-6 du plan v2 initial.

- **BonsModule** : CRUD complet, workflow 6 statuts (draft → sent_mise_dispo → active → sent_restitution → archived / cancelled)
- **PdfModule** : Puppeteer headless, snapshots immuables stockés en `Bytes` PostgreSQL (pas sur disque), un snapshot par type (mise_disposition / restitution)
- **SignatureModule** : tokens UUID, chiffrement PNG AES-256-GCM, cachet IT intégré aux actions, mode présentiel (mise_disposition ET restitution), audit log complet
- **NotificationModule** : SMTP, templates HTML, cron rappels lun-ven 9h, logs en DB
- **SignaturePage** : canvas HTML5 natif (pas de librairie externe), souris + touch, SSO obligatoire, `returnTo` cookie
- **PortailCollaborateur** : bons personnels par email, à signer / en cours / historique
- Cachet IT intégré : modal avant chaque action (Envoyer, Présentiel, Initier restitution, Restitution présentielle)
- PDF par étape : snapshot correct selon le type + bouton PDF par ligne de signature dans BonDetail

### ✅ Phase 4 — Dashboard IT enrichi, Audit, Export CSV (TERMINÉE)

- Dashboard IT : stats enrichies (archivés ce mois, par filiale), actions rapides, code couleur
- AuditModule : `GET /api/audit` paginé avec filtres (action, bon, user, date)
- Page Logs d'audit : tableau réel avec filtres dans l'admin
- Export CSV : `GET /api/bons/export` + bouton dans BonsList

### ✅ Phase 5 — Sécurisation et déploiement (TERMINÉE)

- Rate limiting `@nestjs/throttler` : 10 req/60s sur endpoints signature + Nginx `sign_limit`
- Contestations collaborateur : modal motif + workflow open→in_review→resolved/rejected + emails IT + emails collab
- Renvoi manuel d'un lien depuis BonDetail (régénération token, bouton IT uniquement)
- ContestationModule : service + controller + routes REST complètes
- Page admin `/admin/contestations` : tableau paginé + filtres statuts + actions Prendre en charge / Traiter
- Docker Compose production : `docker-compose.prod.yml` avec Nginx reverse proxy HTTPS
- Nginx : certificat TLS interne, rate limiting réseau, headers sécurité, redirect HTTP→HTTPS
- `.env.example` : template des secrets de déploiement

---

## Infrastructure de déploiement

### Docker Compose (production)

```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:80"]
    depends_on: [backend]

  backend:
    build: ./backend
    ports: ["4000:4000"]
    environment:
      - DATABASE_URL=postgresql://app:xxx@db:5432/bons_disposition
      - ENCRYPTION_KEY=xxx  # Seul secret en env — tout le reste est en base chiffrée
      - NODE_ENV=production
    depends_on: [db]
    volumes:
      - data:/app/data  # PDFs, logos, signatures

  db:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=bons_disposition
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=xxx
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 10s

volumes:
  data:
  pgdata:
```

Note : toute la configuration (LDAP, Entra ID, SMTP, rappels) est en base de données, chiffrée avec `ENCRYPTION_KEY`. Seules 3 variables d'environnement sont nécessaires : `DATABASE_URL`, `ENCRYPTION_KEY`, `NODE_ENV`.

### Premier démarrage (setup wizard)

Au premier lancement, si la table `app_config` est vide, l'application affiche un assistant de configuration initial :
1. Création du compte admin (ou connexion SSO si Entra ID est déjà configuré)
2. Configuration LDAP/LDAPS + test de connexion
3. Configuration Entra ID + test
4. Configuration SMTP/Email + test
5. Création de la première filiale (nom + logo)
6. L'application est prête

### Accès réseau

- L'application est exposée uniquement en interne via Nginx Proxy Manager
- FQDN suggéré : `bons.peduzzi.local` ou `bons.groupe-livio.local`
- Le backend doit pouvoir joindre : AD on-prem (LDAP 389 ou LDAPS 636 selon config), Entra ID (Internet HTTPS 443), Exchange Online / Graph API ou serveur SMTP (selon config)
- PostgreSQL n'est pas exposé en dehors du réseau Docker

### Prérequis à préparer en amont

**Côté Entra ID / Azure AD :**
1. Enregistrer une application (App Registration) : type Web, redirect URI vers l'app, flux Authorization Code avec PKCE
2. Permissions API : `User.Read`, `openid`, `profile`, `email`
3. Si Graph API pour les emails : permission application `Mail.Send` avec consentement admin
4. Configurer le token pour inclure les groupes dans les claims
5. Créer les groupes de sécurité pour les rôles (admin, technician)

**Côté AD on-prem :**
1. Compte de service LDAP avec lecture seule
2. S'assurer que LDAPS fonctionne si choisi (certificat sur le DC)

**Côté infrastructure :**
1. VM Linux avec Docker + Docker Compose
2. Entrée DNS interne
3. Règle dans Nginx Proxy Manager

---

## Évolutions futures possibles

- **Intégration GLPI** : pré-remplir les équipements depuis l'inventaire GLPI (API REST)
- **Signature qualifiée** : intégration Yousign pour valeur juridique renforcée
- **PWA** : Progressive Web App pour une meilleure expérience mobile à la signature
- **Notifications Teams** : en complément des emails, via webhook ou Graph API
- **QR Code** : sur le bon imprimé, pointant vers la version signée en ligne
- **Statistiques avancées** : dashboard Grafana connecté à PostgreSQL
- **Archivage légal** : export automatique vers un coffre-fort numérique
- **Multi-langue** : si le groupe s'internationalise
- **Signature par lot** : permettre à un collaborateur de signer plusieurs bons en une fois