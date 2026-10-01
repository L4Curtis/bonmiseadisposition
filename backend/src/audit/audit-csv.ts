/**
 * Export CSV du journal d'audit (GET /audit/export), lisible par quelqu'un
 * qui n'a pas l'application sous les yeux : date de Paris en JJ/MM/AAAA HH:MM,
 * libellé de l'action et phrase du catalogue (les mêmes qu'à l'écran), auteur,
 * bon. Aucun code brut, aucune clé technique.
 *
 * L'adresse IP et le navigateur ne sont volontairement PAS exportés : ce sont
 * des données personnelles que la rétention efface (anonymize-bon.ts), et un
 * fichier CSV circule hors de l'application. Pour la même raison, la phrase
 * est construite sans les détails personnels (texte libre, adresses visées).
 */
import { Prisma } from '@prisma/client';
import { buildCsv } from '../common/csv';
import { PARIS_TIME_ZONE } from '../common/dates/paris';
import { sanitizeAuditDetails } from '../retention/audit-sanitizer';
import { AUDIT_ACTIONS, auditSentence, isAuditAction } from './audit-actions';

/** En-tête de l'export (libellés d'écran). */
export const AUDIT_CSV_HEADERS: readonly string[] = ['Date', 'Action', 'Description', 'Auteur', "Email de l'auteur", 'Bon'];

/** Nombre maximal d'entrées exportées : au-delà, l'export est tronqué aux
 *  plus récentes et le dépassement est signalé (`X-Truncated`, et
 *  `meta.exportTruncated` dans la réponse de GET /audit pour l'interface). */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

/** Clés retirées par précaution, en plus des clés personnelles : aucun secret
 *  ne doit sortir dans un fichier, même si une action future en journalisait
 *  un par erreur. */
const SECRET_KEY_RE = /token|password|secret|hash/i;

const auditDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: PARIS_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** « 24/09/2026 14:05 », à l'heure de Paris. */
export function formatAuditDate(instant: Date): string {
  return auditDateFormatter.format(instant).replace(',', '');
}

/** Entrée du journal telle qu'exportée (sous-ensemble de AuditLog, relations résolues). */
export interface AuditExportRow {
  createdAt: Date;
  action: string;
  userEmail: string | null;
  details: Prisma.JsonValue;
  bon: { reference: string } | null;
  user: { displayName: string; email: string | null } | null;
}

/** `details` débarrassé des données personnelles et des secrets. */
export function exportableDetails(details: Prisma.JsonValue): Prisma.JsonObject {
  const sanitized = sanitizeAuditDetails(details);
  if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) return {};
  return Object.fromEntries(Object.entries(sanitized).filter(([key]) => !SECRET_KEY_RE.test(key)));
}

function exportLine(row: AuditExportRow): string[] {
  const authorEmail = row.user?.email ?? row.userEmail ?? '';
  return [
    formatAuditDate(row.createdAt),
    isAuditAction(row.action) ? AUDIT_ACTIONS[row.action].label : row.action,
    auditSentence({
      action: row.action,
      actorName: row.user?.displayName || authorEmail || null,
      bonReference: row.bon?.reference ?? null,
      details: exportableDetails(row.details),
    }),
    row.user?.displayName ?? '',
    authorEmail,
    row.bon?.reference ?? '',
  ];
}

/**
 * Construit le CSV (format commun de common/csv : BOM UTF-8, séparateur `;`,
 * cellules protégées contre l'injection de formule). Fonction pure.
 */
export function buildAuditExportCsv(rows: readonly AuditExportRow[]): string {
  return buildCsv({ header: AUDIT_CSV_HEADERS, rows: rows.map(exportLine) });
}
