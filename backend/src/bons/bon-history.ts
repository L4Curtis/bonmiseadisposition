import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import type { BonHistoryEntry } from '../contracts/bons';
import type { ListResponse } from '../contracts/common';
import { AUDIT_ACTIONS, auditSentence, isAuditAction } from '../audit/audit-actions';
import { toFullListResponse, toListResponse } from '../common/pagination';
import { findBonOrThrow } from './queries/bon-where';

/**
 * Historique des actions d'un bon (fiche IT) : qui a fait quoi, et quand, lu
 * dans le journal d'audit et raconté avec les phrases du catalogue
 * (`contracts/audit-actions.ts`), les mêmes que l'écran du journal.
 *
 * Rien de sensible : ni adresse IP, ni navigateur, ni le contenu brut de
 * `details` ; seulement la phrase, dont le gabarit ne reprend que des
 * données d'affichage (référence, motif saisi par l'IT, nombre
 * d'équipements). Réservé à l'équipe informatique.
 */

/** Actions techniques sans intérêt pour l'historique : chaque document
 *  enregistré figure déjà dans le bloc « Documents » de la fiche. */
export const HISTORY_HIDDEN_ACTIONS: readonly string[] = Object.freeze(['pdf_snapshot_saved']);

/** Au-delà, l'historique garde les entrées les plus récentes (`truncated`). */
export const HISTORY_MAX_ENTRIES = 200;

const UNKNOWN_ACTION_LABEL = 'Action non répertoriée';

const HISTORY_SELECT = {
  id: true,
  action: true,
  createdAt: true,
  details: true,
  userEmail: true,
  user: { select: { displayName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type HistoryRow = Prisma.AuditLogGetPayload<{ select: typeof HISTORY_SELECT }>;

/** Nom des auteurs connus par leur seul email (signature, connexion…). */
async function namesByEmail(prisma: Pick<PrismaService, 'user'>, rows: readonly HistoryRow[]): Promise<Map<string, string>> {
  const emails = [...new Set(rows.filter((r) => !r.user && r.userEmail).map((r) => (r.userEmail as string).toLowerCase()))];
  if (emails.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { email: { in: emails, mode: 'insensitive' } },
    select: { email: true, displayName: true },
  });
  return new Map(users.flatMap((u) => (u.email ? [[u.email.toLowerCase(), u.displayName] as const] : [])));
}

/** Auteur affiché : nom du compte, à défaut son email ; `null` pour une
 *  tâche planifiée (la phrase dit alors « Le système »). */
export function historyActorName(row: Pick<HistoryRow, 'user' | 'userEmail'>, names: ReadonlyMap<string, string>): string | null {
  if (row.user) return row.user.displayName || row.user.email;
  if (!row.userEmail) return null;
  return names.get(row.userEmail.toLowerCase()) ?? row.userEmail;
}

/** Une entrée de l'historique, prête à afficher. */
export function toHistoryEntry(row: HistoryRow, bonReference: string, names: ReadonlyMap<string, string>): BonHistoryEntry {
  const actorName = historyActorName(row, names);
  const known = isAuditAction(row.action) ? AUDIT_ACTIONS[row.action] : null;
  return {
    id: row.id,
    at: row.createdAt.toISOString(),
    action: row.action,
    label: known?.label ?? UNKNOWN_ACTION_LABEL,
    tone: known?.tone ?? 'technical',
    sentence: auditSentence({ action: row.action, actorName, bonReference, details: row.details }),
    actorName,
  };
}

/** Historique d'un bon, du plus ancien au plus récent (404 si le bon n'existe pas). */
export async function loadBonHistory(
  prisma: Pick<PrismaService, 'bon' | 'auditLog' | 'user'>,
  bonId: string,
): Promise<ListResponse<BonHistoryEntry>> {
  const bon = await findBonOrThrow(prisma, bonId);
  const where: Prisma.AuditLogWhereInput = { bonId, action: { notIn: [...HISTORY_HIDDEN_ACTIONS] } };
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_MAX_ENTRIES,
      select: HISTORY_SELECT,
    }),
    prisma.auditLog.count({ where }),
  ]);
  const names = await namesByEmail(prisma, rows);
  const items = [...rows].reverse().map((row) => toHistoryEntry(row, bon.reference, names));
  return total > rows.length
    ? toListResponse(items, { total, page: 1, limit: HISTORY_MAX_ENTRIES, truncated: true })
    : toFullListResponse(items);
}
