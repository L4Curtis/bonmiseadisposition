import { Prisma } from '@prisma/client';
import { escapeCsvCell } from '../common/bon-predicates';
import { sanitizeAuditDetails } from '../retention/audit-sanitizer';
import { formatParisDateTime } from './audit-period';

/** En-tête de l'export CSV du journal d'audit (GET /audit/export). L'adresse
 *  IP et l'agent utilisateur ne sont volontairement PAS exportés : ce sont
 *  des données personnelles que la rétention efface (anonymize-bon.ts), et
 *  un fichier CSV circule hors de l'application. */
export const AUDIT_CSV_HEADERS = ['date', 'action', 'utilisateur', 'email_utilisateur', 'bon', 'details'];

/** Nombre maximal d'entrées exportées : au-delà, l'export est tronqué aux
 *  plus récentes et le dépassement est signalé (`X-Truncated`, et
 *  `exportTruncated` dans la réponse de GET /audit pour l'interface). */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

/** Clés supplémentaires retirées par précaution, en plus de celles que la
 *  rétention considère comme personnelles (sanitizeAuditDetails) : aucun
 *  secret ne doit sortir dans un fichier, même si une action future en
 *  journalisait un par erreur. */
const SECRET_KEY_RE = /token|password|secret|hash/i;

/** Entrée du journal telle qu'exportée (sous-ensemble de AuditLog, relations
 *  résolues). */
export interface AuditExportRow {
  createdAt: Date;
  action: string;
  userEmail: string | null;
  details: Prisma.JsonValue;
  bon: { reference: string } | null;
  user: { displayName: string; email: string | null } | null;
}

/** `details` débarrassé des données personnelles et des secrets, sérialisé
 *  en JSON compact (chaîne vide si rien à afficher). */
export function exportableDetails(details: Prisma.JsonValue): string {
  const sanitized = sanitizeAuditDetails(details);
  if (sanitized === null || sanitized === undefined) return '';
  if (typeof sanitized !== 'object' || Array.isArray(sanitized)) return JSON.stringify(sanitized);
  const entries = Object.entries(sanitized).filter(([key]) => !SECRET_KEY_RE.test(key));
  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : '';
}

/**
 * Construit le CSV d'export du journal d'audit (BOM UTF-8, séparateur `;`,
 * cellules échappées via escapeCsvCell contre l'injection de formule).
 * Horodatage à l'heure de Paris. Fonction pure.
 */
export function buildAuditExportCsv(rows: AuditExportRow[]): string {
  const lines = rows.map((row) =>
    [
      formatParisDateTime(row.createdAt),
      row.action,
      row.user?.displayName ?? '',
      row.user?.email ?? row.userEmail ?? '',
      row.bon?.reference ?? '',
      exportableDetails(row.details),
    ].map(escapeCsvCell).join(';'),
  );
  const csv = [AUDIT_CSV_HEADERS.map(escapeCsvCell).join(';'), ...lines].join('\n');
  return String.fromCharCode(0xfeff) + csv;
}
