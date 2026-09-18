import { PrismaService } from '../../prisma/prisma.service';
import { AppConfigService } from '../../config/config.service';
import { STATUS_LABELS } from '../../common/status-labels';
import { escapeCsvCell } from '../../common/bon-predicates';
import { BonStatus } from '../../common/types';
import { buildBonWhere, BonListFilters } from '../queries/bon-where';

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

const EXPORT_HEADERS = [
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

/** Construit le CSV (BOM UTF-8 inclus, pour Excel) à partir des lignes déjà
 *  tronquées. Fonction pure. */
export function buildExportCsv(bons: ExportBonRow[]): string {
  const rows = bons.map((b) => {
    const sigMise = b.signatures.find((s) => s.type === 'mise_disposition');
    const sigRest = b.signatures.find((s) => s.type === 'restitution');
    const equipLabel = b.equipments
      .map((e) =>
        e.catalogItem
          ? `${e.catalogItem.brand} ${e.catalogItem.model}`
          : e.customLabel ?? '',
      )
      .join(' | ');
    return [
      b.reference,
      STATUS_LABELS[b.status] ?? b.status,
      b.filiale.displayName,
      b.collaborateur.displayName,
      // Compagnon de chantier sans compte email (voir User.isManualAccount) :
      // « — » plutôt qu'une cellule vide/« null » dans l'export.
      b.collaborateur.email ?? '—',
      b.collaborateur.department ?? '',
      b.dateMiseDisposition ? new Date(b.dateMiseDisposition).toLocaleDateString('fr-FR') : '',
      b.dateRestitution ? new Date(b.dateRestitution).toLocaleDateString('fr-FR') : '',
      String(b.equipments.length),
      equipLabel,
      b.createdBy.displayName,
      new Date(b.createdAt).toLocaleDateString('fr-FR'),
      sigMise?.signedAt ? new Date(sigMise.signedAt).toLocaleDateString('fr-FR') : '',
      sigRest?.signedAt ? new Date(sigRest.signedAt).toLocaleDateString('fr-FR') : '',
    ].map(escapeCsvCell);
  });

  return '﻿' + [EXPORT_HEADERS.map(escapeCsvCell).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
}

/** Prépare l'export CSV des bons filtrés : requête Prisma (bornée à
 *  EXPORT_ROW_LIMIT + 1 lignes) puis mise en forme pure. */
export async function getExportData(
  prisma: PrismaService,
  configService: AppConfigService,
  filters: BonListFilters,
): Promise<{ csv: string; truncated: boolean }> {
  const overdueThresholdDays = await configService.getSignatureOverdueDays();
  const where = buildBonWhere(filters, overdueThresholdDays);

  const rowsFetched = await prisma.bon.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: EXPORT_ROW_LIMIT + 1,
    include: EXPORT_INCLUDE,
  });
  const { rows: bons, truncated } = sliceExportRows(rowsFetched, EXPORT_ROW_LIMIT);

  return { csv: buildExportCsv(bons), truncated };
}
