import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { BonStatus } from '../../common/types';
import { buildCsv, type CsvCell } from '../../common/csv';
import { formatParisDate } from '../../common/dates/paris';
import { bonStatusLabel } from '../bon-status';
import { buildBonWhere, BonListFilters } from '../queries/bon-where';
import { buildBonOrderBy, BonSortField, SortOrder } from '../queries/bon-order';

/** Nombre maximal de lignes exportées en une fois (garde-fou mémoire / temps
 *  de réponse) — au-delà, l'export est tronqué et `truncated:true` renvoyé. */
export const EXPORT_ROW_LIMIT = 5000;

/** `include` Prisma utilisé pour la requête d'export — colonnes réduites au
 *  strict nécessaire pour construire le CSV. */
export const EXPORT_INCLUDE = {
  filiale: { select: { displayName: true } },
  collaborateur: { select: { displayName: true, email: true, department: true } },
  createdBy: { select: { displayName: true, email: true } },
  equipments: { include: { catalogItem: { select: { brand: true, model: true } } } },
  signatures: { where: { signed: true }, select: { type: true, signedAt: true } },
};

/** Forme minimale attendue par `buildExportCsv` — plus permissive que le type
 *  exact généré par Prisma (voir `common/types.NotificationBon` pour le même
 *  procédé ailleurs dans le backend). */
export interface ExportBonRow {
  reference: string;
  status: BonStatus;
  dateMiseDisposition: Date | string | null;
  dateRestitution: Date | string | null;
  createdAt: Date | string;
  filiale: { displayName: string };
  collaborateur: { displayName: string; email: string | null; department: string | null };
  createdBy: { displayName: string };
  equipments: Array<{
    catalogItem: { brand: string; model: string } | null;
    customLabel: string | null;
  }>;
  signatures: Array<{ type: string; signedAt: Date | string | null }>;
}

const EXPORT_HEADERS: readonly string[] = [
  'Référence', 'Statut', 'Filiale', 'Collaborateur', 'Email collaborateur',
  'Service', 'Date mise à disposition', 'Date restitution', 'Nb équipements',
  'Équipements', 'Créé par', 'Date création',
  'Date signature mise à dispo', 'Date signature restitution',
];

/** Découpe les lignes récupérées (EXPORT_ROW_LIMIT + 1) en (lignes à
 *  exporter, tronqué ?). Fonction pure. */
export function sliceExportRows<T>(
  rowsFetched: T[],
  limit: number = EXPORT_ROW_LIMIT,
): { rows: T[]; truncated: boolean } {
  const truncated = rowsFetched.length > limit;
  return { rows: truncated ? rowsFetched.slice(0, limit) : rowsFetched, truncated };
}

/** Désignation des équipements d'un bon, séparés par « | ». */
function equipmentLabels(bon: ExportBonRow): string {
  return bon.equipments
    .map((e) => (e.catalogItem ? `${e.catalogItem.brand} ${e.catalogItem.model}` : e.customLabel ?? ''))
    .join(' | ');
}

/** Une ligne du fichier. Les instants (création, signatures) sont datés à
 *  l'heure de Paris : le serveur tourne en UTC, et un bon signé entre 0 h et
 *  2 h serait sinon daté de la veille. */
function exportRow(bon: ExportBonRow): CsvCell[] {
  const signedAt = (type: string) => bon.signatures.find((s) => s.type === type)?.signedAt;
  return [
    bon.reference,
    bonStatusLabel(bon.status),
    bon.filiale.displayName,
    bon.collaborateur.displayName,
    // Compagnon de chantier sans compte email (voir User.isManualAccount) :
    // « — » plutôt qu'une cellule vide/« null » dans l'export.
    bon.collaborateur.email ?? '—',
    bon.collaborateur.department ?? '',
    formatParisDate(bon.dateMiseDisposition),
    formatParisDate(bon.dateRestitution),
    bon.equipments.length,
    equipmentLabels(bon),
    bon.createdBy.displayName,
    formatParisDate(bon.createdAt),
    formatParisDate(signedAt('mise_disposition')),
    formatParisDate(signedAt('restitution')),
  ];
}

/** Construit le CSV (BOM UTF-8 inclus, pour Excel) à partir des lignes déjà
 *  tronquées. Fonction pure. */
export function buildExportCsv(bons: ExportBonRow[]): string {
  return buildCsv({ header: EXPORT_HEADERS, rows: bons.map(exportRow) });
}

/** Prépare l'export CSV des bons filtrés : requête Prisma (bornée à
 *  EXPORT_ROW_LIMIT + 1 lignes) puis mise en forme pure. Le fichier suit le
 *  même tri que la liste affichée (par défaut : les plus récents d'abord). */
export async function getExportData(
  prisma: PrismaService,
  configService: AppConfigService,
  filters: BonListFilters & { sort?: BonSortField; order?: SortOrder },
): Promise<{ csv: string; truncated: boolean }> {
  const overdueThresholdDays = await configService.getSignatureOverdueDays();
  const where = buildBonWhere(filters, overdueThresholdDays);

  const rowsFetched = await prisma.bon.findMany({
    where,
    orderBy: buildBonOrderBy(filters.sort, filters.order),
    take: EXPORT_ROW_LIMIT + 1,
    include: EXPORT_INCLUDE,
  });
  const { rows: bons, truncated } = sliceExportRows(rowsFetched, EXPORT_ROW_LIMIT);

  return { csv: buildExportCsv(bons), truncated };
}
