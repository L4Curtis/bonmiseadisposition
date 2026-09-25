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
| Appeler le serveur | `api.get/post/put/patch/delete`, `api.getFile` | `lib/api.ts` |
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
erreurs lisibles (`ApiError` avec `status` et le message du serveur). Aucun écran n'appelle `fetch` directement.

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
- Connexion locale : `Login.tsx` renvoie à `returnTo` (ou le transmet au changement de mot de passe forcé).
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
- Fichier construit dans le navigateur (export JSON des modèles, CSV du catalogue) : `saveBlob(blob, nom)`.
- Aperçu dans un nouvel onglet (PDF) : `api.getFile(path).then(({ blob }) => …)`.

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
- **recherche différée** (`setTimeout` recopié, à remplacer par `useDebounce`) : `components/layout/header/GlobalSearch.tsx`,
  `pages/admin/catalogue/useCatalogueFilters.ts`, `pages/admin/email-templates/BonPicker.tsx`,
  `pages/admin/Utilisateurs.tsx`, `pages/inventaire/useInventory.ts`, `pages/bons/create/DuplicateBonButton.tsx`,
  `pages/bons/create/UserAutocomplete.tsx` ;
- **pagination** : `Utilisateurs.tsx`, `AuditLogs.tsx`, `Contestations.tsx`, `Inventaire.tsx`,
  `catalogue/CataloguePagination.tsx`, `bons/list/BonsPagination.tsx` ;
- **en-tête triable** : `bons/list/SortableHeader.tsx`, `inventaire/InventorySortHeader.tsx`,
  `inventaire/CollaborateurTable.tsx`, `catalogue/CatalogueTable.tsx` ;
- **libellés** propres à `pages/bons/**` (`bons/detail/types.ts`, `BonAttachments.tsx`, `BonIntegrity.tsx`,
  `bons/list/statusFilterOptions.ts`) ;
- **téléchargements** de `pages/bons/**` (`useBonsExport.ts`, `usePdfDownloads.ts`, `BonAttachments.tsx`,
  `useBonDetailCollaborateur.ts`) ;
- **vérification de session** recopiée dans `pages/signature/hooks/useSignatureToken.ts` (à remplacer par
  `useAuth()`) et `fetch` direct dans `pages/ChangePassword.tsx`.

---

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
