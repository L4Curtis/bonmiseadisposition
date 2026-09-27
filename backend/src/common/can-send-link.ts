import { BadRequestException } from '@nestjs/common';
import { isDeliverableEmail } from './email';

/**
 * « Peut-on envoyer un lien de signature à ce collaborateur ? » — la règle
 * unique, appelée par TOUS les chemins qui envoient un lien ou un rappel :
 * envoi, renvoi, restitution, PV de non-restitution, équipement retrouvé,
 * rappels automatiques (constats R-004 et R-009).
 *
 * Deux conditions, dans cet ordre :
 *  1. le compte est actif : un compte désactivé (départ) ne peut plus se
 *     connecter, donc plus signer à distance ;
 *  2. l'adresse du COMPTE (pas celle recopiée sur le bon à sa création, R-008)
 *     existe et est délivrable (`isDeliverableEmail`).
 *
 * La règle ne lève rien : elle renvoie un résultat explicite, pour que l'écran
 * puisse griser « Envoyer » et dire pourquoi AVANT la signature IT, et que les
 * rappels puissent passer leur chemin sans créer de ligne « échec ».
 * `assertCanSendLink` est la variante qui refuse une requête HTTP.
 */

/** Motifs de refus, du plus prioritaire au moins prioritaire. */
export const LINK_REFUSAL_REASONS = Object.freeze(['inactive_account', 'no_email', 'undeliverable_email'] as const);

export type LinkRefusalReason = (typeof LINK_REFUSAL_REASONS)[number];

/** Ce que la règle lit du compte du collaborateur (modèle User). */
export interface LinkRecipient {
  readonly active: boolean;
  readonly email: string | null | undefined;
}

export interface LinkAllowed {
  readonly allowed: true;
  /** Adresse à utiliser pour l'envoi, sans espaces autour. */
  readonly email: string;
}

export interface LinkRefused {
  readonly allowed: false;
  readonly reason: LinkRefusalReason;
  /** Message en français, affichable tel quel à l'équipe informatique. */
  readonly message: string;
}

export type CanSendLinkResult = LinkAllowed | LinkRefused;

const IN_PERSON_ADVICE = 'Faites signer le document au guichet.';

function refused(reason: LinkRefusalReason, message: string): LinkRefused {
  return Object.freeze({ allowed: false, reason, message });
}

export function canSendLink(recipient: LinkRecipient): CanSendLinkResult {
  if (!recipient.active) {
    return refused(
      'inactive_account',
      `Le compte du collaborateur est désactivé : aucun lien de signature ne peut lui être envoyé. ${IN_PERSON_ADVICE}`,
    );
  }
  const email = (recipient.email ?? '').trim();
  if (email === '') {
    return refused(
      'no_email',
      `Le collaborateur n'a pas d'adresse email : le lien de signature ne peut pas lui être envoyé. ${IN_PERSON_ADVICE}`,
    );
  }
  if (!isDeliverableEmail(email)) {
    return refused(
      'undeliverable_email',
      `L'adresse email du collaborateur (${email}) n'est pas valide : le lien de signature ne peut pas lui être envoyé. Corrigez l'adresse du compte ou faites signer le document au guichet.`,
    );
  }
  return Object.freeze({ allowed: true, email });
}

/**
 * Variante pour une action demandée par l'IT : renvoie l'adresse à utiliser,
 * ou refuse la requête (400) avec le message de la règle.
 */
export function assertCanSendLink(recipient: LinkRecipient): string {
  const result = canSendLink(recipient);
  if (!result.allowed) throw new BadRequestException(result.message);
  return result.email;
}
