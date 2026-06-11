# Code Review complète — bonmiseadisposition

**Date** : 11 juin 2026
**Périmètre** : l'intégralité du codebase (backend NestJS ~9 100 lignes, frontend React ~11 000 lignes, infra Docker/nginx/CI), état du commit `8a8bab4`.
**Méthode** : review multi-agents en 10 dimensions (sécurité auth, autorisations/IDOR, fichiers & injections, correctness métier, transverse backend, qualité backend, correctness frontend, sécurité/qualité frontend, contrats API, infra/CI), chaque finding ayant été contre-vérifié par 1 à 3 agents adversariaux indépendants relisant le code source réel (153 agents au total). Les 12 findings dont la vérification a été interrompue ont été re-vérifiés manuellement. 3 findings ont été réfutés et écartés (listés en fin de rapport).

**État de la suite de tests** : `npm test` backend → **12 suites, 216 tests, tous verts**. Aucun test frontend n'existe.

---

## Résumé exécutif

L'application est globalement bien construite : Prisma partout (pas de SQL brut), ValidationPipe globale en whitelist, cookies httpOnly, Helmet/CSP, config chiffrée AES-256-GCM, verrou advisory pour la génération de références, audit trail, et la plupart des corrections de l'audit de mars 2026 sont effectivement en place. Aucune faille critique exploitable de l'extérieur n'a été trouvée.

En revanche :

1. **4 findings de sévérité élevée** — dont deux fonctionnalités entièrement cassées en production : la configuration des rappels (l'admin ne peut ni les désactiver ni les régler — le cron lit une catégorie de config que personne ne peut écrire) et la signature tactile sur mobile/tablette (les listeners touch ne sont jamais attachés), alors que c'est le flux nominal du QR code en présentiel.
2. **Une régression de l'audit de sécurité** : la correction SEC-03 (anti-spoofing IP) documentée comme faite n'est pas dans la config nginx réellement déployée — `X-Forwarded-For` reste forgeable et `X-Real-IP` enregistre l'IP du proxy, ce qui affaiblit la valeur probante des IP attachées aux signatures électroniques.
3. **La machine d'états des bons a plusieurs trous** : transitions concurrentes non protégées, tokens de signature d'un type périmé restant valides après changement d'état, snapshots PDF « immuables » écrasables, et un bug de tri qui bloquera définitivement la création de bons au 10 000ᵉ de l'année.
4. **Le frontend avale les erreurs** : la plupart des actions critiques (envoi, annulation, restitution…) n'ont aucun `catch` — en cas d'échec l'utilisateur croit que l'action a réussi.

Bilan après déduplication : **4 élevés, 29 moyens, 48 faibles, 17 suggestions** (98 findings distincts confirmés).

---

## 1. Sévérité ÉLEVÉE

### H-1 · La configuration des rappels est totalement inopérante
`backend/src/notification/notification.service.ts:442` · `backend/src/admin/admin.controller.ts:21` · `frontend/src/pages/admin/configuration/ConfigRappelsPage.tsx`

Le cron de rappels (9h, lun–ven) lit la catégorie de config **`notifications`** (`reminders_enabled`, `reminder_delay_days`, `max_reminders`). Mais l'API admin (whitelist `ALLOWED_CONFIG_KEYS`) et la page admin n'écrivent que la catégorie **`rappels`** (`enabled`, `delay_1/2/3`) — et le PUT rejette toute autre catégorie. Personne ne peut donc écrire ce que le cron lit :

- impossible de **désactiver** les rappels (`get()` retourne `null`, qui n'est pas `'false'`) ;
- impossible de changer délai/maximum — le cron tourne toujours avec 3 jours / 3 rappels ;
- l'UI affiche « sauvegardé » sans aucun effet (échec silencieux) ;
- les tests passent car ce sont eux les seuls « écrivains » de la catégorie `notifications`.

S'y ajoute une divergence de modèle : l'UI propose 3 délais échelonnés (3/7/14 j), le cron n'implémente qu'un délai unique + compteur. **Reco** : aligner cron et API sur une seule catégorie/clés (constantes partagées), implémenter les délais échelonnés ou retirer les champs, et ajouter un test croisant écriture API ↔ lecture cron. Même famille de bug : `tokens.expiry_days` et `ldap.sync_interval_hours` exposés en admin mais codés en dur (voir L-8).

### H-2 · Session perdue à chaque rechargement de page après 15 minutes
`frontend/src/contexts/AuthContext.tsx:25` · `frontend/src/lib/api.ts:23-47`

`fetchMe()` appelle `/api/auth/me` avec un `fetch` brut, sans la logique 401 → refresh → retry du client `api`. L'access token expire en 15 min, le refresh token dure 8 h : tout F5/nouvel onglet plus de 15 min après la dernière requête → 401 → `setUser(null)` → redirection `/login`, alors qu'un refresh token valide existait. Le mécanisme de session 8 h est inopérant au rechargement. **Reco** : faire passer `fetchMe` par `api.get('/auth/me')` ou tenter `POST /auth/refresh` sur 401 avant de déconnecter.

### H-3 · Erreurs avalées sur les six actions principales du bon
`frontend/src/pages/bons/detail/useBonActions.ts:48-103` · `frontend/src/pages/bons/detail/ConfirmModal.tsx`

`doSend`, `doCancel`, `doRestitution`, `doDeclareNotReturned`, `doMarkFound`, `doInPerson` : `try/finally` **sans `catch`**, appelées en fire-and-forget. Sur une erreur backend (409 transition invalide, 500, réseau) : promesse rejetée sans handler, aucun toast, le spinner s'arrête — l'utilisateur croit l'action réussie. Cas aggravé : dans le flux cachet IT, le modal se ferme avant l'exécution de l'action. **Reco** : `catch` + toast destructif sur chaque action (le pattern existe déjà dans `doResend`), et ne fermer `ItSignModal` qu'après succès.

### H-4 · Signature tactile impossible sur mobile/tablette (flux QR code cassé)
`frontend/src/hooks/use-signature-canvas.ts:78` · `frontend/src/pages/signature/SignaturePage.tsx`

Les listeners `touchstart/touchmove/touchend` sont attachés dans un `useEffect` à dépendances vides avec early-return si le canvas n'existe pas. Or `SignaturePage` fait des early-returns (auth en cours, chargement, login requis) **avant** de monter le canvas : au premier commit, le canvas n'existe pas → l'effet ne s'exécute plus jamais → impossible de signer au doigt (et `touchAction: none` bloque en plus le scroll). C'est le flux nominal d'`InPersonModal` (« scanner ce QR code »). Seule la souris fonctionne. **Reco** : callback ref attaché au montage réel du canvas ; tester sur appareil tactile.

---

## 2. Sévérité MOYENNE

### Sécurité — chaîne IP et audit (régression SEC-03)

| # | Finding | Fichiers |
|---|---------|----------|
| M-1 | **X-Forwarded-For reste spoofable de bout en bout** malgré SEC-03 documenté « corrigé » : `frontend/nginx.conf` utilise `$proxy_add_x_forwarded_for` (qui *concatène* le header client au lieu de l'écraser), idem dans la config NPM recommandée du README ; et `extractClientIp()` côté auth privilégie X-Forwarded-For — tous les logs d'audit d'authentification (login, logout, password_changed) sont forgeables. | `frontend/nginx.conf:35`, `backend/src/auth/auth.controller.ts:14`, `README.md:110` |
| M-2 | **X-Real-IP enregistré pour les signatures électroniques = IP du proxy**, pas du client : le nginx du conteneur frontend écrase X-Real-IP avec `$remote_addr` (= IP de NPM/gateway Docker). Le commentaire « cannot be spoofed » est vrai, mais la valeur est inutile en valeur probante (`signerIp` identique pour tout le monde). | `frontend/nginx.conf:34`, `backend/src/signature/signature.controller.ts:49`, `backend/src/bons/bons.controller.ts:293` |
| M-3 | **Rate limiting NestJS inopérant derrière le proxy** : `trust proxy` jamais configuré → `req.ip` = IP du conteneur nginx pour tous les clients. Tous les utilisateurs partagent les mêmes buckets (60/min global, 5/min login…) : un attaquant peut épuiser le bucket du login pour tout le monde (DoS), et le throttling « par IP » n'isole rien. | `backend/src/app.module.ts:48`, `backend/src/main.ts` |

**Reco commune** : dans `frontend/nginx.conf`, `proxy_set_header X-Forwarded-For $remote_addr;` (ou transmettre le X-Real-IP posé par NPM au lieu de l'écraser) ; côté backend `app.set('trust proxy', N)` avec N = nombre de proxies de confiance ; aligner `extractClientIp` sur la priorité X-Real-IP des deux autres controllers et factoriser.

### Sécurité — authentification et sessions

| # | Finding | Fichiers |
|---|---------|----------|
| M-4 | **Blacklist de tokens en Map mémoire** : logout et anti-rejeu du refresh perdus à chaque redémarrage du conteneur (déploiement = « pull and redeploy ») ; un refresh token volé « déconnecté » redevient valide jusqu'à 8 h. | `backend/src/auth/auth.service.ts:15` |
| M-5 | **Verrouillage de compte auto-prolongé** : pendant le lockout, chaque tentative (même avec le bon mot de passe) est journalisée `login_local_failed` et ré-alimente le compteur → un attaquant maintient indéfiniment le verrou d'un compte (dont `admin@local`) avec 1 requête/30 min. | `backend/src/auth/auth.service.ts:275`, `auth.controller.ts:170` |
| M-6 | **Le changement de mot de passe ne révoque pas les sessions existantes** : un attaquant déjà connecté garde access (15 min) + refresh (8 h, prolongeable). Le champ `passwordChangedAt` existe déjà — comparer `payload.iat` suffit. | `backend/src/auth/auth.service.ts:325` |
| M-7 | **SSO : rétrogradation silencieuse du rôle si la claim `groups` est absente** (claim non configurée ou *group overage* Entra >200 groupes → `groups` remplacé par `_claim_names`) : `syncUserRoleFromGroups` repart de `collaborator` sans condition → un admin perd ses droits au prochain login. | `backend/src/auth/auth.service.ts:204` |

### Correctness — machine d'états des bons

| # | Finding | Fichiers |
|---|---------|----------|
| M-8 | **Tokens d'un autre type non invalidés aux transitions** : `generateToken` n'invalide que les tokens du même type ; après `markFound` (partially_returned → sent_restitution), l'ancien lien `pv_cloture` reste signable 7 jours et peut écraser l'état/les documents. | `backend/src/bons/bons.service.ts:651` |
| M-9 | **`update()` : `deleteMany` des équipements hors transaction** — si le `bon.update` échoue ensuite (FK invalide, erreur DB), les équipements du brouillon sont perdus définitivement. Le pattern correct existe dans `EquipmentService.updatePack`. | `backend/src/bons/bons.service.ts:345` |
| M-10 | **`markFound`/`declareNotReturned` ne vérifient ni l'appartenance ni l'effet des `equipmentIds`** : `markFound` depuis `active` avec un updateMany qui ne matche rien propulse le bon en `sent_restitution` avec envoi d'un lien de signature, sans aucun équipement concerné. | `backend/src/bons/bons.service.ts:647` |
| M-11 | **`initiateRestitution` traite les équipements « non rendus » comme résolus** : `allReturned` ignore `notReturned=true` → un bon avec PV de clôture en attente de co-signature peut être basculé en restitution complète normale, court-circuitant le PV. | `backend/src/bons/bons.service.ts:434` |
| M-12 | **Course signature vs annulation/contestation** : `sign()` calcule `newStatus` à partir d'un statut lu avant la transaction et ne re-vérifie ni `tokenExpiresAt` ni `bon.status` dans la transaction → une signature peut écraser un statut `cancelled`/`contested`. | `backend/src/signature/signature.service.ts:159` |
| M-13 | **Snapshots PDF « immuables » écrasables** : `generateAndSave` fait un `upsert` dont la branche update remplace `data`/`filename` ; combiné à UNIQUE(bonId, type), une régénération écrase un document co-signé (un seul avenant possible par bon). | `backend/src/pdf/pdf.service.ts:92` |
| M-14 | **`generateReference` : tri lexicographique sur colonne texte** — au 10 000ᵉ bon de l'année, `BON-2026-9999` > `BON-2026-10000` en tri texte → `nextNum` recalcule 10000 → violation d'unicité à chaque création : **la création de bons se bloque définitivement**. L'advisory lock, lui, est correct. | `backend/src/bons/bons.service.ts:826` |
| M-15 | **`resendSignatureLink` : un PV expiré est renvoyé comme lien de type `restitution`** → le PV de clôture n'est jamais signé et le bon reste bloqué en `partially_returned`. | `backend/src/bons/bons.service.ts:781` |
| M-16 | **Transitions check-then-act et query params non validés → 500** : `status`/`stage`/`role` castés vers les enums Prisma sans contrôle, `page=0`/`limit=abc` → `parseInt`=NaN → PrismaClientValidationError 500 au lieu de 400 ; `excludeStatus` écrase `status`. Endpoints concernés : `GET /bons`, `/bons/export`, `/bons/recent`, `/bons/:id/pdf?stage=`, `/audit`, `/contestations`, `/users?role=`. | `backend/src/bons/bons.service.ts:208`, `bons.controller.ts:87,213`, `audit.controller.ts:29`, `contestation.controller.ts:38`, `users.controller.ts:14` |

### Correctness — jobs et services transverses

| # | Finding | Fichiers |
|---|---------|----------|
| M-17 | **Les 3 crons exécutent des `await` hors try/catch** (rappels, sync LDAP, retry SMB) ; le package `cron` 3.x ne capte pas les rejets → `unhandledRejection` pouvant tuer le process Node. | `notification.service.ts:439`, `ldap.service.ts:55`, `smb.service.ts:275` |
| M-18 | **Rappels envoyés chaque jour ouvré consécutif** : le délai n'est comparé qu'à `bon.updatedAt`, jamais à la date du dernier rappel → rappels aux jours 3, 4, 5 au lieu de 3, 7, 14. | `backend/src/notification/notification.service.ts:452` |
| M-19 | **Le cron de rappels peut renvoyer un lien invalidé/expiré** : sélection `signed: false` sans filtre sur `tokenExpiresAt` ni tri — après un resend manuel, le `find()` peut prendre l'ancien token mis à epoch. | `backend/src/notification/notification.service.ts:477` |
| M-20 | **Sync LDAP : les comptes désactivés/supprimés de l'AD restent actifs** dans l'app (sélectionnables, comptés dans le staff IT) : `active: true` forcé à l'upsert, aucune passe de désactivation, filtre par défaut sans bit `userAccountControl`. | `backend/src/ldap/ldap.service.ts:261` |
| M-21 | **Signer un PV de clôture envoie l'email « confirmation de mise à disposition »** : cast `'mise_disposition' \| 'restitution'` qui oublie `pv_cloture` + ternaire binaire dans `sendSignatureConfirmation`. | `signature.controller.ts:66`, `notification.service.ts:216` |

### Autorisations

| # | Finding | Fichiers |
|---|---------|----------|
| M-22 | **Cloisonnement filiale incohérent et fail-open** : (a) `verifyCollaboratorAccess` autorise par défaut (`if (!user) return`, `if (!bon) return`) et un technicien avec `filialeId=null` (cas produit par la sync LDAP quand `company` ne matche pas) accède à tous les bons ; (b) le cloisonnement n'existe que sur les routes unitaires — `GET /bons`, `/bons/recent`, `/bons/stats`, `/bons/export` ne filtrent pas par filiale : un technicien voit/exporte les bons de toutes les filiales en liste mais reçoit 403 sur leur détail. Vérifié manuellement : `findAll`/`getStats`/`getRecent`/`exportCsv` ne prennent aucun `@CurrentUser`. | `backend/src/bons/bons.controller.ts:80-114,261-282` |
| M-23 | **`BON_SELECT` inclut `signatures: true`** → toutes les réponses bons (liste, détail, recent, mes-bons) renvoient les enregistrements Signature complets : **`token` (secret actif de signature), `signerIp`, `signerUserAgent`, `signatureImagePath`** — champs absents des types frontend, donc inutiles. Un technicien peut récupérer le token d'un collaborateur et ouvrir/signer son lien. Vérifié manuellement. | `backend/src/bons/bons.service.ts:44` |
| M-24 | **Les endpoints de signature chargent le Bon via `include` Prisma** → tous les scalaires, y compris les colonnes Bytes héritées `pdfMiseDispoSnapshot`/`pdfRestitutionSnapshot` (sérialisées dans la réponse JSON quand non nulles), alors que `BON_SELECT` a été créé précisément pour les exclure. Vérifié manuellement (`getBonInfoByToken`, `sign`, `signItCachet`). | `backend/src/signature/signature.service.ts:70,111,183,316,329,391` |
| M-25 | **Page de signature : les données du bon sont affichées à tout utilisateur authentifié** détenteur du lien (nom, email, équipements, numéros de série), même quand le bandeau « Compte non autorisé » s'affiche — le contrôle d'email n'est qu'informatif côté client, le backend ne le vérifie pas sur le GET. | `frontend/src/pages/signature/SignaturePage.tsx:229`, `backend/src/signature/signature.controller.ts:29` |

### Frontend et infra

| # | Finding | Fichiers |
|---|---------|----------|
| M-26 | **BonsList : erreurs de chargement avalées** (`.catch(() => {})`) → panne serveur affichée comme « Aucun bon trouvé — Créez le premier ». | `frontend/src/pages/bons/BonsList.tsx:137` |
| M-27 | **Login : spinner infini si l'initialisation échoue** (`Promise.all` sans catch sur `/auth/setup-required` + `/auth/local-auth-status`) — porte d'entrée de l'app bloquée sans message. | `frontend/src/pages/Login.tsx:29` |
| M-28 | **Healthcheck cassé dans `docker-compose.yml`** : teste `/health` alors que le préfixe global rend la route `/api/health` → backend « unhealthy » pour toujours, le frontend (`depends_on: service_healthy`) ne démarre jamais. | `docker-compose.yml:38`, `backend/src/main.ts:80` |
| M-29 | **`client_max_body_size` absent du nginx frontend** : défaut 1 Mo < limite backend 2 Mo → les signatures base64 entre 1 et 2 Mo sont rejetées en 413 avant d'atteindre le backend. | `frontend/nginx.conf:28`, `backend/src/main.ts:37` |

---

## 3. Sévérité FAIBLE (48)

### Authentification

| # | Fichier | Problème |
|---|---------|----------|
| L-1 | `auth.service.ts:188` | Rotation du refresh token sans durée de vie absolue : une session (ou un cookie volé) est prolongeable indéfiniment. |
| L-2 | `auth.service.ts:259` | Énumération d'utilisateurs par canal temporel : pas de `bcrypt.compare` factice quand l'email n'existe pas (~150 ms d'écart). |
| L-3 | `auth.service.ts:243` | `JWT_SECRET` accepté sans contrainte de longueur/entropie (contraste avec `ENCRYPTION_KEY` ≥32). |
| L-4 | `main.ts:16` | Exemption CSRF inutile sur `/api/auth/local-login` (le frontend envoie déjà le header) → login CSRF résiduel. |
| L-5 | `auth.service.ts:383` | Mot de passe temporaire de l'admin par défaut écrit en clair dans les logs Docker. |
| L-6 | `auth.service.ts:117` | Le callback SSO émet des cookies pour un compte désactivé (`active` non vérifié, contrairement au login local). |

### Tokens et signature

| # | Fichier | Problème |
|---|---------|----------|
| L-7 | `signature.service.ts:66` | `GET /signature/:token` renvoie l'intégralité du bon même pour un token expiré/déjà signé, à tout utilisateur authentifié. |
| L-8 | `signature.service.ts:22`, `admin.controller.ts:15` | Clés de config mortes exposées à l'admin : `tokens.expiry_days` (TOKEN_VALIDITY_DAYS=7 en dur), `ldap.sync_interval_hours` (cron en dur), `general.app_url` non réglable. |

### Fichiers et injections

| # | Fichier | Problème |
|---|---------|----------|
| L-9 | `ldap.service.ts:141` | Validation du certificat LDAPS désactivée dès que `NODE_ENV !== 'production'` (MITM possible sur le bind en staging/recette). |
| L-10 | `ldap.service.ts:67` | Correction SEC-02 incomplète : la liste blanche de caractères du filtre LDAP documentée dans l'audit est absente du code (seul l'équilibrage de parenthèses est vérifié). |
| L-11 | `signature.service.ts:438` | Aucune validation du contenu réel (magic bytes PNG) des signatures stockées. |
| L-12 | `smb.service.ts:369` | `isSafeExportPath` : liste de blocage Linux uniquement, et le test `!path.isAbsolute(resolved)` est mort (`path.resolve` retourne toujours un chemin absolu). |
| L-13 | `pdf-templates.service.ts:121` | `POST /admin/pdf-templates/import` accepte un `Record<string, unknown>` brut, contournant toutes les contraintes du DTO du PATCH. |

### Logique métier

| # | Fichier | Problème |
|---|---------|----------|
| L-14 | `bons.service.ts:379` | `send()`/`initiateRestitution` : check-then-act sans condition de statut dans l'UPDATE (double envoi concurrent possible). |
| L-15 | `bons/dto/bon.dto.ts:26` | `@IsDateString` accepte un datetime avec timezone → colonne `@db.Date` décalée d'un jour selon l'offset. |

### Backend transverse

| # | Fichier | Problème |
|---|---------|----------|
| L-16 | `ldap.service.ts:38` | Fuite de connexion TCP dans `testConnection` si le bind échoue (`destroy()` seulement sur le chemin de succès). |
| L-17 | `ldap.service.ts:54` | Aucune garde de ré-entrance sur la sync LDAP (cron 6 h + déclenchement manuel en parallèle). |
| L-18 | `notification.service.ts:296` | `escapeHtml` appliqué aux **sujets** d'emails (texte brut) → entités HTML visibles (`&amp;`…). |
| L-19 | `notification.service.ts:292` | Alerte contestation journalisée `sent` même si tous les envois ont échoué (résultats de `Promise.allSettled` ignorés). |
| L-20 | `smb.service.ts:74` | Exports SMB bloqués en `pending` (crash entre création et update) jamais repris par le cron de retry. |
| L-21 | `config.service.ts:40` | Erreur de déchiffrement propagée sans fallback ni message explicite (rotation d'`ENCRYPTION_KEY` = pannes silencieuses en cascade). |

### Qualité backend

| # | Fichier | Problème |
|---|---------|----------|
| L-22 | `admin.controller.ts:90` | Bodies typés `Record<string, string>` non validés (le ValidationPipe global ne s'applique qu'aux classes décorées). |
| L-23 | `notification.service.ts:346` | Code mort : `sendCancellationNotice` et `sendMarkFoundNotice` ne sont jamais appelés en production (annulation et « retrouvé » n'envoient donc aucun email — probablement le comportement attendu manquant). |
| L-24 | `filiales.controller.ts:72` | `uploadLogo`/`uploadStamp` retournent `{ error: ... }` en HTTP 200 ; `UsersService.findOne` retourne `null` au lieu de 404. |
| L-25 | `equipment.controller.ts:14` | Catalogue et packs lisibles par tout utilisateur authentifié (pas de RolesGuard sur les GET) — vérifié manuellement. |
| L-26 | `bons.controller.ts:128` | 8 routes jamais appelées par le frontend (vérifié par croisement exhaustif) : `PUT /bons/:id` (pas de page d'édition de brouillon !), `GET /users/:id`, `GET /filiales/:id`, `GET /equipment/catalog/search`, `/catalog/active`, `/catalog/:id`, `/packs/active`, `/packs/:id`. |

### Frontend

| # | Fichier | Problème |
|---|---------|----------|
| L-27 | `ConfirmModal.tsx:31` | Double-submit possible (bouton jamais désactivé pendant l'await) pour annulation et renvoi forcé. |
| L-28 | `UiViewContext.tsx:54` | Vue restaurée depuis localStorage sans validation → un non-IT peut atterrir sur `/unauthorized` au premier rendu. |
| L-29 | `SignaturePage.tsx:91` | Un 401 sur la récupération du bon affiche « Ce lien de signature n'existe pas » au lieu de re-proposer la connexion. |
| L-30 | `BonCreate.tsx:393` | Bouton « Aujourd'hui » : date UTC au lieu de la date locale (veille entre minuit et 1‑2 h du matin). |
| L-31 | `BonCreate.tsx:222` | Chargement initial (filiales/catalogue/packs) et autocomplete sans catch → formulaire inutilisable sans message. |
| L-32 | `api.ts:47` | Le chemin de retry après refresh ne gère pas les réponses 204/corps vide (latent : aucun endpoint actuel ne le déclenche, mais piège dès qu'un 204 apparaîtra). |
| L-33 | `SignaturePage.tsx:467` | `equipments.sort(...)` mute le state React en place (copier avant tri). |
| L-34 | `BonsList.tsx:36` | Impossible de filtrer sur le statut `contested` (7 statuts sur 8 dans `STATUS_OPTIONS`). |
| L-35 | `lib/validation.ts:39` | Aucune validation `dateRestitution >= dateMiseDisposition`, ni Zod ni backend. |
| L-36 | `Contestations.tsx:184` | Échecs silencieux : liste des contestations sans catch → « Aucune contestation trouvée » en cas de panne. |
| L-37 | `ConfigSection.tsx:47` | Boutons de test LDAP/SMTP : spinner bloqué + rejection non gérée si l'appel échoue (cas le plus fréquent d'un test). |
| L-38 | `PdfTemplates.tsx:204` | Fuite de blob URL : le cleanup révoque la valeur capturée (null), jamais l'URL réelle. |
| L-39 | `BonDetailCollaborateur.tsx:151` | Boutons icône sans nom accessible (vue destinée à tous les collaborateurs). |
| L-40 | `api.ts:51` | `ApiError.message` = JSON brut NestJS, affiché tel quel à l'utilisateur sur plusieurs écrans. |

### Infra et CI

| # | Fichier | Problème |
|---|---------|----------|
| L-41 | `nginx/nginx.conf:38` | **Ce fichier n'est déployé par aucun docker-compose** : la couche TLS/HSTS/rate-limiting-signatures qu'il décrit (et que la doc présente comme active) n'existe pas dans le déploiement réel — la doc sécurité surestime les protections en place. |
| L-42 | `docker-compose.dev.yml:6` | PostgreSQL publié sur 0.0.0.0:5432 avec mot de passe `devpassword` committé → base joignable depuis tout le LAN du poste de dev. |
| L-43 | `docker-compose.prod.yml:71` | Frontend publié en HTTP clair sur 0.0.0.0:5147 → NPM (TLS, protections) contournable par accès LAN direct. |
| L-44 | `backend/Dockerfile:5` | Aucun `.dockerignore` (backend ni frontend) avec `COPY . .` → node_modules de l'hôte et `.env` éventuels embarqués dans le contexte de build. |
| L-45 | `nginx/nginx.conf:64` | Héritage `add_header` nginx : tout bloc définissant son propre add_header perd les headers de sécurité du niveau supérieur ; zone `api_limit` 30 r/min incohérente avec le throttler backend 60/min (latent tant que L-41 n'est pas résolu). |
| L-46 | `frontend/nginx.conf:43` | Le bloc des assets statiques (`Cache-Control`) perd les headers de sécurité hérités (`X-Content-Type-Options`…) pour les JS/CSS. |
| L-47 | `.env.example:30` | `DEFAULT_ADMIN_PASSWORD` documenté mais transmis au conteneur par aucun compose → la variable est sans effet en Docker. |
| L-48 | `.github/workflows/docker.yml:44` | Actions épinglées par tags mutables (pas de SHA) avec `packages:write` ; input `dockerfile:` invalide pour `docker/build-push-action` (c'est `file:` — ignoré silencieusement, le défaut convient par chance). |

---

## 4. Suggestions (17)

| # | Fichier | Suggestion |
|---|---------|------------|
| S-1 | `jwt.strategy.ts:19` | Épingler `algorithms: ['HS256']` à la vérification JWT (stratégie + `jwtService.verify`). |
| S-2 | `filiales.module.ts:19` | Upload logo/tampon : valider la signature binaire du fichier, pas seulement MIME (client) + extension. |
| S-3 | `bons.service.ts:69` | `getStats` : `waitingSignature` compte indéfiniment les tokens invalidés (filtrer `tokenExpiresAt > now`). |
| S-4 | `notification.service.ts:35` | `invalidateTransporterCache()` jamais appelé : un changement de config SMTP n'est pris en compte qu'à l'expiration du cache. |
| S-5 | `signature.service.ts:112` | Bloc include « bon complet » copié-collé 6 fois — réutiliser une constante partagée (cf. M-24). |
| S-6 | `bons.controller.ts:204` | `@Res() res?` + `res!` ×8 et `@CurrentUser() user?` derrière un guard : déclarer non optionnels. |
| S-7 | `admin.controller.ts:74` | Commentaires mojibake (`â”€â”€`) : ré-encoder en UTF-8. |
| S-8 | `BonCreate.tsx:442` | Icône React dans un `<option>` (HTML invalide) ; `addFromPack` écrase des lignes partiellement remplies. |
| S-9 | `useBonActions.ts:42` | Timer de re-fetch des snapshots non nettoyé au démontage. |
| S-10 | `api.ts:17` | `...options` spreadé après `headers` : un futur `options.headers` écraserait Content-Type et le header anti-CSRF. |
| S-11 | `lib/utils.ts:41` | `escapeHtml` frontend définie mais jamais utilisée (code mort trompeur). |
| S-12 | `BonDetailCollaborateur.tsx:95` | Duplication avec `pages/bons/detail/` (load, downloadPdf via fetch brut sans refresh, tableaux). |
| S-13 | `PdfTemplates.tsx:1` | 6 pages >300 lignes (PdfTemplates 629, BonCreate 555, SignaturePage…) à découper. |
| S-14 | `ContestationDialog.tsx:79` | Limite UI 1000 caractères vs schéma 2000 — constante partagée. |
| S-15 | `docker-compose.prod.yml:40` | Déploiement prod sur `:latest` mutable avec auto-redeploy, sans étape de test dans le pipeline CI. |
| S-16 | `users.service.ts:10` | `safeSelect` expose aux techniciens des métadonnées de compte inutiles à la sélection d'un collaborateur (`samAccountName`, `mustChangePassword`, `isLocalAccount`, `lastLdapSync`) — vérifié manuellement. |
| S-17 | `admin.controller.ts:19` | Clés `smtp.method`/`graph_*`/`from_name`/`from_address` whitelistées sans aucun consommateur ni UI (vérifié : seules occurrences = allowlist + masque). |

---

## 5. Dépendances vulnérables (npm audit)

**Backend** — 29 vulnérabilités (1 critique, 9 élevées), mais l'essentiel vient des outils de dev (`@nestjs/cli`, `ts-jest` → handlebars, lodash, tmp). Touchent le **runtime** :
- `multer` 1.4.5-lts (dépendance directe) : 3 advisories DoS élevées → migrer vers multer 2.x (déjà présent via `@nestjs/platform-express`).
- `nodemailer` 6.10.1 : injection de commandes SMTP via CRLF, DoS addressparser → mettre à jour.
- `path-to-regexp` (via express) : ReDoS.

**Frontend** (prod) — 3 modérées : `react-router` 6.26 (open redirect via URL protocol-relative `//`) et `postcss` → `npm audit fix`.

## 6. Points positifs

- Aucun SQL brut : tout passe par Prisma (le seul `$queryRaw` est l'advisory lock, paramétré correctement).
- ValidationPipe globale en `whitelist` + `forbidNonWhitelisted`, DTOs class-validator sur l'essentiel des endpoints.
- Cookies httpOnly + middleware CSRF par header + Helmet/CSP, secrets chiffrés AES-256-GCM (IV unique par chiffrement, PBKDF2 100k).
- La plupart des corrections de l'audit de mars 2026 sont réellement en place (IDOR contestations, rate limit refresh, politique de mot de passe, masquage config) — les exceptions sont documentées ci-dessus (M-1/M-2, L-10).
- Verrou advisory PostgreSQL pour la génération de références (la concurrence est bien gérée ; c'est le tri qui est faux, M-14).
- 216 tests backend verts, fixtures et mocks propres, tests dédiés XSS email et sécurité auth.
- Frontend : pas de `dangerouslySetInnerHTML`, pas de tokens en localStorage, découpage propre de `BonDetail` en sous-composants.

## 7. Couverture et limites de la review

- Analyse **statique** uniquement : aucun comportement vérifié par exécution de l'application (les tests backend ont été exécutés, pas l'app).
- Non couverts : configuration réelle de NPM/Portainer (hors repo), scan des images Docker de base, composants UI shadcn générés, contenu détaillé des tests, performances réelles sous charge.
- Pages admin lues partiellement : Catalogue.tsx, AuditLogs.tsx, Filiales.tsx, Utilisateurs.tsx, LdapSync.tsx, DashboardIT.tsx — des findings du même type que ceux relevés (erreurs avalées, validation) peuvent s'y trouver.
- **Aucun test frontend n'existe** — au vu du nombre de findings frontend (erreurs avalées, flux de signature), c'est le gap de test le plus rentable à combler, en commençant par `api.ts`, `useBonActions` et `SignaturePage`.

## 8. Findings réfutés (transparence)

1. *« GET /admin/ldap/status accessible aux techniciens — incohérence »* : exact mécaniquement, mais cohérent avec le design (statuts non sensibles accessibles aux techniciens, configs admin-only).
2. *« BonSignatures : condition d'expiration toujours vraie (`getTime() > 1000`) »* : c'est la convention sentinelle délibérée du backend (tokens invalidés mis à epoch), pas un bug.
3. *« api.ts retry 204 → fausse erreur »* : l'asymétrie existe (reclassée L-32, latente) mais aucun endpoint actuel ne renvoie 204 sur ce chemin.

---

*Review générée par workflow multi-agents (10 dimensions, 153 agents, vérification adversariale par finding — majorité 2/3 pour les sévérités élevées) + vérifications manuelles. Tests : `cd backend && npm test` → 216/216.*
