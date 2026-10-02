# Conventions d'API

> Les règles communes à toutes les routes de `/api` : forme des erreurs, des listes, pagination, alias des
> anciens chemins, journal d'audit, lecture de la configuration, adresse du client et en-têtes de sécurité.
> Destiné aux développeurs. Résumé et contexte dans [architecture.md § 7](architecture.md#7-carte-des-routes-dapi).

Ces règles ont été posées au début de la vague 3 (lot « socle »). Les briques existent ; chaque domaine y passe
ses routes pendant la vague. Une route qui n'y est pas encore passée est signalée dans son contrat
(`backend/src/contracts/<domaine>.ts`).

---

## Sommaire

1. [Erreurs](#1-erreurs)
2. [Listes et pagination](#2-listes-et-pagination)
3. [Verbes et chemins](#3-verbes-et-chemins)
4. [Alias dépréciés](#4-alias-dépréciés)
5. [Journal d'audit](#5-journal-daudit)
6. [Configuration](#6-configuration)
7. [Adresse du client et en-têtes de sécurité](#7-adresse-du-client-et-en-têtes-de-sécurité)
8. [Côté front : `lib/api.ts`](#8-côté-front--libapits)

---

## 1. Erreurs

Toute réponse d'erreur (4xx et 5xx) a **une seule forme**, quel que soit l'endroit qui la produit : service,
garde, validation, limiteur de débit, protection CSRF, lecture du corps JSON, base de données.

```json
{ "statusCode": 409, "code": "serial_conflicts", "message": "Des numéros de série sont déjà prêtés.",
  "details": { "conflicts": [{ "serialNumber": "SN-1", "bonReference": "BON-2026-0001" }] } }
```

| Champ | Règle |
|---|---|
| `statusCode` | Le code HTTP, répété |
| `code` | Identifiant **stable** en `snake_case`. Le front teste `code`, jamais le texte |
| `message` | **Toujours une chaîne française**, affichable telle quelle. Jamais un tableau, jamais de l'anglais |
| `details` | Facultatif. Les données dont l'écran a besoin (champs refusés, numéros en conflit, date d'envoi…). Jamais de secret ni de détail interne |

Aucune erreur n'est renvoyée en 200. Un test de connexion (SMTP, LDAP…) qui aboutit à un échec répond 200
`{ ok: false, message }` : le test, lui, a réussi.

### Lever une erreur

```ts
import { AppException } from '../common/errors';

throw new AppException('serial_conflicts', 'Des numéros de série sont déjà prêtés.', HttpStatus.CONFLICT, { conflicts });
```

`AppException(code, message, status = 400, details?)` refuse à la construction un code qui n'est pas en
`snake_case`, un message vide ou un statut hors 4xx/5xx. Les exceptions de NestJS restent permises
(`new NotFoundException('Bon introuvable')`) : le filtre leur donne le code commun de leur statut. Utilisez
`AppException` dès que l'écran doit reconnaître le cas.

### Codes communs

Posés par le filtre global (`backend/src/common/errors/`) quand l'erreur n'a pas de code propre. Liste fermée
dans `CommonApiErrorCode` (`contracts/common.ts`) ; messages par défaut dans `error-codes.ts`.

| Code | Statut | Quand |
|---|---|---|
| `bad_request` | 400 | Règle métier refusée sans code propre |
| `validation_failed` | 400 | DTO refusé par le `ValidationPipe`. `details.errors` : `[{ field, messages }]` (`field` : chemin complet, `lines.1.serialNumber`), `message` : tous les textes joints par « — » |
| `invalid_json` | 400 | Corps JSON illisible |
| `unauthorized` | 401 | Pas de session, ou session expirée |
| `forbidden` | 403 | Rôle insuffisant, ou accès refusé à cet élément |
| `csrf_rejected` | 403 | Écriture sans `X-Requested-With: XMLHttpRequest` |
| `not_found` | 404 | Élément introuvable |
| `route_not_found` | 404 | Adresse d'API inconnue |
| `conflict` | 409 | L'état a changé entre-temps (écriture conditionnelle perdue) |
| `already_exists` | 409 | Valeur unique déjà prise (Prisma P2002 non traité par le service) |
| `invalid_reference` | 400 | Référence inexistante (Prisma P2003) |
| `payload_too_large` | 413 | Corps de plus de 2 Mo |
| `too_many_requests` | 429 | Limite de débit atteinte |
| `internal_error` | 500 | Erreur inattendue (détail au journal du serveur ; en développement et en test seulement, dans `details.debug` : un `NODE_ENV` absent ou inconnu compte comme la production) |
| `service_unavailable` | 503 | Base indisponible ou délai de transaction dépassé |

Un code propre à un domaine se déclare dans son contrat (`BonErrorCode` dans `contracts/bons.ts` :
`serial_conflicts`, `missing_serials`, `token_recent` ; `ContestationErrorCode` dans
`contracts/contestations.ts`) et se lève par `AppException`.

### Compatibilité pendant la vague 3

Un ancien corps d'erreur qui portait ses données à la racine (`{ code, … }`) est normalisé par le filtre :
`statusCode` et un `message` (celui du statut) sont ajoutés, les données passent dans `details` **et restent
à la racine**. Les bons et les contestations n'en lèvent plus : leurs codes (`serial_conflicts`,
`missing_serials`, `token_recent`, `contestation_already_open`, `contestation_already_handled`) sont des
`AppException` avec leur propre message, données dans `details` seulement (`bons/bon-errors.ts`,
`contestation/contestation-errors.ts`). Le front lit `details` (`ApiError.details`).

### Vérification

- `backend/src/common/errors/__tests__/` : traduction de chaque cas (Nest, Prisma, validation, inattendu).
- `backend/test/contract/errors.contract.ts` : **toutes** les routes de l'application sont appelées sans
  session (401), par un collaborateur quand elles lui sont fermées (403) et sans en-tête CSRF pour les
  écritures (403) ; chaque réponse doit avoir la forme unique.
- `backend/test/contract/pipeline.contract.ts` : 400 de validation, JSON illisible, 404, route inconnue, 409.
- Dans un fichier de contrat, une erreur se vérifie avec `expectShape(res.body, apiError)`.

---

## 2. Listes et pagination

Toute liste, paginée ou complète (petits référentiels compris), a **une seule forme** :

```json
{ "items": [ … ], "total": 128, "page": 2, "limit": 25, "truncated": false, "meta": { "openCount": 4 } }
```

| Champ | Règle |
|---|---|
| `items` | Les éléments de la page |
| `total` | Nombre d'éléments correspondant aux filtres, toutes pages confondues |
| `page`, `limit` | La page servie. Une liste complète répond `page: 1`, `limit` = `total` |
| `truncated` | La liste a été coupée à un plafond |
| `meta` | Données annexes propres à la route (`openCount`, `exportLimit`…) ; absente sinon |

Type : `ListResponse<T, M>` (`contracts/common.ts`). Plus de clé propre à chaque route (`bons`, `users`, `logs`).

### Paramètres

Tous les paramètres de requête passent par un **DTO** (fin des lectures à la main de `req.query`). La
pagination hérite de `PaginationQueryDto` (`backend/src/common/pagination/`) :

```ts
export class BonsListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() search?: string;
}

@Get()
async list(@Query() query: BonsListQueryDto): Promise<ListResponse<BonListItem>> {
  const [rows, total] = await Promise.all([this.prisma.bon.findMany({ where, ...toPrismaPage(query) }), this.prisma.bon.count({ where })]);
  return toListResponse(rows, { total, page: query.page, limit: query.limit });
}
```

- `page` : entier ≥ 1, 1 par défaut.
- `limit` : **25, 50 ou 100**, 25 par défaut (`PAGE_SIZES`). `LargePaginationQueryDto` admet aussi 200, pour
  une liste de travail volumineuse dont le besoin est établi (inventaire).
- Hors bornes : **400 `validation_failed`**, jamais corrigé en silence.
- Liste toujours complète (filiales, catalogue, packs) : `toFullListResponse(items, meta?)`.

Dans un fichier de contrat : `listOf(itemShape)` ou `listWithMeta(itemShape, metaShape)`
(`test/contract/support/common-shapes.ts`).

---

## 3. Verbes et chemins

- `PATCH` pour une mise à jour partielle ; `POST /ressource/:id/<action>` pour une action métier ;
  `DELETE` pour une suppression réelle uniquement (`DELETE /bons/:id` devient `POST /bons/:id/cancel`).
- Un préfixe par domaine métier : `/admin` ne regroupe que les réglages et l'exploitation ; les utilisateurs
  sont sous `/users`, les bons de la personne connectée sous `/me/bons`.
- Les routes statiques sont déclarées avant les routes paramétrées d'un même contrôleur.

---

## 4. Alias dépréciés

Quand une route change de chemin ou de verbe, l'ancien chemin reste servi par **le même traitement** (mêmes
gardes, droits, validation et réponse) jusqu'à la vague 5. On le déclare sur le **nouveau** handler :

```ts
@Patch(':id/role')                               // UsersController : PATCH /users/:id/role
@DeprecatedAlias('PATCH /admin/users/:id/role')  // ancien chemin, sans /api
changeRole(...) {}
```

- Format « VERBE /chemin » ou « /chemin » (même verbe). Paramètres `:nom` identiques à ceux du nouveau chemin.
- Le verbe peut changer : `@DeprecatedAlias('DELETE /bons/:id')` sur `POST /bons/:id/cancel`.
- L'ancien chemin peut appartenir à un autre contrôleur ; il ne doit plus être déclaré nulle part.
- La réponse porte `Deprecation: true` et `Link: </api/nouveau>; rel="successor-version"`. Les appels sont
  journalisés (« Ancien chemin d'API appelé : … », avec le navigateur) : le premier tout de suite, puis au plus
  un message par alias et par heure, avec le nombre d'appels. L'alias se retire quand le journal n'en montre
  plus.
- Droits : ceux du **nouveau** handler. Vérifier, avant d'ajouter un alias, que le nouveau chemin n'ouvre pas
  à un rôle des données que l'ancien lui refusait.

Fonctionnement : au démarrage, `configureApp` relève les déclarations de tous les contrôleurs
(`common/http/deprecated-alias.ts`) et pose un middleware qui réécrit l'ancien chemin vers le nouveau avant le
routage, **avant** la protection CSRF (qui juge ainsi le verbe réellement servi : un ancien `GET` réécrit en
`POST` reste protégé). Une déclaration incohérente (paramètres différents, ancien chemin encore servi, doublon) empêche le
serveur de démarrer. La liste des alias est versionnée dans
`backend/src/common/http/__tests__/__snapshots__/deprecated-aliases.md` (régénérer avec `-u` après un ajout).

Exemples en service : `GET /equipment/serial-history` → `GET /equipment/history` ; `DELETE /bons/:id` →
`POST /bons/:id/cancel` ; `GET /bons/mes-bons` → `GET /me/bons`. La liste complète est dans l'instantané
`deprecated-aliases.md`.

---

## 5. Journal d'audit

**Un seul point d'écriture** : `AuditService.record(action, entrée, { tx? })`. `AuditModule` est global : tout
service peut injecter `AuditService`.

```ts
await this.audit.record('bon_cancelled', { actorId: user.id, bonId: bon.id, details: { reason } }, { tx });
await this.audit.recordSafely('logout', { actorId: user.id, ip: clientIp(req), userAgent });
```

| Méthode | Usage |
|---|---|
| `record(action, entry, { tx })` | Propage l'échec. Dans une transaction, passer `tx` : l'entrée est annulée avec l'opération |
| `recordSafely(action, entry)` | Ne fait jamais échouer l'action tracée ; l'échec d'écriture est journalisé côté serveur |
| `writeAuditEntry(client, action, entry)` | Même écriture, pour une fonction de workflow qui reçoit déjà un client Prisma ou une transaction |

`entry` : `actorId`, `actorEmail`, `bonId`, `details` (JSON, **jamais de secret**), `ip` (toujours
`clientIp(req)`), `userAgent`. Toutes facultatives.

### Catalogue des actions

`action` n'accepte qu'une clé du catalogue `AUDIT_ACTIONS` (`backend/src/contracts/audit-actions.ts`, recopié
dans le front). Chaque action a un **libellé** (pastille, filtre), un **gabarit de phrase** en français, un
domaine et un ton :

```ts
bon_cancelled: { label: 'Bon annulé', sentence: '{acteur} a annulé le bon {bon}[ (motif : {reason})].', … }
```

Gabarit : `{acteur}` (nom ou email de l'auteur, « Le système » s'il n'y en a pas), `{bon}` (référence du bon),
`{clé}` (clé de premier niveau de `details`), `[…]` segment retiré si une de ses variables manque. Un texte
inséré perd ses espaces de bord et son point final : un motif saisi « Bon en double. » ne donne pas « (…).). ».

**L'auteur est celui qui a fait le geste, pas forcément le compte connecté.** Une signature du collaborateur
est écrite au nom du signataire (`signature/signature-audit.ts`) : au guichet sur le compte d'un technicien,
c'est le titulaire, avec `details.inPersonContext` « au guichet, en présence de Julie Moreau » (comme le
certificat du PDF) ; un mandataire est l'auteur de sa signature « pour le compte de » du titulaire. Une phrase
dit la vérité sur ce qui s'est passé : la remise porte sa voie (`bon_sent`, `details.channel` : « lien envoyé
par email » ou « lien de signature au guichet ») ; un lien par email depuis la fiche est un **premier envoi**
(`signature_link_sent` : restitution, nouvelle version après une modification ou une correction) ou un
**renvoi** du même document (`reminder_sent`, libellé « Lien renvoyé » ; les rappels automatiques ne sont pas
au journal, ils sont dans l'historique des emails) ; la signature qui termine le bon ajoute « Le système a
clôturé le bon » (`bon_closed`) ; la modification d'un brouillon est tracée (`bon_updated`, champs changés en
toutes lettres dans `details.fieldsLabel`). Les entrées écrites avant ces règles ont été complétées par la
migration `20261002100000_audit_history_truth` (données seulement, idempotente).
`auditSentence({ action, actorName, bonReference, details })` (`audit/audit-actions.ts`) et
`fillAuditSentence(gabarit, valeurs)` (côté front, depuis `@/contracts/audit-actions`) produisent la phrase.

Ajouter une action : une entrée dans le catalogue, `npm run sync-contracts`. Le test
`audit/__tests__/audit-actions.spec.ts` refuse une action écrite dans le code sans entrée au catalogue.

### Migration en cours

Les écritures directes (`prisma.auditLog.create`) qui restent sont listées, fichier par fichier, dans
`backend/src/audit/__tests__/__snapshots__/audit-direct-writes.md` (test `audit-direct-writes.spec.ts`).
Chaque lot fait passer celles de son domaine par `record`, puis régénère la liste (`-u`). Une nouvelle
écriture directe fait échouer le test.

---

## 6. Configuration

Le **registre** (`backend/src/config/config-registry.ts`) décrit chaque réglage de l'écran Configuration :
clé `rubrique.nom`, libellé, type (`boolean`, `integer`, `string`, `url`, `email`, `secret`), bornes, valeur par
défaut, secret (chiffré), réservé à l'administrateur, rubrique de l'état de santé.

Lecture typée, par `ConfigRegistryService` (module de configuration, global) :

```ts
if (await this.settings.getBool('smb.enabled')) { … }
const days = await this.settings.getInt('tokens.expiry_days');   // 1 à 30, 7 par défaut
const from = await this.settings.getString('smtp.from');         // null si rien
```

Les clés sont typées : `getInt('smb.enabled')` ne compile pas. Valeur appliquée : un booléen vaut « true » ou
« false », sinon le défaut ; un entier est ramené à ses bornes, un texte illisible laisse place au défaut ;
un texte vide laisse place à la variable d'environnement prévue (`FRONTEND_URL` pour `general.app_url`), sinon
au défaut.

**Hors bornes : une seule règle, partout.** À l'enregistrement (`PUT /admin/config/:category`), une valeur
hors bornes est refusée (400 `validation_failed`, avec le libellé et les bornes). Une valeur déjà en base et
hors bornes (saisie avant qu'une borne existe) est **ramenée à la borne** par le registre pour tous les
consommateurs (rappels, liens, rétention, annuaire, SMTP…), sans repli silencieux sur le défaut ; l'écran
l'annonce sous le champ (« La valeur saisie (0) est hors des bornes : valeur appliquée 1 (minimum). »). Un
champ vide affiche « Valeur appliquée : 3 (par défaut) » ; un nombre ou un interrupteur saisi, « Valeur
appliquée : 30 », aussi après rechargement.

**Chaque entier a deux bornes** (le registre l'impose à la compilation) : une faute de frappe (500 au lieu de
50) est refusée au lieu de dérégler l'application. L'écran affiche les bornes sous le champ.

| Réglage | Bornes | Pourquoi |
|---|---|---|
| `rappels.delay_1`, `delay_2`, `delay_3` | 1 à 90 jours | au-delà de trois mois, un rappel n'a plus d'utilité |
| `rappels.restitution_before_days` | 0 à 90 jours | 0 = aucun rappel de restitution |
| `rappels.signature_overdue_days` | 1 à 90 jours | un seuil trop haut ferait disparaître toutes les alertes de retard |
| `tokens.expiry_days` | 1 à 30 jours | durée de vie d'un lien de signature |
| `ldap.sync_interval_hours` | 1 à 168 heures | au-delà d'une semaine, un départ serait détecté trop tard |
| `smtp.port` | 1 à 65535 | plage des ports TCP |
| `retention.anonymize_months` | 60 à 600 mois | plancher légal de conservation des bons |
| `retention.attachment_months` | 1 à 600 mois | mêmes bornes que l'assistant de rétention |
| `retention.expired_tokens_days` | 1 à 3650 jours | idem |
| `retention.audit_logs_years` | 1 à 100 ans | idem |

**Tests de connexion.** `POST /admin/config/test/ldap` teste les valeurs **saisies** dans le formulaire
(`url`, `use_ssl`, `bind_dn`, `bind_password`, `user_filter` ; DTO `ldap/dto/ldap-test.dto.ts`), enregistrées
ou non, et n'enregistre rien. Un champ absent reprend la valeur enregistrée. Un mot de passe vide ou masqué
reprend le mot de passe enregistré **seulement** si l'URL et le Bind DN sont ceux enregistrés et que le SSL n'est
pas retiré : sinon le test répond « Retapez le mot de passe… » sans rien envoyer, pour que le mot de passe du
compte de service ne parte jamais vers une adresse saisie ni en clair. Ni la réponse ni les journaux ne contiennent de secret. Les tests SMTP, Entra et SMB portent encore sur
la configuration enregistrée : enregistrez avant de les lancer.

**Journal.** Chaque enregistrement qui change au moins un réglage écrit `config_updated` dans la même
transaction : `details` = `{ category, section, summary, changes: [{ key, label, from, to }] }` ; pour un
secret, `{ key, label, secret: true }` seulement (« Mot de passe : modifié »), jamais sa valeur. Un
interrupteur se lit « activé » / « désactivé », un réglage effacé « vide ». Un secret envoyé vide, ou égal au
masque `••••••••` que l'écran affiche à sa place, est ignoré : le secret en place est conservé.

`GET /api/admin/config/registry` (admin) renvoie, pour chaque réglage, `storedValue` (saisi), `defaultValue`,
`appliedValue`, `source` (`stored`, `environment`, `default`) et `adjusted` (saisie écartée ou ramenée à une
borne). Les secrets n'y apparaissent jamais en clair. Contrat : `contracts/config-registry.ts`.

---

## 7. Adresse du client et en-têtes de sécurité

**Adresse du client** : toujours `clientIp(req)` (`common/http/client-ip.ts`), c'est-à-dire `req.ip`, celle que
voit le limiteur de débit. Express la calcule avec `trust proxy` = `TRUSTED_PROXY_HOPS` (un proxy de confiance :
le nginx du frontend), posé par `bootstrap/configure-app.ts`. Ne jamais lire `X-Real-IP` ni `X-Forwarded-For`
à la main. Chaîne complète : [architecture.md § 1](architecture.md#1-vue-densemble).

**En-têtes de sécurité : une seule source par réponse.**

| Réponse | Source | Pourquoi |
|---|---|---|
| Pages et fichiers servis par nginx (shell HTML, fichiers statiques) | `frontend/nginx.conf`, blocs `location` | La CSP du shell doit autoriser ce dont l'interface a besoin (polices Google, script d'amorçage) |
| Réponses de l'API (`/api/*`) | helmet, `bootstrap/configure-app.ts` | Le backend reste protégé quand on l'appelle sans nginx (développement, tests de contrat) ; sa CSP ne sert que du JSON et des fichiers |

nginx ne pose **aucun** `add_header` au niveau du bloc `server` : le bloc `/api/` en hériterait, et chaque
réponse de l'API porterait deux `X-Frame-Options` (dont un contradictoire), deux CSP et deux `nosniff`.
`X-Frame-Options` vaut `DENY` des deux côtés, en accord avec `frame-ancestors 'none'`. Vérifié sur l'image
construite par `frontend/docker/test-client-ip.sh` (chaque en-tête de l'API présent une seule fois).

Le bloc de l'API est déclaré `location ^~ /api/` : sans `^~`, la règle des fichiers statiques
(`location ~* \.(js|css|png|…)$`) l'emporterait sur toute adresse d'API finissant par `.png`, `.js`… (logo,
cachet), servie alors depuis le disque au lieu du backend. Le même script le vérifie.

---

## 8. Côté front : `lib/api.ts`

- `ApiError` porte `status`, `message` (toujours affichable), `code` (`null` s'il n'y en a pas) et `details`
  (`null` s'il n'y en a pas) ; `body` garde le corps brut. `hasErrorCode(e, 'token_recent')` reconnaît une
  erreur par son code.
- `api.getList<T, M>(chemin, { legacyKey? })` renvoie toujours `ListResponse<T, M>`. Le temps de la vague, il
  lit aussi l'ancienne forme d'une route : clé propre (`legacyKey: 'bons'`, le reste passe dans `meta`),
  `{ items, truncated, total }` ou tableau nu. Une réponse qui n'est pas une liste lève une erreur au lieu
  d'afficher un écran vide.
- Les deux lectures sont dans `lib/api-envelope.ts` (`parseErrorBody`, `toListResponse`), testées sans réseau.
- Le message est toujours en français : serveur injoignable → `ApiError` de statut `0`
  (`NETWORK_ERROR_MESSAGE`) ; corps d'erreur non JSON (page HTML d'un proxy, texte anglais) → phrase selon le
  statut, jamais le texte reçu ; réponse réussie qui n'est pas du JSON → `UNEXPECTED_RESPONSE_MESSAGE`. Une
  annulation (`AbortError`) reste telle quelle.
