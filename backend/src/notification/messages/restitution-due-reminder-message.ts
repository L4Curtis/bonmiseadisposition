import { NotificationBon } from '../../common/types';
import { escapeHtml } from './escape-html';
import { buildLoanedEquipList } from './equipment-lists';
import { EmailMessage } from './signature-request-messages';

/**
 * Variables + sujet du rappel de restitution prévue. Contrairement aux autres
 * rappels, ce message ne porte pas de lien de signature : il pointe vers le
 * portail collaborateur ({{PORTAIL_URL}} = appUrl + '/mes-bons').
 */
export function buildRestitutionDueReminderMessage(bon: NotificationBon, appUrl: string): EmailMessage {
  const filialeNom = bon.filiale?.displayName ?? bon.filiale?.name ?? '';
  const dateRestitution = bon.dateRestitution
    ? new Date(bon.dateRestitution).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Paris',
      })
    : '';

  return {
    vars: {
      COLLAB_CIVILITE: bon.civilite === 'mme' ? 'Madame' : 'Monsieur',
      COLLAB_NAME: escapeHtml(bon.collaborateur?.displayName ?? ''),
      FILIALE_NOM: escapeHtml(filialeNom),
      REFERENCE: escapeHtml(bon.reference),
      DATE_RESTITUTION: dateRestitution,
      EQUIP_LIST: buildLoanedEquipList(bon.equipments ?? []),
      PORTAIL_URL: `${appUrl}/mes-bons`,
    },
    subject: `Restitution prévue le ${dateRestitution} — bon ${bon.reference}`,
  };
}
