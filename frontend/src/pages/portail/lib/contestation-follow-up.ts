import type { MyContestation } from '@/contracts/contestations';
import type { LinkSignatureType } from '@/contracts/bons';
import { CONTESTATION_OUTCOME_LABELS, signatureStepInSentence } from '@/domain/labels';
import { formatDateLong } from '@/lib/dates';

/** Ton d'affichage d'une étape du suivi. */
export type FollowUpTone = 'waiting' | 'in_progress' | 'founded' | 'not_retained';

/** Où en est la contestation, dit au collaborateur (R-055). */
export interface ContestationFollowUp {
  tone: FollowUpTone;
  /** « Envoyée le 16 septembre 2026 — pas encore prise en charge ». */
  label: string;
}

/** « la remise », « la restitution », « le PV de non-restitution ». */
export function contestedDocumentPhrase(document: LinkSignatureType | null): string {
  if (document === 'pv_cloture') return `le ${signatureStepInSentence('pv_cloture')}`;
  if (document === 'restitution') return 'la restitution';
  return 'la remise';
}

/** Étape réelle : envoyée / prise en charge / Fondée / Non retenue, avec sa date. */
export function contestationFollowUp(c: MyContestation): ContestationFollowUp {
  if (c.outcome) {
    const decidedOn = c.resolvedAt ? ` le ${formatDateLong(c.resolvedAt)}` : '';
    return { tone: c.outcome, label: `${CONTESTATION_OUTCOME_LABELS[c.outcome]}${decidedOn}` };
  }
  if (c.reviewedAt) {
    return {
      tone: 'in_progress',
      label: `Prise en charge le ${formatDateLong(c.reviewedAt)} par l’équipe informatique`,
    };
  }
  return { tone: 'waiting', label: `Envoyée le ${formatDateLong(c.createdAt)} — pas encore prise en charge` };
}

/** Ce que la décision change pour le collaborateur, en une phrase.
 *  « Fondée » : une restitution ou un PV est corrigé sur le bon lui-même ;
 *  une remise, par un bon corrigé, que l'en-tête de la fiche annonce déjà
 *  quand il existe (pas deux fois la même phrase). */
export function outcomeExplanation(c: MyContestation): string | null {
  if (c.outcome === 'founded') {
    if (c.contestedDocument === 'restitution') {
      return 'Votre bon va être corrigé, puis la restitution vous sera renvoyée à signer.';
    }
    if (c.contestedDocument === 'pv_cloture') {
      return `Votre bon va être corrigé, puis le ${signatureStepInSentence('pv_cloture')} vous sera renvoyé à signer.`;
    }
    return c.replacementBon ? null : 'Un bon corrigé va remplacer celui-ci : vous le recevrez à signer.';
  }
  if (c.outcome === 'not_retained') return 'Le bon reste tel quel.';
  return null;
}

/** Contestation la plus récente de chaque bon. */
export function latestContestationByBon(list: readonly MyContestation[]): ReadonlyMap<string, MyContestation> {
  const byBon = new Map<string, MyContestation>();
  for (const c of list) {
    const known = byBon.get(c.bon.id);
    if (!known || c.createdAt > known.createdAt) byBon.set(c.bon.id, c);
  }
  return byBon;
}
