import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { BonStatus } from '../../contracts/common';
import type { KpiListItem, KpiListResponse } from '../../contracts/kpi';
import { resolvePeriod } from '../kpi-period';
import { toNumber } from '../kpi-sql';
import { KPI_LIST_DEFAULT_LIMIT, KPI_LIST_MAX_LIMIT } from '../dto/kpi-list-query.dto';
import { KpiListKey, listSourceSql } from './kpi-list-sources';

export interface KpiListQuery {
  indicateur: KpiListKey;
  from?: string;
  to?: string;
  filialeId?: string;
  page?: number;
  limit?: number;
}

interface ListRow {
  id: string;
  bonId: string;
  reference: string;
  status: string;
  collaborateur: string;
  filiale: string;
  at: Date;
  detail: string | null;
}

/** Issue lisible d'une contestation, à partir de son statut. */
const CONTESTATION_DETAIL: Record<string, string> = {
  open: 'À traiter',
  in_review: 'À traiter',
  resolved: 'Fondée',
  rejected: 'Non retenue',
};

/** Nature de l'échec d'un email, à partir de son statut. */
const EMAIL_FAILURE_DETAIL: Record<string, string> = {
  failed: "échec d'envoi",
  bounced: 'rejeté par la messagerie',
};

/** Document signé ou contesté, à partir de son type de signature. */
const DOCUMENT_DETAIL: Record<string, string> = {
  mise_disposition: 'Remise',
  restitution: 'Restitution',
  pv_cloture: 'PV de non-restitution',
};

const DOCUMENT_KEYS: ReadonlySet<KpiListKey> = new Set<KpiListKey>([
  'contestations_fondees',
  'contestations_non_retenues',
  'signatures_a_distance',
  'signatures_sur_place',
  'signatures_mandatees',
]);

/** Texte brut de la source → précision affichée (voir kpi-list-sources.ts). */
function readableDetail(key: KpiListKey, raw: string | null): string | null {
  if (raw === null) return null;
  if (key === 'contestations_recues') return CONTESTATION_DETAIL[raw] ?? null;
  if (DOCUMENT_KEYS.has(key)) return DOCUMENT_DETAIL[raw] ?? null;
  if (key === 'emails_en_echec') {
    const [status, recipient] = raw.split('|', 2);
    return `${recipient} : ${EMAIL_FAILURE_DETAIL[status] ?? status}`;
  }
  return raw;
}

/**
 * Liste du chiffre (`GET /kpi/liste`) : la carte compte les lignes de la même
 * requête source (`countSourceSql`), la liste les affiche, avec le bon, le
 * collaborateur et la filiale. Tri : plus récent d'abord, départagé par
 * l'identifiant (pagination stable).
 */
@Injectable()
export class KpiListService {
  constructor(private readonly prisma: PrismaService) {}

  async getList(query: KpiListQuery): Promise<KpiListResponse> {
    const period = resolvePeriod(query);
    const range = { from: period.from, to: period.to };
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? KPI_LIST_DEFAULT_LIMIT, KPI_LIST_MAX_LIMIT);
    const source = listSourceSql(query.indicateur, range, query.filialeId);

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM (${source}) AS src`),
      this.prisma.$queryRaw<ListRow[]>(Prisma.sql`
        SELECT src.row_id AS id, src.bon_id AS "bonId", b.reference, b.status::text AS status,
               u.display_name AS collaborateur, f.display_name AS filiale, src.at, src.detail
        FROM (${source}) AS src
        JOIN bons b ON b.id = src.bon_id
        JOIN users u ON u.id = b.collaborateur_id
        JOIN filiales f ON f.id = b.filiale_id
        ORDER BY src.at DESC, src.row_id
        LIMIT ${limit} OFFSET ${(page - 1) * limit}
      `),
    ]);

    return {
      indicateur: query.indicateur,
      period: range,
      items: rows.map((row) => toItem(query.indicateur, row)),
      total: toNumber(countRows[0]?.count),
      page,
      limit,
    };
  }
}

function toItem(key: KpiListKey, row: ListRow): KpiListItem {
  return {
    id: row.id,
    bonId: row.bonId,
    reference: row.reference,
    status: row.status as BonStatus,
    collaborateur: row.collaborateur,
    filiale: row.filiale,
    at: row.at.toISOString(),
    detail: readableDetail(key, row.detail),
  };
}
