import { escapeHtml } from './escape-html';
import { EmailMessage } from './signature-request-messages';
import type { CollaborateurInventoryItem } from '../../reporting/inventory-collaborateur-aggregate';

/** Un <li> par collaborateur concerné : nom, filiale, nombre d'équipements et
 *  ancienneté du prêt le plus ancien — mêmes données que la ligne
 *  correspondante de GET /reporting/inventory/by-collaborateur?compte=inactif
 *  (aucun recalcul : ce sont les mêmes objets, cf. departure-notifications.ts). */
function buildDepartureList(candidates: readonly CollaborateurInventoryItem[]): string {
  return candidates
    .map((c) => {
      const name = escapeHtml(c.displayName);
      const filialeNom = c.filiale ? escapeHtml(c.filiale.displayName) : '—';
      const equipLabel = c.count > 1 ? 'équipements' : 'équipement';
      const ageLabel = c.oldestAgeDays > 1 ? 'jours' : 'jour';
      return `<li style="padding:10px 0;border-bottom:1px solid #E2DFD9;font-size:14px;color:#4A463F;line-height:1.6;list-style:none">
        <strong style="color:#1B1A18">${name}</strong> &middot; ${filialeNom}<br>
        <span style="color:#6B665E;font-size:13px">${c.count} ${equipLabel} &middot; prêt le plus ancien depuis ${c.oldestAgeDays} ${ageLabel}</span>
      </li>`;
    })
    .join('\n');
}

/** Variables + sujet de l'alerte « départs avec matériel » envoyée au staff IT
 *  en fin de synchronisation LDAP (cf. LdapService / departure-notifications.ts). */
export function buildDepartureAlertMessage(
  candidates: readonly CollaborateurInventoryItem[],
  inventoryUrl: string,
): EmailMessage {
  const count = candidates.length;
  return {
    vars: {
      COUNT: String(count),
      DEPART_LIST: buildDepartureList(candidates),
      INVENTORY_URL: inventoryUrl,
    },
    // Sujet en texte brut, pas d'échappement HTML (cf. autres messages système).
    subject: `[DÉPART] ${count} collaborateur${count > 1 ? 's' : ''} désactivé${count > 1 ? 's' : ''} détenant encore du matériel`,
  };
}
