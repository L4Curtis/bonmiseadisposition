import { Prisma } from '@prisma/client';
import { TO_SIGN_BON_STATUSES } from '../bons/bon-status';
import { parisTodayAsDbDate, parisTodaySql } from './dates/paris';

/**
 * Définitions métier des indicateurs, partagées par `/bons`, `/kpi/*` et
 * `/reporting/inventory` : **un prédicat par notion**, écrit deux fois — un
 * `where` Prisma pour les listes, un fragment SQL pour les compteurs — et
 * vérifié contre une vraie base (`__tests__/bon-predicates.real-db.spec.ts`)
 * pour que la tuile et la liste qu'elle ouvre comptent les mêmes lignes.
 *
 * Notions : « Signatures attendues » et « Signature en retard » (des bons),
 * « Lien expiré » (des bons), « Retour en retard » (des équipements),
 * « Contestations à traiter », parc en circulation et ses situations,
 * « Encore non restitués », « Hors catalogue » et « Sans numéro de série »
 * (des équipements, vérifiés aussi par `kpi/__tests__/kpi-lists.real-db.spec.ts`).
 * Les listes de statuts vivent dans bons/bon-status.ts.
 */

/** Types de signature pouvant rester en attente sur un bon partially_returned
 *  (PV de non-restitution ou restitution partielle à signer). */
export const PARTIAL_PENDING_SIGNATURE_TYPES = ['restitution', 'pv_cloture'] as const;

/** Types de signature apposés par le collaborateur (hors signature IT). */
export const COLLAB_SIGNATURE_TYPES = ['mise_disposition', 'restitution', 'pv_cloture'] as const;

/** Seuil par défaut (jours) de la « Signature en retard » — voir
 *  `config.rappels.signature_overdue_days`. */
export const DEFAULT_SIGNATURE_OVERDUE_DAYS = 7;

/** Un lien invalidé par l'ancien code est ramené à epoch + 1 s. Les liens
 *  invalidés depuis la vague 2 portent en plus `invalidatedAt` : les deux
 *  marques sont exclues. Un lien simplement expiré reste « en attente ». */
export const INVALIDATED_TOKEN_SENTINEL = new Date(1000);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant en deçà duquel une demande de signature est « en retard ». */
export function overdueCutoff(thresholdDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - thresholdDays * DAY_MS);
}

/** Instant JS lu comme `timestamp` UTC sans fuseau, le type des colonnes
 *  Prisma : indépendant du réglage `TimeZone` de la session Postgres. */
function utcTimestampSql(instant: Date): Prisma.Sql {
  return Prisma.sql`(${instant.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;
}

/** Demande de signature du collaborateur encore ouverte : non signée, ni
 *  invalidée (ancienne ou nouvelle marque). Son lien peut avoir expiré. */
function openRequestWhere(types: readonly string[]): Prisma.SignatureWhereInput {
  return {
    signed: false,
    type: { in: [...types] as Prisma.EnumSignatureTypeFilter['in'] },
    invalidatedAt: null,
    tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
  };
}

function openRequestSql(types: readonly string[]): Prisma.Sql {
  return Prisma.sql`s.bon_id = b.id AND s.signed = false AND s.type::text IN (${Prisma.join(types)})
    AND s.invalidated_at IS NULL AND s.token_expires_at > to_timestamp(1) AT TIME ZONE 'UTC'`;
}

/**
 * « Signatures attendues » (des bons) : remise ou restitution à signer, ou
 * restitution en cours avec un PV ou une restitution partielle encore à
 * signer (lien valable ou expiré, mais pas invalidé).
 * Tuile de l'accueil et `GET /bons?awaitingSignature=1`.
 */
export function buildAwaitingSignatureWhere(): Prisma.BonWhereInput {
  return {
    OR: [
      { status: { in: [...TO_SIGN_BON_STATUSES] } },
      { status: 'partially_returned', signatures: { some: openRequestWhere(PARTIAL_PENDING_SIGNATURE_TYPES) } },
    ],
  };
}

/** Équivalent SQL de `buildAwaitingSignatureWhere`, sur l'alias `b`. */
export function awaitingSignatureSql(): Prisma.Sql {
  return Prisma.sql`(b.status::text IN (${Prisma.join(TO_SIGN_BON_STATUSES)}) OR (b.status::text = 'partially_returned'
    AND EXISTS (SELECT 1 FROM signatures s WHERE ${openRequestSql(PARTIAL_PENDING_SIGNATURE_TYPES)})))`;
}

/**
 * « Signature en retard » (des bons) : signature attendue dont la demande
 * (`awaitingSince`, posé à chaque nouvelle demande de document, inchangé par
 * un renvoi) date de plus de `thresholdDays` jours. Jamais `updatedAt`, qui
 * bouge à chaque écriture technique.
 * Tuile de l'accueil, `GET /bons?overdue=1`, `/kpi/delais.waiting`.
 */
export function buildOverdueSignatureWhere(thresholdDays: number, now: Date = new Date()): Prisma.BonWhereInput {
  return { AND: [buildAwaitingSignatureWhere(), { awaitingSince: { lt: overdueCutoff(thresholdDays, now) } }] };
}

/** Équivalent SQL de `buildOverdueSignatureWhere`, sur l'alias `b`. */
export function overdueSignatureSql(thresholdDays: number, now: Date = new Date()): Prisma.Sql {
  return Prisma.sql`(${awaitingSignatureSql()} AND b.awaiting_since < ${utcTimestampSql(overdueCutoff(thresholdDays, now))})`;
}

/**
 * « Lien expiré » (des bons) : signature attendue dont le lien a expiré sans
 * avoir été remplacé par un lien encore valable. Il faut renvoyer un lien.
 */
export function buildExpiredLinkWhere(now: Date = new Date()): Prisma.BonWhereInput {
  const request = openRequestWhere(COLLAB_SIGNATURE_TYPES);
  return {
    AND: [
      buildAwaitingSignatureWhere(),
      {
        signatures: {
          some: { ...request, isInPerson: false, tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL, lte: now } },
          none: { ...request, tokenExpiresAt: { gt: now } },
        },
      },
    ],
  };
}

/** Contestations « à traiter » : reçues et pas encore tranchées. */
export const CONTESTATION_TO_PROCESS_STATUSES = ['open', 'in_review'] as const;

/** « Contestations à traiter » : tuile de l'accueil, onglet Incidents et
 *  `GET /contestations?aTraiter=1`. */
export function buildContestationToProcessWhere(): Prisma.ContestationWhereInput {
  return { status: { in: [...CONTESTATION_TO_PROCESS_STATUSES] } };
}

/**
 * Parc en circulation : équipements physiquement chez les collaborateurs. Le
 * technicien remet le matériel PUIS envoie le bon à signer : il est donc
 * dehors dès « Remise à signer » (`sent_mise_dispo`) et le reste pendant une
 * contestation. Trois situations mutuellement exclusives, dérivées du statut
 * du bon (clé technique → libellé du lexique) :
 * `en_attente_signature` « Remise à signer », `en_circulation` « En cours »,
 * `en_litige` « Contesté ».
 */
export type EquipmentSituation = 'en_attente_signature' | 'en_circulation' | 'en_litige';

/** Ordre d'affichage stable des situations (attente signature → circulation → litige). */
export const SITUATION_ORDER: readonly EquipmentSituation[] = [
  'en_attente_signature',
  'en_circulation',
  'en_litige',
];

/** Libellés des situations (lexique du 24/09) — utilisés par le résumé et l'export CSV de
 *  l'inventaire, et par la répartition `bySituation` du KPI parc. */
export const SITUATION_LABELS: Record<EquipmentSituation, string> = {
  en_attente_signature: 'Remise à signer',
  en_circulation: 'En cours',
  en_litige: 'Contesté',
};

/** Statuts de bon associés à chaque situation d'équipement. `as const
 *  satisfies` préserve les littéraux (assignables à l'enum Prisma `BonStatus`)
 *  tout en validant la forme de l'objet. */
export const SITUATION_BON_STATUSES = {
  en_attente_signature: ['sent_mise_dispo'],
  en_circulation: ['active', 'sent_restitution', 'partially_returned'],
  en_litige: ['contested'],
} as const satisfies Record<EquipmentSituation, readonly string[]>;

/** Union des 3 situations : statuts de bon du parc en circulation, utilisés
 *  par /reporting/inventory, /kpi/parc et l'accueil. */
export const PARC_BON_STATUSES = [
  ...SITUATION_BON_STATUSES.en_attente_signature,
  ...SITUATION_BON_STATUSES.en_circulation,
  ...SITUATION_BON_STATUSES.en_litige,
] as const;

/** Situation d'un équipement à partir du statut de son bon, ou `null` si ce
 *  statut ne fait pas partie du parc en circulation (`draft`, `archived`,
 *  `cancelled`). */
export function situationForBonStatus(status: string): EquipmentSituation | null {
  return (
    SITUATION_ORDER.find((situation) => (SITUATION_BON_STATUSES[situation] as readonly string[]).includes(status)) ??
    null
  );
}

/** Équipement « en circulation » (définition élargie) : ni rendu ni déclaré
 *  non rendu, sur un bon dont le statut ∈ PARC_BON_STATUSES (+ filtre filiale
 *  optionnel). */
export function buildParcEquipmentWhere(filters?: { filialeId?: string }): Prisma.BonEquipmentWhereInput {
  const and: Prisma.BonEquipmentWhereInput[] = [
    { returnedAt: null },
    { notReturned: false },
    { bon: { status: { in: [...PARC_BON_STATUSES] } } },
  ];
  if (filters?.filialeId) {
    and.push({ bon: { filialeId: filters.filialeId } });
  }
  return { AND: and };
}

/** Équivalent SQL de `buildParcEquipmentWhere`, sur les alias `be`
 *  (bon_equipments) et `b` (bons) — ne couvre pas le filtre filiale (ajouté
 *  séparément par l'appelant selon son propre alias de jointure). */
export function parcEquipmentSql(): Prisma.Sql {
  return Prisma.sql`be.returned_at IS NULL AND be.not_returned = false AND b.status::text IN (${Prisma.join(PARC_BON_STATUSES)})`;
}

/** Expression SQL (`CASE`) renvoyant la situation (texte) d'un équipement à
 *  partir du statut de son bon (alias `b`). Le `ELSE 'en_circulation'` suppose
 *  que la requête appelante filtre déjà sur `parcEquipmentSql()` (statut ∈
 *  PARC_BON_STATUSES) : une fois `en_attente_signature` et `en_litige`
 *  écartés, seule reste la situation `en_circulation`. */
export function situationCaseSql(): Prisma.Sql {
  return Prisma.sql`CASE
    WHEN b.status::text IN (${Prisma.join(SITUATION_BON_STATUSES.en_attente_signature)}) THEN 'en_attente_signature'
    WHEN b.status::text IN (${Prisma.join(SITUATION_BON_STATUSES.en_litige)}) THEN 'en_litige'
    ELSE 'en_circulation'
  END`;
}

/** Normalise des compteurs `{ situation, count }` (résultat d'un `GROUP BY`
 *  SQL, donc potentiellement partiel) en un tableau couvrant toujours les 3
 *  situations dans SITUATION_ORDER, complété à 0 pour celles absentes du
 *  résultat (aucun équipement dans cette situation). */
export function buildSituationBreakdown(
  rows: { situation: string; count: number }[],
): { situation: EquipmentSituation; label: string; count: number }[] {
  const counts = new Map(rows.map((r) => [r.situation, r.count]));
  return SITUATION_ORDER.map((situation) => ({
    situation,
    label: SITUATION_LABELS[situation],
    count: counts.get(situation) ?? 0,
  }));
}

/**
 * « Retour en retard » (des équipements) : équipement en circulation dont la
 * date de restitution prévue (date civile) est antérieure à aujourd'hui à
 * Paris. Tuile de l'accueil et de l'onglet Parc, `/inventaire?overdue=1`.
 */
export function buildReturnOverdueEquipmentWhere(
  filters?: { filialeId?: string },
  now: Date = new Date(),
): Prisma.BonEquipmentWhereInput {
  return {
    AND: [
      ...(buildParcEquipmentWhere(filters).AND as Prisma.BonEquipmentWhereInput[]),
      { bon: { dateRestitution: { lt: parisTodayAsDbDate(now) } } },
    ],
  };
}

/** Équivalent SQL de `buildReturnOverdueEquipmentWhere` (alias `be`, `b`),
 *  sans le filtre filiale. */
export function returnOverdueEquipmentSql(): Prisma.Sql {
  return Prisma.sql`${parcEquipmentSql()} AND b.date_restitution IS NOT NULL AND b.date_restitution < ${parisTodaySql()}`;
}

/** Situation « Non restitué » de l'inventaire : équipement déclaré non
 *  restitué et pas retrouvé. Elle n'appartient pas au parc chez les
 *  collaborateurs : la choisir dans le filtre remplace ce parc par ces
 *  équipements. */
export const NOT_RETURNED_SITUATION = 'non_restitue';
export const NOT_RETURNED_LABEL = 'Non restitué';

/** Situation affichée par l'inventaire : l'une des trois du parc, ou « Non restitué ». */
export type InventorySituation = EquipmentSituation | typeof NOT_RETURNED_SITUATION;

/** Valeurs acceptées par le filtre `situation` de l'inventaire. */
export const INVENTORY_SITUATIONS: readonly InventorySituation[] = [...SITUATION_ORDER, NOT_RETURNED_SITUATION];

/**
 * « Encore non restitués » (des équipements) : déclarés non restitués et pas
 * retrouvés depuis (retrouver l'équipement remet `notReturned` à faux), y
 * compris sur un bon clôturé par un PV ; jamais sur un bon annulé.
 * Cartes des onglets Parc et Incidents, `/inventaire?situation=non_restitue`.
 */
export function buildNotReturnedEquipmentWhere(filters?: { filialeId?: string }): Prisma.BonEquipmentWhereInput {
  const and: Prisma.BonEquipmentWhereInput[] = [{ notReturned: true }, { bon: { status: { not: 'cancelled' } } }];
  if (filters?.filialeId) and.push({ bon: { filialeId: filters.filialeId } });
  return { AND: and };
}

/** Équivalent SQL de `buildNotReturnedEquipmentWhere` (alias `be`, `b`),
 *  sans le filtre filiale. */
export function notReturnedEquipmentSql(): Prisma.Sql {
  return Prisma.sql`be.not_returned = true AND b.status::text <> 'cancelled'`;
}

/** « Hors catalogue » : équipement saisi en texte libre, sans article du
 *  Catalogue. Carte de l'onglet Parc, `/inventaire?horsCatalogue=1`. */
export const OFF_CATALOG_WHERE: Prisma.BonEquipmentWhereInput = { catalogItemId: null };

/** Équivalent SQL de `OFF_CATALOG_WHERE` (alias `be`). */
export function offCatalogSql(): Prisma.Sql {
  return Prisma.sql`be.catalog_item_id IS NULL`;
}

/**
 * « Sans numéro de série » : absent, vide ou fait seulement d'espaces — on ne
 * peut ni retrouver l'équipement par son numéro ni le rapprocher d'un autre
 * outil. La saisie enlève déjà les espaces autour du numéro ; des numéros
 * faits d'espaces ne peuvent venir que de données plus anciennes.
 * Carte « Avec numéro de série » (son contraire), `/inventaire?sansNumeroSerie=1`.
 *
 * Prisma ne sait pas comparer une valeur débarrassée de ses espaces : la
 * liste reçoit les valeurs blanches présentes en base (`BLANK_SERIAL_VALUES_SQL`,
 * quelques chaînes au plus) et les nomme une à une.
 */
export function buildMissingSerialWhere(blankValues: readonly string[]): Prisma.BonEquipmentWhereInput {
  return { OR: [{ serialNumber: null }, { serialNumber: { in: [...new Set(['', ...blankValues])] } }] };
}

/** Numéro blanc en SQL : vide ou fait seulement d'espaces (alias `be`). */
const BLANK_SERIAL_SQL = Prisma.sql`be.serial_number ~ '^[[:space:]]*$'`;

/** Valeurs distinctes de numéro de série blanches (non NULL) présentes en
 *  base : ce que `buildMissingSerialWhere` doit nommer. */
export const BLANK_SERIAL_VALUES_SQL = Prisma.sql`
  SELECT DISTINCT be.serial_number AS value FROM bon_equipments be WHERE ${BLANK_SERIAL_SQL}`;

/** Équivalent SQL de `buildMissingSerialWhere` (alias `be`). */
export function missingSerialSql(): Prisma.Sql {
  return Prisma.sql`(be.serial_number IS NULL OR ${BLANK_SERIAL_SQL})`;
}

/** Contraire SQL de `missingSerialSql` (alias `be`) : numéro renseigné. */
export function withSerialSql(): Prisma.Sql {
  return Prisma.sql`NOT ${missingSerialSql()}`;
}
