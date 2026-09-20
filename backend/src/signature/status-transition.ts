import { BonStatus } from '../common/types';

/** Callback de log optionnel — évite de faire de ce module pur une dépendance
 *  directe de nestjs/common (Logger) tout en conservant le message d'avertissement
 *  d'origine à l'identique. */
export interface StatusTransitionLogger {
  warn(message: string): void;
}

/**
 * Calcule le statut suivant d'un bon après une signature. Fonction pure
 * extraite de SignatureService.getNextBonStatus — comportement inchangé,
 * y compris le message de warning en cas de transition invalide.
 */
export function getNextBonStatus(
  currentStatus: string,
  signatureType: string,
  logger?: StatusTransitionLogger,
  hasNotReturnedEquipment = false,
): BonStatus | string {
  // Validate transitions: only advance from expected states
  const validTransitions: Record<string, { from: string[]; to: string }> = {
    mise_disposition: { from: ['sent_mise_dispo'], to: 'active' },
    restitution: { from: ['sent_restitution'], to: 'archived' },
    pv_cloture: { from: ['partially_returned'], to: 'archived' },
  };

  const transition = validTransitions[signatureType];
  if (transition && transition.from.includes(currentStatus)) {
    // Un équipement déjà déclaré non rendu doit donner lieu à un PV avant
    // l'archivage : c'est le document qui acte la perte. Sans ce garde-fou,
    // l'ordre « je déclare la perte, PUIS je fais signer le reste » archivait
    // le bon directement (le PV n'est déclenché qu'en partially_returned,
    // cf. hook dans signing.ts), et la signature IT enregistrée pour ce PV
    // restait orpheline. Trouvé par les tests de bout en bout.
    if (signatureType === 'restitution' && transition.to === 'archived' && hasNotReturnedEquipment) {
      return 'partially_returned';
    }
    return transition.to;
  }

  // Restitution partielle : le collaborateur signe mais des équipements restent en attente
  // → on reste en partially_returned pour permettre de traiter le reste
  if (signatureType === 'restitution' && currentStatus === 'partially_returned') {
    return 'partially_returned';
  }

  if (transition && !transition.from.includes(currentStatus)) {
    logger?.warn(
      `Invalid status transition: ${currentStatus} → ${transition.to} via ${signatureType}. Keeping current status.`,
    );
  }

  return currentStatus;
}
