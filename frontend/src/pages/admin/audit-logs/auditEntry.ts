/**
 * Ce que l'écran du journal montre d'une entrée : le libellé et le ton du
 * catalogue (`@/contracts/audit-actions`, le même que celui du serveur et de
 * l'export CSV) et la phrase lisible. Jamais les clés brutes de `details`.
 */
import { AUDIT_ACTIONS, fillAuditSentence } from '@/contracts/audit-actions';
import type { AuditAction, AuditActionTone, AuditSentenceValues } from '@/contracts/audit-actions';
import type { AuditLogEntry } from './types';

/** Phrase d'une action absente du catalogue (ancienne ligne inconnue). */
const UNKNOWN_ACTION_SENTENCE = '{acteur} a effectué une action non répertoriée.';

export function isCatalogAction(action: string): action is AuditAction {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, action);
}

/** Valeurs de `details` utilisables dans une phrase : textes et nombres de
 *  premier niveau seulement. */
function detailValues(details: AuditLogEntry['details']): Record<string, string | number> {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
    ),
  );
}

/** Nom affiché de l'auteur, sinon son email ; `null` pour une tâche du système. */
export function actorName(entry: AuditLogEntry): string | null {
  return entry.user?.displayName || entry.user?.email || entry.userEmail || null;
}

/** Email de l'auteur quand il diffère du nom affiché. */
export function actorEmail(entry: AuditLogEntry): string | null {
  const email = entry.userEmail ?? entry.user?.email ?? null;
  return email && email !== actorName(entry) ? email : null;
}

export interface AuditEntryView {
  readonly label: string;
  readonly tone: AuditActionTone;
  readonly sentence: string;
}

export function describeAuditEntry(entry: AuditLogEntry): AuditEntryView {
  const values: AuditSentenceValues = {
    ...detailValues(entry.details),
    acteur: actorName(entry),
    bon: entry.bon?.reference ?? null,
  };
  if (!isCatalogAction(entry.action)) {
    return { label: entry.action, tone: 'technical', sentence: fillAuditSentence(UNKNOWN_ACTION_SENTENCE, values) };
  }
  const definition = AUDIT_ACTIONS[entry.action];
  return { label: definition.label, tone: definition.tone, sentence: fillAuditSentence(definition.sentence, values) };
}
