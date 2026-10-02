# Guide du développeur frontend

Conventions du frontend React (`frontend/src/`) : appels d'API, listes, dates, libellés, formulaires, retours à
l'utilisateur, accessibilité et mobile. L'organisation générale du code est décrite dans
[architecture.md](architecture.md), les tests dans [testing-guide.md](testing-guide.md).

Règle d'or : **avant d'écrire un utilitaire, chercher s'il existe déjà ici.** Chaque copie d'une brique commune
finit par diverger (6 paginations, 7 recherches différées et 4 `formatDate` différents avant la refonte).

---

## 1. Socle frontend

Briques communes posées par la refonte de septembre 2026 (lot 1E). Les écrans les adoptent au fil des vagues 3
et 4 ; tout nouvel écran les utilise d'emblée.

| Besoin | Brique | Fichier |
|---|---|---|
| Appeler le serveur | `api.get/post/put/patch/delete`, `api.getFile`, `api.getList` | `lib/api.ts` |
| Reconnaître une erreur du serveur | `ApiError.code` / `.details`, `hasErrorCode` | `lib/api.ts` |
| Revenir à la page demandée après connexion | `safeReturnTo`, `loginPathFor` | `lib/safe-return-to.ts` |
| Filtres d'une liste dans l'adresse | `useUrlFilters` + `filterField` | `hooks/useUrlFilters.ts` |
| Pagination 25 / 50 / 100 | `usePagination` | `hooks/usePagination.ts` |
| Tri par colonne | `useSort` | `hooks/useSort.ts` |
| Recherche au fil de la frappe | `useDebounce` | `hooks/useDebounce.ts` |
| Télécharger un fichier du serveur | `useDownload` | `hooks/useDownload.ts` |
| Enregistrer un fichier construit dans le navigateur | `saveBlob` | `lib/download.ts` |
| Pagination, en-tête triable, états de liste, tableau ↔ cartes | `components/list/` | `Pagination`, `SortableHeader`, `ListState`, `ResponsiveList`, `ListCards` |
| Téléphone ou ordinateur ? | `useIsMobile`, `useMediaQuery` | `hooks/useMediaQuery.ts` |
| Afficher une date | `formatDate`, `formatDateTime`, `formatDateLong`, `formatTime`, `todayInParis` | `lib/dates.ts` |
| Écrire un mot du métier | le lexique | `domain/labels.ts` |
| Titre de l'onglet du navigateur | `usePageTitle` | `hooks/usePageTitle.ts` |

### 1.1 Client API (`lib/api.ts`)

Toutes les requêtes vers `/api` passent par `api` : cookies de session, en-tête anti-CSRF
(`X-Requested-With`), rafraîchissement de la session expirée (une seule fois pour tous les appels simultanés),
erreurs lisibles. Aucun écran n'appelle `fetch` directement.

Le serveur répond toute erreur sous la forme `{ statusCode, code, message, details? }`
([api-conventions.md](api-conventions.md)) : `ApiError` porte `status`, `message` (toujours affichable),
`code` (identifiant stable, `null` s'il n'y en a pas) et `details`. Un écran **teste le code, jamais le
texte** : `if (hasErrorCode(e, 'token_recent')) … e.details?.sentAt`. Une liste se lit par
`api.getList<T>(chemin)`, qui renvoie toujours `{ items, total, page, limit, truncated, meta? }` ; le temps de la
vague 3, `{ legacyKey: 'bons' }` lit encore l'ancienne forme d'une route qui n'est pas encore passée.

Chaque méthode accepte des options en dernier argument :

```ts
const controller = new AbortController();
await api.get<Bon>(`/bons/${id}`, {
  signal: controller.signal,        // annule la requête (page quittée, recherche remplacée)
  headers: { Accept: 'text/csv' },  // en-têtes propres à cet appel
  onUnauthorized: 'no-redirect',    // conduite sur 401, voir ci-dessous
});
```

| `onUnauthorized` | Sur 401 | Pour |
|---|---|---|
| `'redirect'` (défaut) | rafraîchit la session et rejoue ; sinon va à `/login?returnTo=<page courante>` | tous les écrans |
| `'no-redirect'` | rafraîchit et rejoue ; sinon `ApiError(401)` sans quitter la page | vérifier la session (`AuthContext`) |
| `'no-refresh'` | le 401 remonte tel quel, avec le message du serveur | la connexion elle-même (401 = identifiants refusés) |

Une requête annulée échoue avec une `DOMException` nommée `AbortError` : l'ignorer, ce n'est pas une erreur à
afficher.

**Fichiers** : `api.getFile(path)` renvoie `{ blob, filename, truncated }`. `filename` est lu dans l'en-tête
`Content-Disposition` (forme `filename*=` encodée comprise, chemin et caractères de contrôle retirés) : **c'est le
serveur qui nomme les fichiers**, le navigateur ne reconstruit plus le nom. `truncated` vaut `true` quand le
serveur a coupé l'export à son plafond (en-tête `X-Truncated: true`).

`api.getBlob(path)` ne renvoie que le contenu : elle est **dépréciée** et ne sert plus qu'aux écrans de
`pages/bons/**` (dont un test simule la réponse par un simple `Blob`). À supprimer quand ils seront passés à
`getFile`.

### 1.2 Connexion et retour à la page demandée

- `ProtectedRoute` (`App.tsx`) envoie un visiteur sans session vers `/login?returnTo=<chemin et paramètres>` : un
  lien reçu par email (`/inventaire?vue=collaborateurs&compte=inactif`), un favori ou un lien copié mènent à la
  bonne page après la connexion. L'accueil et `/login` ne sont pas mémorisés.
- Connexion : un **seul écran clair** pour tout le monde (`pages/login/LoginCard.tsx`) : « Continuer avec
  Microsoft », puis le formulaire du compte local déjà ouvert (`pages/login/LocalLoginForm.tsx`, masqué si la
  connexion locale est désactivée), sans geste pour le déplier ni mention technique. `Login.tsx` renvoie à
  `returnTo` (ou le transmet au changement de mot de passe forcé) et affiche en clair un échec Microsoft
  (`?error=`). Seuls le titre et la phrase d'accueil changent quand `returnTo` désigne un écran du
  collaborateur (`/signer/…`, `/mes-bons`, `/mes-equipements`) : voir § 4.2.
- Connexion Microsoft : le lien « Continuer avec Microsoft » porte `returnTo` ; le serveur le garde pendant
  l'aller-retour chez Microsoft (cookie `auth_return_to`, 10 min) et le revalide avant d'y renvoyer
  (`backend/src/auth/auth.controller.ts`).
- `returnTo` n'accepte qu'un **chemin interne** de 2 048 caractères au plus (même plafond que le serveur) : il
  commence par `/` mais pas par `//`, ne contient ni `\` ni caractère de contrôle, et reste sur l'origine courante
  une fois résolu. Toujours passer par `safeReturnTo()`
  (`lib/safe-return-to.ts`), jamais par un test maison. Détails : [security.md](security.md).

### 1.3 Listes

Une liste garde **filtres, tri et page dans l'adresse** (le bouton « retour » les retrouve, un lien copié les
transmet) et laisse l'utilisateur choisir **25, 50 ou 100 lignes**, mémorisé dans son navigateur.

```tsx
const SCHEMA = {                                   // déclaré une fois, hors du composant
  search: filterField.text(),
  statut: filterField.oneOf(['open', 'in_review', 'resolved', 'rejected'] as const),
  enRetard: filterField.flag(),                    // « 1 » dans l'adresse
  depuis: filterField.day(),                       // AAAA-MM-JJ
};
const SORT = { fields: ['createdAt', 'reference'] as const, defaultField: 'createdAt', defaultOrder: 'desc' } as const;

function ContestationsPage() {
  const { filters, setFilter, resetFilters, hasActiveFilters } = useUrlFilters(SCHEMA);
  const sort = useSort(SORT);
  const [saisie, setSaisie] = useState(filters.search);
  const recherche = useDebounce(saisie);           // 300 ms
  useEffect(() => setFilter('search', recherche.trim()), [recherche, setFilter]);

  const [total, setTotal] = useState(0);
  const pagination = usePagination({ total });     // page dans l'adresse, taille mémorisée
  // … charger /contestations avec filters, sort.field/sort.order, pagination.page/pageSize …

  return (
    <ListState loading={loading} error={error} onRetry={reload} isEmpty={items.length === 0}
               emptyMessage="Aucune contestation" hasActiveFilters={hasActiveFilters} onClearFilters={resetFilters}>
      <ResponsiveList items={items} columns={COLUMNS} getKey={(c) => c.id} caption="Contestations" sort={sort} />
      <Pagination page={pagination.page} pageSize={pagination.pageSize} total={total}
                  onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize}
                  itemLabel={{ singular: 'contestation', plural: 'contestations' }} />
    </ListState>
  );
}
```

Règles :
- **Valeurs invalides** : une valeur d'adresse hors schéma (lien ancien ou trafiqué) redevient la valeur par
  défaut, jamais une erreur. Une valeur par défaut n'apparaît pas dans l'adresse (liens courts).
- **Page 1** : tout changement de filtre, de tri ou de taille ramène à la page 1. Si la page demandée n'existe
  plus (éléments supprimés), `usePagination({ total })` ramène sur la dernière page.
- **Historique** : les hooks remplacent l'entrée d'historique (pas de nouvelle entrée par frappe).
  Plusieurs changements dans le même geste (filtre puis page, deux hooks différents) se cumulent sans s'écraser.
- **Taille de page** : une préférence commune à toutes les listes (clé `bons-it:lignes-par-page`) ;
  `usePagination({ storageKey })` pour une liste qui doit avoir la sienne. Stockage bloqué : la taille vaut pour
  la visite en cours.
- **États** : `ListState` affiche dans le cadre de la liste le chargement (annoncé « Chargement… »), l'erreur
  avec « Réessayer » (jamais une fausse liste vide), la liste vide (« Aucun … » et l'action utile) ou vide à cause
  des filtres (« Aucun résultat pour ces filtres » et « Effacer les filtres »). Pendant un rechargement, la liste
  reste affichée (`aria-busy`).
- **Tableau ou cartes** : `ResponsiveList` affiche un tableau à partir de 768 px et **une carte par ligne en
  dessous**. Chaque colonne dit sa place dans la carte (`card: 'title' | 'subtitle' | 'detail' | 'actions' |
  'hidden'`, `detail` par défaut : « libellé : valeur ») ; sur téléphone, le tri passe par une liste déroulante
  « Trier par ». `renderCard` remplace la carte par défaut ; `mode="table" | "cards"` impose un affichage. Une
  liste à sélection multiple ou à lignes dépliables compose son propre tableau avec `SortableHeader` et
  `TH_CLASS`, et garde `ListCards` pour le téléphone : pas de « tableau qui fait tout ».
- **Tailles tactiles** : les boutons de `Pagination` et de `ListState` font 44 px de haut sur téléphone.
- **Liste des bons** (`pages/bons/list/`) : son état vit dans `bonsListQuery.ts` (écriture vers l'adresse,
  l'API et la mémoire du navigateur) et se lit par `readListQuery.ts`, qui vérifie chaque valeur venue de
  l'adresse ou de la mémoire avec les règles du serveur (date réelle, statut connu, identifiant, référence,
  longueur de recherche, tri, période dont le début précède la fin). Une valeur invalide est **écartée et
  signalée** en clair au-dessus de la liste (« Un filtre n'était pas valide et a été ignoré : date de début de
  mise à disposition. »), puis effacée de l'adresse et de la mémoire : un lien abîmé ne bloque jamais la liste.
  Une période inversée saisie à l'écran reste dans ses champs, marquée en erreur avec un message sous les
  dates, mais n'est ni envoyée au serveur ni exportée ni mémorisée. La mémoire garde les filtres choisis à
  l'écran et le tri, jamais la page, la référence exacte ni les périodes posées par un lien du tableau de bord.

### 1.4 Téléchargements

```ts
const { download, downloading, truncated } = useDownload();

await download({
  path: `/audit/export?${query}`,
  fallbackFilename: `journal-audit-${todayInParis()}.csv`, // si le serveur ne nomme pas le fichier
  errorMessage: "Erreur lors de l'export du journal",
  success: CSV_EXPORT_SUCCESS,                              // absent : pas de confirmation (fichier exemple, PDF)
});
```

- Le nom vient du serveur ; `fallbackFilename` n'est qu'un secours, daté à Paris (`todayInParis`, jamais
  `toISOString`, qui date de la veille entre minuit et 2 h).
- Fichier coupé (`truncated`) : une notification « Export incomplet » **reste affichée** jusqu'à ce que
  l'utilisateur la ferme ; `truncated` permet aussi à l'écran de garder un bandeau.
- Erreur : `showActionError` avec le message du serveur ; `download` renvoie alors `null`.
- Un **export CSV de liste** passe par `ExportButton` (§ 1.4 bis), pas directement par `useDownload`.
- Fichier construit dans le navigateur (export JSON des modèles, CSV du catalogue) : `saveBlob(blob, nom)`.
- Aperçu dans un nouvel onglet (PDF) : `api.getFile(path).then(({ blob }) => …)`. Côté collaborateur, un PDF
  s'**ouvre** dans le navigateur (lecteur intégré du téléphone) et ne se télécharge pas :
  `loadBlobIntoTab` (`pages/signature/lib/documentBlob.ts`), onglet ouvert **avant** tout `await` (sinon Safari
  iOS le bloque).

### 1.4 bis Exports CSV (`components/export/`)

Tout écran qui exporte une liste (bons, inventaire, journal d'audit, historique d'un équipement, filiales,
utilisateurs, indicateurs du tableau de bord) utilise **`ExportButton`** :

1. **avant** : le clic ouvre une confirmation qui annonce « N équipements à exporter » et « Filtres : Filiale :
   Paris ; Situation : En cours » ; au-delà du plafond du serveur, elle prévient que le fichier ne contiendra que
   les N premières lignes (bouton « Exporter les N premières lignes ») ; rien à exporter : bouton désactivé ;
2. **après** : si le serveur a coupé le fichier (`X-Truncated`), un bandeau « Export incomplet » reste sous le
   bouton jusqu'à ce que l'utilisateur le ferme ; un fichier complet est confirmé par une notification.

```tsx
<ExportButton
  path={`/bons/export?${query}`}                       // mêmes filtres que la liste, sans pagination
  fallbackFilename={`bons-${todayInParis()}.csv`}
  filters={[{ label: 'Statut', value: 'En cours' }]}    // filtres actifs EN MOTS D'ÉCRAN
  count={list.total}                                    // `total` de la liste (null pendant le chargement)
  limit={list.meta?.exportLimit}                        // plafond annoncé par le serveur
  itemLabel={{ singular: 'bon', plural: 'bons' }}
/>
```

- Nombre de lignes : `count` quand l'écran affiche déjà la liste avec les mêmes filtres ; sinon `loadCount`
  (`(signal) => Promise<number>`), appelé à l'ouverture (route de comptage, ou `total` d'une page de la liste
  avec `limit=25`). Un comptage en échec affiche « Nombre de lignes inconnu » sans bloquer l'export.
  `uncounted` pour un export sans lignes à annoncer (indicateurs).
- Plafond : `limit`, lu dans la réponse du serveur (`meta.exportLimit`) plutôt qu'écrit en dur.
- Options : `label` (« Exporter CSV »), `title`, `note` (précision sur le contenu), `errorMessage`, `className`.
- Briques séparées si l'écran compose autrement : `ExportDialog`, `ExportTruncatedBanner`,
  `useExportDownload`, et les phrases (`countLabel`, `filtersLabel`, `truncatedMessage`).
- Branché sur l'inventaire (`pages/Inventaire.tsx`), le tableau de bord (`KpiExportButton`), l'historique d'un
  équipement (`MaterielHistoryHeader`), les filiales (`FilialesExportButtons`, mêmes filiales que l'écran, avec ou
  sans images) et les comptes créés à la main (`ManualUsersExportButton`, nombre lu par `GET /users?origin=manual`). Le serveur
  envoie le fichier par `sendCsv` (nom daté à Paris, `X-Truncated`, en-têtes exposés au navigateur).

### 1.5 Dates (`lib/dates.ts`)

Une seule façon de formater une date, **toujours à l'heure de Paris** quel que soit le fuseau du navigateur (le
serveur, les PDF et les emails comptent les jours en Europe/Paris).

| Fonction | Exemple | Usage |
|---|---|---|
| `formatDate` | 03/09/2026 | tableaux, fiches (par défaut) |
| `formatDateTime` | 03/09/2026 14:22 | journal, signatures, envois |
| `formatDateLong` | 3 septembre 2026 | en-têtes seulement |
| `formatTime` | 14:22 | heure seule |
| `todayInParis` | 2026-09-24 | valeur d'un champ date, bornes de période, nom de fichier |

Entrée acceptée : texte ISO de l'API, `Date` ou instant en millisecondes. Valeur absente ou invalide : « — ».
`toLocaleDateString`, `toLocaleString` et `toISOString().slice(0, 10)` ne s'écrivent plus dans un écran.

### 1.6 Lexique (`domain/labels.ts`)

**Un objet = un mot**, partout (menu, titres, boutons, messages), selon les décisions du propriétaire du
24/09/2026. Un écran n'écrit jamais un libellé métier en dur : il le lit dans le lexique.

| Contenu | Exemples |
|---|---|
| `BON_STATUS_LABELS` | Brouillon, Remise à signer, En cours, Restitution à signer, Restitution en cours, Clôturé, Annulé, Contesté |
| `RESTITUTION_STEP_LABELS` | PV à signer, Restitution partielle à signer, Équipements encore chez le collaborateur, Perte déclarée |
| `LATENESS_LABELS` | Signature en retard, Retour en retard (jamais « En retard » seul) |
| `ROLE_LABELS`, `CATEGORY_LABELS` | Administrateur…, PC portable… Station d'accueil |
| `SIGNATURE_TYPE_LABELS`, `DOCUMENT_LABELS`, `PDF_SNAPSHOT_LABELS`, `PDF_STAGE_LABELS` | Signature IT, PV de non-restitution |
| `CONTESTATION_STATUS_LABELS` | Ouverte, En cours d'examen, Fondée, Non retenue |
| `NOTIFICATION_TYPE_LABELS` | types d'emails du journal des envois |
| `SCREEN_LABELS` | noms des écrans (Utilisateurs, Catalogue…) |
| `TERMS` | mots dans une phrase : signature IT, cachet de la filiale, PV de non-restitution, non restitué |

Lecture : `bonStatusLabel(s)`, `roleLabel(r)`, `categoryLabel(c)`, `notificationTypeLabel(t)` ou
`labelOrKey(dictionnaire, clé)`, qui renvoient la clé brute pour une valeur inconnue (nouvelle valeur du serveur)
plutôt qu'un vide. Le serveur a ses propres fichiers de libellés (`backend/src/bons/bon-status.ts`,
`backend/src/common/category-labels.ts`) qui emploient **les mêmes mots** : changer un mot, c'est changer les
deux. Les clés de `RESTITUTION_STEP_LABELS` sont provisoires : le lot qui fait calculer ce sous-état au serveur
les aligne sur sa réponse.

### 1.7 Titre de l'onglet, page introuvable, accès par rôle

- **Titre** : « Inventaire · Bons IT ». La mise en page (`Layout`) pose le titre déduit de l'adresse
  (`lib/route-titles.ts`) ; un écran le précise avec `usePageTitle(bon?.reference ?? null)`, qui l'emporte tant
  que l'écran est affiché. Hors mise en page (connexion, page 404), l'écran appelle `usePageTitle` lui-même.
- **Page introuvable** : une adresse inconnue affiche « Page introuvable » et un lien « Retour à l'accueil »
  (`pages/NotFound.tsx`), au lieu de renvoyer en silence à l'accueil.
- **Accès refusé** : un écran réservé à d'autres rôles mène à `/unauthorized`, affichée **dans la coque** (menu
  et en-tête compris) : titre « Accès refusé », explication en français, bouton « Retour à l'accueil » de 44 px
  (`pages/Unauthorized.tsx`). Jamais de code d'erreur brut.
- **Rôles** : `ProtectedRoute` prend des rôles typés (`UserRole[]`, constantes `ADMIN_ONLY`, `IT_STAFF`,
  `IT_AND_DIRECTION` dans `App.tsx`). Le technicien voit et modifie le **Catalogue** ; **Utilisateurs** et
  **Filiales** sont réservés à l'administrateur (menu et routes). Ce filtrage n'est qu'un confort d'affichage :
  le serveur applique les mêmes règles.

### 1.8 ESLint

`npm run lint` (étape « Lint frontend » de la CI) : règles JavaScript et TypeScript recommandées, règles des hooks
React (`exhaustive-deps` en **erreur**) et accessibilité `jsx-a11y`. Configuration : `frontend/eslint.config.js`.

- Une **erreur** bloque la CI. Un **avertissement** signale une dette connue à résorber, sans en ajouter.
- Les règles du compilateur React (`set-state-in-effect`, `refs`, `purity`) sont des avertissements : 65 cas
  existants au 24/09/2026.
- `pages/bons/**` a un bloc « dette connue » (10 avertissements au 24/09/2026) en attendant sa refonte : ne pas y
  ajouter de fichier, corriger plutôt.
- Une exception se justifie sur la ligne : `// eslint-disable-next-line react-hooks/exhaustive-deps -- raison`.
  Une exception devenue inutile est une erreur (`reportUnusedDisableDirectives`).
- Variable volontairement ignorée : préfixe `_`.

### 1.9 Ce qui reste à migrer

Les briques existent ; les écrans les adoptent dans leurs lots (vagues 3 et 4). Réexportations de compatibilité,
à supprimer quand plus rien ne les importe (aujourd'hui : `pages/bons/**`) :

| Ancien import | Remplacé par |
|---|---|
| `api.getBlob` | `api.getFile` / `useDownload` |
| `formatDate…` depuis `@/lib/utils` | `@/lib/dates` |
| `todayInParis` depuis `@/lib/kpi-period` | `@/lib/dates` |
| `ROLE_LABELS`, `notifTypeLabel` depuis `@/lib/labels` | `@/domain/labels` |
| `BON_STATUS_LABELS` depuis `@/types` | `@/domain/labels` |

Copies encore en place :
- **recherche différée** (`setTimeout` recopié, à remplacer par `useDebounce`) :
  `pages/admin/catalogue/useCatalogueFilters.ts`, `pages/admin/email-templates/BonPicker.tsx`,
  `pages/admin/Utilisateurs.tsx`, `pages/inventaire/useInventory.ts`, `pages/bons/create/DuplicateBonButton.tsx`,
  `pages/bons/create/UserAutocomplete.tsx` ;
- **pagination** : `Inventaire.tsx`, `catalogue/CataloguePagination.tsx`, la fenêtre des listes du tableau de
  bord (`dashboard/lists/KpiListDialog.tsx`) (les bons, les contestations, les utilisateurs et le journal
  d'audit passent par `Pagination`, 25/50/100 lignes) ;
- **en-tête triable** : `bons/list/SortableHeader.tsx`, `inventaire/InventorySortHeader.tsx`,
  `inventaire/CollaborateurTable.tsx`, `catalogue/CatalogueTable.tsx` ;
- **libellés** propres à `pages/bons/**` (`bons/detail/types.ts`, `BonAttachments.tsx`, `BonIntegrity.tsx`,
  `bons/list/statusFilterOptions.ts`) ;
- **téléchargements** de `pages/bons/**` (`useBonsExport.ts`, `usePdfDownloads.ts`, `BonAttachments.tsx`,
  `useBonDetailCollaborateur.ts`) ;
- **vérification de session** recopiée dans `pages/signature/hooks/useSignatureToken.ts` (à remplacer par
  `useAuth()`) et `fetch` direct dans `pages/ChangePassword.tsx`.

---

### 1.10 Fiche IT d'un bon : documents et états

« Documents PDF » (`pages/bons/detail/pdf-documents.ts`, `BonPdfSnapshots.tsx`) : titres au vocabulaire du
lexique (« Remise / Restitution / PV de non-restitution — signature IT / signé(e) par le collaborateur »), un
rang par série (type et signataire) et un badge par document : « En vigueur », ou « Ne vaut plus — motif ». En
perte déclarée, le PV prêt (déjà certifié par la signature IT, pas encore émis) apparaît en tête, avec son
signataire et un bouton de téléchargement (`readyPvOf`, `downloadReadyPv`). La colonne « État » des équipements
s'affiche dès qu'une restitution a commencé, et aussi sur un bon contesté dont des équipements sont déjà
marqués (`showsEquipmentState`). Un bon remplacé affiche « Repris sur BON-… », avec un lien vers le remplaçant ;
le brouillon remplaçant rappelle « Remplace le bon contesté BON-… ». Le bloc d'intégrité et les pièces jointes
disent « Signature IT », « Remise », « PV de non-restitution » (jamais « Cachet IT » ni « PV de clôture »).

### 1.11 Tableau de bord : une carte = une liste, ou un « ? »

Toute carte du tableau de bord (`pages/dashboard/**`) ouvre la liste exacte de ce qu'elle compte (`href`), ou
porte un « ? » qui dit pourquoi elle n'en a pas (`noList`, textes dans `lists/kpi-lists.ts` → `NO_LIST`). Pour
la direction, les listes qui mènent à des bons sont remplacées par `NO_LIST.direction`. Une part à 100 % ou à
0 % n'a rien à lister et le dit. Les rangées de cinq cartes utilisent `FIVE_CARD_GRID`
(`components/card-grid.ts`) : 3 colonnes sous 1400 px, pour qu'un titre ne se coupe jamais au milieu d'un mot.
La comparaison à la période précédente dit toujours « contre N sur la période précédente », précédée de l'écart
en % quand il se calcule. Définitions et listes : `docs/architecture.md` § 9.

Une liste « sur la période » dont la liste des bons a l'équivalent exact (`BONS_LIST_FILTERS` dans
`lists/kpi-lists.ts` : créés → `createdFrom/createdTo`, clôturés → `closedFrom/closedTo`, annulés →
`cancelledFrom/cancelledTo`) mène à `/bons` filtré sur la période et la filiale affichées
(`useKpiListHref`) : on y trie, on y exporte. Les autres (envoyés, PV, sans signature, contestations, emails,
signatures) s'ouvrent dans le tableau de bord (`?liste=…`, `KpiListDialog`). N'ajoutez une entrée à
`BONS_LIST_FILTERS` qu'avec la preuve sur base réelle que le filtre donne les mêmes bons que la carte
(`backend/src/kpi/__tests__/kpi-lists.real-db.spec.ts`).

« Bons par statut » : une couleur par statut, la même dans le donut et la légende, en clair comme en sombre
(`lib/status-chart-colors.ts` : les cinq `--chart-*` et `--muted-foreground`, plus deux teintes propres
au graphique ; écart minimal vérifié par `lib/__tests__/status-chart-colors.test.ts`).

### 1.12 Administration : configuration, tests de connexion, journal d'audit

- **Configuration** (`components/admin/ConfigSection.tsx`, `ConfigFields.tsx`) : chaque rubrique lit en plus
  le registre du serveur (`pages/admin/configuration/useConfigRegistry.ts`, GET `/admin/config/registry`).
  Sous un champ vide : « Valeur appliquée : 3 (par défaut) » ; sous un nombre ou un interrupteur saisi,
  « Valeur appliquée : 30 » ; sous une saisie hors bornes ou illisible, l'avertissement de ce qui s'applique
  vraiment (`appliedValue.ts`). Les bornes s'affichent dans l'aide du champ (« Entre 1 et 90 jours. »). Un interrupteur jamais enregistré montre
  l'état que le serveur applique. Ne mettez jamais une valeur par défaut en `placeholder` : un exemple de
  saisie seulement.
- **Tests de connexion et relances** : `onTest` de `ConfigSection` reçoit les valeurs saisies (un secret non
  retapé en est absent) ; l'annuaire les envoie au serveur pour tester ce que l'écran affiche, sans
  enregistrer (`ConfigLdapPage.tsx`). La réponse est toujours `{ ok, message }` (`ConnectionTestResponse`) ;
  l'écran affiche `message`, en rouge quand `ok` est faux (`ConfigTestButtons.tsx`, relance d'une copie SMB).
- **Journal d'audit** (`pages/admin/audit-logs/`) : chaque entrée se lit par la phrase du catalogue
  (`auditEntry.ts`, `fillAuditSentence`), jamais par les clés brutes de `details`. Les filtres et la page
  vivent dans l'adresse (`auditFilters.ts`, `usePagination`) ; pied de liste commun `Pagination`
  (« 1–25 sur 608 entrées », 25/50/100 lignes, choix partagé avec les autres listes) ; l'export passe par
  `ExportButton`.
- **Modèles** : `/email-templates` et `/pdf-templates` (plus sous `/admin`).

## 2. Retours à l'utilisateur

### Notifications (toasts)

- Appel : `import { toast } from '@/hooks/use-toast'` ; rendu par `components/ui/toaster.tsx`. En haut de l'écran
  sur téléphone, en bas à droite à partir de 640 px ; trois au plus à la fois.
- Variantes :
  ```ts
  toast({ title: 'Modèle enregistré', description: '…', variant: 'success' }); // vert : création, enregistrement, envoi
  toast({ title: 'Erreur', description: '…', variant: 'destructive' });        // rouge : échec
  toast({ title: 'Information', description: '…' });                           // neutre
  ```
- Durée : 3 s par défaut, `duration` pour la changer ; `duration: Infinity` garde la notification jusqu'à ce que
  l'utilisateur la ferme (avertissement à lire, comme un export coupé). Les erreurs (`destructive`) restent
  toujours affichées jusqu'à fermeture.
- **Échec d'une action** : `showActionError(e, 'Message de secours')` (`lib/errors.ts`) affiche le message du
  serveur quand il existe. Pour un message dans l'écran : `errorMessage(e, 'Message de secours')`.
- Une notification par action au plus. Titre au format « [Objet] [participe] » (« Modèle enregistré »,
  « Lien renvoyé »).

### Confirmations

- Jamais la boîte native du navigateur (`window.confirm`) pour une action. Une action irréversible ou qui touche
  d'autres personnes passe par une fenêtre de confirmation qui nomme l'objet, porte le verbe de l'action sur le
  bouton et désactive les boutons pendant l'action.
- Composant existant : `ConfirmModal` (`pages/bons/detail/ConfirmModal.tsx`) — props `title`, `message`,
  `onConfirm`, `onCancel`, `danger` (bouton rouge), `loading` (« En cours… », boutons désactivés), `confirmLabel`
  (« Confirmer » par défaut : toujours le remplacer par le verbe de l'action). Il sert aujourd'hui aux écrans du
  bon ; les écrans d'administration ont encore leurs propres fenêtres (à unifier, vague 4).
- Écart connu : le formulaire de bon utilise encore `window.confirm` avant de quitter une saisie non
  enregistrée (`pages/bons/create/useBonFormSnapshot.ts`).

---

## 3. Formulaires

- Validation : schémas zod dans `lib/validation.ts` (`loginSchema`, `changePasswordSchema`, `bonCreateSchema`,
  `contestationSchema`) et `validate(schema, valeurs)`, qui renvoie les erreurs par champ.
- Formulaire d'un bon (`pages/bons/create/`) : `runBonValidation` rend **toutes** les erreurs à la fois, une
  par champ, dans l'ordre de l'écran. Après un premier envoi refusé, `useBonFormErrors` les recalcule à chaque
  saisie : le récapitulatif (`FormErrorSummary`, dont chaque ligne amène à son champ) et le message sous le
  champ (`FieldError`, relié par `aria-describedby`, champ en `aria-invalid`) disparaissent dès la correction.
  Le formulaire est en `noValidate` : la validation du navigateur, qui s'arrête à la première erreur, n'intervient
  pas. Les erreurs du serveur restent dans leur propre bandeau.
- Chaque étiquette est reliée à son champ (`<Label htmlFor>` et `id`) ; les champs de mot de passe portent
  `autoComplete`.
- Saisie non enregistrée : `useUnsavedChangesWarning(dirty)` (`hooks/use-unsaved-changes.ts`) prévient avant de
  fermer l'onglet.
- Chargement d'une ressource simple : `useApiResource(path, messageDeSecours)` (`hooks/use-api-resource.ts`),
  qui ignore une réponse arrivée après une requête plus récente.

---

## 4. Accessibilité et mobile

- Chaque écran fonctionne sur téléphone (375 px de large, tactile) **sans défilement horizontal de la page** ;
  un tableau large défile dans son propre cadre (`overflow-x-auto`) ou passe en cartes (`ResponsiveList`).
- Cibles tactiles d'au moins 44 px sur téléphone (`h-11` sous 640 px).
- Bouton à icône seule : `aria-label` identique à l'info-bulle. Élément cliquable : un vrai `<button>` ou un lien,
  jamais un `<span onClick>` (règle `jsx-a11y` en erreur).
- En-tête triable : `aria-sort` sur le `<th>` et un bouton dedans (`SortableHeader`).
- Messages d'erreur : `role="alert"` ; chargement : `role="status"` avec un texte pour les lecteurs d'écran.
- Mouvement : animations désactivées avec `motion-reduce:` quand l'utilisateur le demande.

### 4.1 Coque de l'application sur téléphone

La coque (menu, en-tête, cadre de page) vit dans `components/layout/`. Téléphone = **moins de 768 px de large, ou
écran tactile de 500 px de haut au plus** (téléphone couché : un Pixel 7 en paysage fait 863 px de large) ; sinon,
tablette et ordinateur gardent le menu latéral repliable. Les deux requêtes, exactement complémentaires, sont dans
`shell-media.ts` : `PHONE_SHELL_QUERY` pour le JavaScript et le bloc « téléphone » d'`index.css`,
`DESKTOP_SHELL_QUERY` pour la variante Tailwind **`shell:`** (`tailwind.config.ts`). Dans la coque, utiliser
`shell:` et non `md:` ; dans le contenu des écrans, `md:` reste la règle.

| Élément | Téléphone (portrait ou paysage) | Tablette et ordinateur |
|---|---|---|
| Menu | Tiroir superposé (`MobileNavDrawer`), fermé par défaut, ouvert par le bouton ☰ de l'en-tête ; entrées avec libellés, 44 px de haut | Menu latéral (`Sidebar`), repliable en colonne d'icônes |
| En-tête | ☰, titre de la page (`lib/route-titles.ts`), loupe (vues IT), menu du compte (qui porte aussi la bascule clair / sombre) | Recherche Ctrl+K (vues IT), bascule du thème, menu du compte |
| Recherche | Loupe → recherche plein écran (`header/MobileSearch.tsx`), champ en 16 px, clavier « Rechercher » | Champ de l'en-tête (`header/GlobalSearch.tsx`) |
| Cadre | Marges de 16 px, aucun défilement de côté : ce qui dépasse est coupé | Inchangé |

- **Menu** : une seule liste d'entrées par vue (`nav-config.ts`), rendue par `NavSections` en variante `rail`
  (menu latéral) ou `drawer` (tiroir). Ne pas dupliquer le menu ailleurs.
- **Rubriques et personne connectée** : IT « Suivi » / « Référentiels » / « Administration », direction
  « Pilotage », collaborateur une seule entrée « Mes équipements » sans rubrique (titre vide). Les vues IT
  finissent aussi par « Mes équipements » (`/mes-equipements`), dans une rubrique sans titre (`mineGroup`) :
  chacun retrouve le matériel qui lui est prêté. `/mes-bons` redirige vers `/mes-equipements` ; la fiche d'un bon
  reste `/mes-bons/:id` (refonte complète du menu en vague 4). Initiales
  identiques partout (`user-initials.ts` : première lettre du prénom et du nom, « Hugo Petit » → « HP ») ;
  aucun badge technique (« local ») à côté du nom.
- **Tiroir couché** (écran de 500 px de haut au plus) : plus large, rubriques sur deux colonnes, et tout le
  tiroir défile (le bloc de la personne n'est plus fixé en bas) : Catalogue et Inventaire restent visibles
  sur un iPhone couché.
- **Tiroir** : fenêtre modale Radix. Focus piégé, Échap et clic à côté le ferment, le focus revient au bouton ☰.
  Le **geste retour** le ferme sans quitter la page (`use-close-on-back.ts` : une entrée d'historique marquée
  est ajoutée à l'ouverture et retirée à la fermeture). Choisir une entrée **remplace** cette entrée par la page
  choisie (`usePanelNavigate`) : le retour ramène à la page d'avant ; choisir la page courante ne fait que
  fermer le panneau (pas de doublon dans l'historique). Même
  mécanisme pour la recherche plein écran ; tout futur panneau plein écran le réutilise.
- **Préférence « menu réduit »** (`sidebar-preference.ts`, clé `sidebar-collapsed`) : tablette et ordinateur
  seulement, jamais le tiroir. Sans choix mémorisé, le menu est réduit sous 1024 px (tablette en portrait).
- **Tableaux** : un tableau plus large que l'écran défile dans son propre cadre. Un cadre `overflow-x-auto`
  de `main` qui contient directement un `<table>` reçoit une ombre au bord qui indique qu'on peut glisser
  (règle `.app-main .overflow-x-auto:has(> table)` d'`index.css`, aussi disponible sous le nom `.scroll-frame`) ;
  les barres d'onglets et groupes de boutons défilants gardent leur fond ; sur téléphone, un `<table>` posé sans cadre
  devient lui-même son cadre. Les listes passeront en cartes (`components/list/`) au fil des écrans.
- **Règles de base** (`index.css`, fin du fichier) : `100dvh` pour la hauteur (barres du navigateur mobile),
  `env(safe-area-inset-*)` pour l'encoche, champs `input` / `select` / `textarea` en **16 px au moins** dans la
  coque « téléphone », couchée comprise (sinon iOS zoome sur le champ touché), classe `touch-target` (44 × 44 px) pour les boutons à icône de
  la coque.
- **Contenu d'un écran** : la coque ne rattrape pas tout. Un en-tête d'écran qui ne passe pas à la ligne
  (titre + boutons sur une ligne) est coupé sur téléphone : prévoir `flex-wrap` ou une pile verticale sous
  `sm`.

### 4.2 Parcours mobile du collaborateur

Le collaborateur reçoit un lien par email et le suit presque toujours sur son téléphone. Ces écrans sont conçus
d'abord pour le doigt ; ils sont vérifiés en recette réelle en iPhone 13 (portrait et paysage), Pixel 7 et petit
Android (Galaxy S9+, 320 px).

- **Connexion depuis le lien** : un seul écran. La page de signature non connectée affiche elle-même
  `LoginCard` : « Continuer avec Microsoft », puis le formulaire du compte local déjà ouvert
  (masqué si la connexion locale est désactivée). Après la connexion, on revient directement au document.
  Champ email : `type="email"`, `autocomplete="username"`, `autocapitalize="none"`, `enterkeyhint="next"` ;
  mot de passe : `autocomplete="current-password"`, `enterkeyhint="go"` ; champs de 44 px en 16 px. Sur un
  écran bas (téléphone en paysage), l'icône disparaît et les deux moyens passent côte à côte : le champ email
  reste visible sans défiler.
- **Page de signature** (`pages/signature/**`) :
  - équipements en **cartes** (désignation, n° de série et d'inventaire en entier), jamais un tableau qui
    défile de côté ;
  - tracé : cadre 2:1 fixe, `touch-action: none` ; un geste à deux doigts ou les évènements `gesture*` de
    Safari sur la zone sont annulés (`useBlockZoomGestures`) : pincer pendant le tracé ne zoome pas ;
  - « Agrandir la zone de signature » (écrans tactiles seulement, `pointer: coarse`) ouvre le **plein écran**
    (`useSignatureFullscreen`) : même canevas, seule la mise en page change, donc le tracé est conservé à
    l'ouverture, à la fermeture et à la rotation. **Couché**, le cadre prend toute la hauteur et les commandes
    (« Effacer », « Terminer ») passent dans une colonne à droite. **Debout**, le cadre prend toute la largeur et
    toute la hauteur laissée par les commandes, **dans le sens de l'écran** : il n'est jamais tourné (une
    signature probante ne doit pas dépendre d'une consigne lue). Une phrase discrète suggère seulement de tourner
    le téléphone pour plus de place. Le canevas prend alors les proportions de son cadre
    (`useSignatureCanvas({ followFrame: true })`, `hooks/signature-geometry.ts`) : le tracé n'est jamais étiré ;
    à chaque changement de taille (rotation, retour au formulaire) les traits sont reportés sans déformation,
    réduits s'il le faut, et l'image envoyée garde toujours 600 × 300, dans le bon sens. Si le cadre bouge
    pendant le tracé (rotation) ou si le navigateur annule le geste, le trait en cours s'arrête proprement et le
    tracé reprend au mouvement suivant du doigt, sans ligne parasite. Échap et le geste retour ferment
    le panneau sans quitter la page ; Tab reste dans le panneau et, à la fermeture, le focus revient sur
    « Agrandir ». Sur Android, le plein écran du navigateur est demandé en plus ; refusé (Safari iOS), le panneau
    couvre quand même tout l'écran. Hors plein écran, le zoom n'est bloqué que sur le cadre du tracé : ailleurs,
    on peut zoomer la page ;
  - `hooks/use-signature-canvas.ts` est partagé avec la signature IT : n'y faire que des ajouts, options par
    défaut inchangées ;
  - temps mesuré sur la version de production (iPhone 13 émulé, cache vide, 3 essais) : document affiché en
    1,0 à 1,6 s en « Fast 4G », 2,6 s en « Slow 4G » ; écran de connexion depuis le lien dans les mêmes temps.
- **Portail** (`/mes-equipements`, `pages/PortailCollaborateur.tsx`, `pages/portail/**`) : « À signer », puis « Chez vous », qui
  liste aussi le matériel d'une **remise à signer** (pastille « À signer », bouton « Signer la remise » une
  fois par bon quand le lien est valide : le jeton d'un lien expiré, que le serveur transmet pour « Demander un
  nouveau lien », n'en fait jamais un), puis les bons. Un bon remplacé (contestation « Fondée ») dont le
  remplaçant est déjà dans le portail ne montre plus ses équipements : chacun n'apparaît qu'une fois. Cartes empilées, cibles de 44 px.
  Chaque carte « à signer » dit le **vrai motif** d'un lien qui ne se signe plus (`documentSituation`,
  `portail/lib/portal-labels.ts`), comme la page du lien : bon modifié (« un nouveau lien vous sera envoyé »),
  contestation **Fondée** d'une restitution ou d'un PV (« votre bon va être corrigé, puis … vous sera renvoyé à
  signer », sans bouton ni « Je ne suis pas d'accord »), lien simplement expiré (« Demander un nouveau lien »,
  ou « Nouveau lien demandé le … » quand le serveur transmet `pendingSignature.newLinkRequestedAt`). Pendant la
  correction, le matériel dont le marquage est contesté (rendu à signer, déclaré non restitué) reste dans
  « Chez vous » avec la pastille « En cours de correction ». Le document lui-même n'est pas dans « À signer » :
  il a son bloc, « En cours de correction par l'équipe informatique ». De même, un document qu'on ne peut ni
  signer ni redemander (bon modifié en attente de sa signature IT, nouveau lien déjà demandé :
  `isAwaitingNewLink`) a son bloc, « En attente d'un nouveau lien », et son matériel porte « Nouveau lien à
  venir » au lieu de « À signer ». Le bandeau du haut compte exactement les cartes de « À signer ». Le titre
  d'une carte ne contredit jamais ce qu'elle dit (`documentCardTitle`) : « Restitution en cours de correction »,
  « … en attente d'un nouveau lien », « … à signer » seulement si quelque chose se signe ou se redemande ; la
  fiche du bon reprend ce titre en sous-titre pendant une correction.
- **Page du lien** (`pages/signature/lib/link-screens.ts`) : un lien invalidé suit la correction grâce à
  `followUp` (serveur) : « Document en cours de correction » tant que rien n'est reparti, puis « Restitution
  corrigée — un nouveau lien vous a été envoyé » (ou « se signe au guichet », ou « plus rien à signer » :
  jamais « un nouveau lien vous sera envoyé » si aucun ne partira). Une 2e restitution se lit comme le PDF
  (`lib/restitution-groups.ts`) : « Équipements restitués » (ce que la signature confirme), « Déjà restitués »
  (restitution précédente, déjà signée) et « Encore chez vous ».
- **Fiche d'un bon** (`pages/bons/BonDetailCollaborateur.tsx`, `pages/bons/collaborateur/**`) : documents
  ouverts dans le navigateur, **chacun par son identifiant** (`/bons/:id/pdf?snapshot=<id>`) : deux restitutions
  signées donnent deux entrées, datées à la minute, avec leur rang (« Bon de restitution signé (1 sur 2) ») ;
  jamais la version d'un PV signée par l'IT seule (`collaboratorDocuments`) ; pièces jointes par `CollabAttachments` : consultables toujours, ajout (photo ou
  PDF, 10 Mo au plus) seulement pendant une signature (remise à signer → étape `mise_disposition`, restitution
  à signer ou en cours → `restitution`), bouton pleine largeur, jamais de choix d'étape. Même règle que le
  serveur (`attachments.controller.ts`).
- **Contestation** (`components/ContestationDialog.tsx`) : sur téléphone, en portrait comme couché, la fenêtre se
  cale en haut de la zone visible (`visualViewport`) et n'en dépasse pas la hauteur ; le champ en cours de saisie est ramené dans la
  zone visible quand le clavier s'ouvre. Boutons de 44 px. Quand la zone visible descend sous
  420 px (téléphone couché, clavier ouvert), la fenêtre se resserre : explication et libellé réservés aux
  lecteurs d'écran, champ sur 2 lignes, « Annuler » et « Envoyer la contestation » collés en bas de la zone
  visible (vérifié à 190 px de haut sur Pixel 7 couché). Le titre laisse la place de la croix de fermeture.
