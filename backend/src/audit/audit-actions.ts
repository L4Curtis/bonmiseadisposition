/**
 * Catalogue des actions du journal d'audit, côté serveur. La source unique
 * est `contracts/audit-actions.ts`, recopiée telle quelle dans le front : le
 * serveur (export CSV, historique d'un bon) et l'écran du journal affichent
 * ainsi les mêmes libellés et les mêmes phrases.
 *
 * Toute écriture passe par `AuditService.record` (ou `writeAuditEntry` dans
 * une fonction qui reçoit déjà une transaction), qui n'accepte qu'une action
 * de ce catalogue. Ajouter une action : l'ajouter au catalogue (libellé,
 * phrase, domaine, ton), puis `npm run sync-contracts`.
 */
import { AUDIT_ACTIONS, fillAuditSentence } from '../contracts/audit-actions';
import type { AuditAction, AuditSentenceValues } from '../contracts/audit-actions';

export { AUDIT_ACTIONS, AUDIT_ACTION_DOMAINS, AUDIT_SYSTEM_ACTOR, fillAuditSentence } from '../contracts/audit-actions';
export type {
  AuditAction,
  AuditActionDefinition,
  AuditActionDomain,
  AuditActionTone,
  AuditSentenceValues,
} from '../contracts/audit-actions';

/** Phrase d'une action absente du catalogue (ancienne ligne inconnue). */
const UNKNOWN_ACTION_SENTENCE = '{acteur} a effectué une action non répertoriée.';

export function isAuditAction(value: string): value is AuditAction {
  return Object.prototype.hasOwnProperty.call(AUDIT_ACTIONS, value);
}

/** Ce qu'il faut savoir d'une entrée pour la raconter. */
export interface AuditSentenceSource {
  readonly action: string;
  /** Nom affiché (ou email) de l'auteur ; absent pour une tâche planifiée. */
  readonly actorName?: string | null;
  /** Référence du bon concerné (BON-AAAA-NNNN). */
  readonly bonReference?: string | null;
  /** Colonne `details` telle qu'elle est en base. */
  readonly details?: unknown;
}

/** Valeurs de `details` utilisables dans une phrase : textes et nombres de
 *  premier niveau seulement (jamais un objet ni une liste). */
function sentenceValues(details: unknown): Record<string, string | number> {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(
      (entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number',
    ),
  );
}

/** Phrase lisible d'une entrée du journal (« Marie Martin a annulé le bon BON-2026-0042… »). */
export function auditSentence(source: AuditSentenceSource): string {
  const template = isAuditAction(source.action) ? AUDIT_ACTIONS[source.action].sentence : UNKNOWN_ACTION_SENTENCE;
  const values: AuditSentenceValues = {
    ...sentenceValues(source.details),
    acteur: source.actorName ?? null,
    bon: source.bonReference ?? null,
  };
  return fillAuditSentence(template, values);
}
