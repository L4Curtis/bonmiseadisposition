import { Prisma } from '@prisma/client';

/**
 * Définitions métier unifiées, partagées par `/bons`, `/reporting/inventory`
 * et `/kpi/*` — auparavant dupliquées (avec de légères divergences) dans
 * bons.service.ts, inventory.service.ts et l'ancien module Reporting
 * (supprimé). Une seule définition par notion : « prêté », « en retard de
 * signature », « clôturé ».
 */

/** [Ancienne définition, avant l'audit du 2026-09-18] Statuts pour lesquels un
 *  équipement non rendu était considéré « prêté ». Sous-ensemble plus étroit
 *  que PARC_BON_STATUSES (ci-dessous) : il excluait `sent_mise_dispo` (bon
 *  envoyé, matériel déjà remis au collaborateur, signature en attente jusqu'à
 *  DEFAULT_SIGNATURE_OVERDUE_DAYS jours) et `contested` (litige ouvert) — alors
 *  que dans les deux cas le matériel est physiquement chez le collaborateur.
 *  Conservée pour tout code qui aurait explicitement besoin de cette
 *  définition plus étroite (aucun appelant actuel) ; /reporting/inventory et
 *  /kpi/parc utilisent désormais PARC_BON_STATUSES / buildParcEquipmentWhere /
 *  parcEquipmentSql, définis plus bas. */
export const LOANED_BON_STATUSES = ['active', 'sent_restitution', 'partially_returned'] as const;

/** Statuts d'un bon définitivement clos (n'apparaît plus dans les listes actives). */
export const CLOSED_BON_STATUSES = ['archived', 'cancelled'] as const;

/** Statuts d'un bon encore « vivant » (workflow en cours). */
export const IN_PROGRESS_BON_STATUSES = [
  'draft', 'sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested',
] as const;

/** Statuts en attente d'une signature collaborateur (hors partially_returned,
 *  traité séparément car partiel). */
export const WAITING_SIGNATURE_STATUSES = ['sent_mise_dispo', 'sent_restitution'] as const;

/** Types de signature pouvant rester en attente sur un bon partially_returned
 *  (PV de clôture ou co-signature de restitution résiduelle). */
export const PARTIAL_PENDING_SIGNATURE_TYPES = ['restitution', 'pv_cloture'] as const;

/** Types de signature apposés par le collaborateur (hors cachet interne IT). */
export const COLLAB_SIGNATURE_TYPES = ['mise_disposition', 'restitution', 'pv_cloture'] as const;

/** Seuil par défaut (jours) avant qu'un bon en attente de signature soit
 *  considéré « en retard » — voir `config.rappels.signature_overdue_days`. */
export const DEFAULT_SIGNATURE_OVERDUE_DAYS = 7;

/** Un token invalidé volontairement (resend, contestation, clôture) est mis à
 *  epoch 0 par convention. Un token simplement expiré naturellement (jamais
 *  invalidé) reste `> epoch` et doit continuer à compter comme « en attente »
 *  (aligné sur le cron de rappels) — la sentinelle exclut donc uniquement les
 *  lignes invalidées, pas les lignes expirées. */
export const INVALIDATED_TOKEN_SENTINEL = new Date(1000);

/** Date en-deçà de laquelle un bon en attente de signature depuis `thresholdDays`
 *  jours est considéré en retard. */
export function overdueCutoff(thresholdDays: number, now: Date = new Date()): Date {
  return new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
}

/**
 * En retard de signature (N = thresholdDays) : `updatedAt` antérieur au seuil
 * ET (statut ∈ WAITING_SIGNATURE_STATUSES OU (partially_returned ET une
 * signature non signée de type ∈ PARTIAL_PENDING_SIGNATURE_TYPES dont le token
 * n'est pas invalidé volontairement)).
 *
 * Utilisé par `GET /bons?overdue=1`, `GET /bons/stats.overdue`,
 * `/kpi/delais.waiting`, badge « En retard » des bons récents.
 */
export function buildOverdueSignatureWhere(
  thresholdDays: number,
  now: Date = new Date(),
): Prisma.BonWhereInput {
  return {
    updatedAt: { lt: overdueCutoff(thresholdDays, now) },
    OR: [
      { status: { in: [...WAITING_SIGNATURE_STATUSES] } },
      {
        status: 'partially_returned',
        signatures: {
          some: {
            signed: false,
            type: { in: [...PARTIAL_PENDING_SIGNATURE_TYPES] },
            tokenExpiresAt: { gt: INVALIDATED_TOKEN_SENTINEL },
          },
        },
      },
    ],
  };
}

/** Équivalent SQL de `buildOverdueSignatureWhere`, sur l'alias `b` (bons) —
 *  utilisé dans les requêtes `$queryRaw` du module KPI. `to_timestamp(1)`
 *  correspond exactement à `INVALIDATED_TOKEN_SENTINEL` (epoch + 1 seconde). */
export function overdueSignatureSql(thresholdDays: number): Prisma.Sql {
  return Prisma.sql`b.updated_at < now() - (${thresholdDays}::int * interval '1 day') AND (b.status::text IN (${Prisma.join(WAITING_SIGNATURE_STATUSES)}) OR (b.status::text = 'partially_returned' AND EXISTS (SELECT 1 FROM signatures s WHERE s.bon_id = b.id AND s.signed = false AND s.type::text IN (${Prisma.join(PARTIAL_PENDING_SIGNATURE_TYPES)}) AND s.token_expires_at > to_timestamp(1))))`;
}

/** [Ancienne définition, cf. LOANED_BON_STATUSES] Équipement « prêté » : ni
 *  rendu ni déclaré non rendu, sur un bon dont le statut ∈ LOANED_BON_STATUSES
 *  (+ filtre filiale optionnel). Aucun appelant actuel — préférer
 *  `buildParcEquipmentWhere` (définition élargie, ci-dessous). */
export function buildLoanedEquipmentWhere(filters?: { filialeId?: string }): Prisma.BonEquipmentWhereInput {
  const and: Prisma.BonEquipmentWhereInput[] = [
    { returnedAt: null },
    { notReturned: false },
    { bon: { status: { in: [...LOANED_BON_STATUSES] } } },
  ];
  if (filters?.filialeId) {
    and.push({ bon: { filialeId: filters.filialeId } });
  }
  return { AND: and };
}

/** [Ancienne définition] Équivalent SQL de `buildLoanedEquipmentWhere`, sur
 *  les alias `be` (bon_equipments) et `b` (bons) — ne couvre pas le filtre
 *  filiale (ajouté séparément par l'appelant selon son propre alias de
 *  jointure). Aucun appelant actuel — préférer `parcEquipmentSql` ci-dessous. */
export function loanedEquipmentSql(): Prisma.Sql {
  return Prisma.sql`be.returned_at IS NULL AND be.not_returned = false AND b.status::text IN (${Prisma.join(LOANED_BON_STATUSES)})`;
}

/**
 * Situation « en circulation » d'un équipement, dérivée du statut de son bon.
 *
 * Audit du 2026-09-18 : dans le processus réel, le technicien remet le
 * matériel PUIS envoie le bon à signer — le matériel est donc physiquement
 * chez le collaborateur dès `sent_mise_dispo`, et le reste pendant tout litige
 * (`contested`). LOANED_BON_STATUSES excluait ces deux statuts, si bien que ce
 * matériel disparaissait à tort de l'inventaire et des indicateurs de parc.
 *
 * Le parc « en circulation » exposé par /reporting/inventory et /kpi/parc
 * utilise donc désormais PARC_BON_STATUSES, une définition élargie et
 * explicite, décomposée en 3 situations mutuellement exclusives.
 */
export type EquipmentSituation = 'en_attente_signature' | 'en_circulation' | 'en_litige';

/** Ordre d'affichage stable des situations (attente signature → circulation → litige). */
export const SITUATION_ORDER: readonly EquipmentSituation[] = [
  'en_attente_signature',
  'en_circulation',
  'en_litige',
];

/** Libellés FR des situations — utilisés par le résumé et l'export CSV de
 *  l'inventaire, et par la répartition `bySituation` du KPI parc. */
export const SITUATION_LABELS: Record<EquipmentSituation, string> = {
  en_attente_signature: 'En attente de signature',
  en_circulation: 'En circulation',
  en_litige: 'En litige',
};

/** Statuts de bon associés à chaque situation d'équipement. `as const
 *  satisfies` préserve les littéraux (assignables à l'enum Prisma `BonStatus`)
 *  tout en validant la forme de l'objet. */
export const SITUATION_BON_STATUSES = {
  en_attente_signature: ['sent_mise_dispo'],
  en_circulation: ['active', 'sent_restitution', 'partially_returned'],
  en_litige: ['contested'],
} as const satisfies Record<EquipmentSituation, readonly string[]>;

/** Union des 3 situations : définition élargie et explicite du parc « en
 *  circulation », utilisée par /reporting/inventory et /kpi/parc. Remplace
 *  LOANED_BON_STATUSES comme filtre de statut de référence pour ces deux
 *  modules. */
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

/** Libellés FR des catégories d'équipement — copie unique (anciennement
 *  dupliquée dans inventory.service.ts et l'ancien service de reporting,
 *  supprimé). */
export const CATEGORY_LABELS: Record<string, string> = {
  pc_portable: 'PC portable',
  pc_fixe: 'PC fixe',
  ecran: 'Écran',
  souris: 'Souris',
  clavier: 'Clavier',
  casque: 'Casque',
  telephone: 'Téléphone',
  housse: 'Housse',
  dock: 'Station d’accueil',
  cable: 'Câble',
  autre: 'Autre',
};

/** Échappement CSV : neutralise l'injection de formule (Excel/LibreOffice
 *  exécutent une cellule commençant par = + - @) et double les guillemets
 *  internes — copie unique (anciennement dupliquée dans inventory.service.ts,
 *  bons.service.ts et l'ancien service de reporting, supprimé). */
export function escapeCsvCell(value: string): string {
  let s = String(value ?? '').replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s}"`;
}
