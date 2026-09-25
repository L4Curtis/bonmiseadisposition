import { matchPath } from 'react-router';
import { SCREEN_LABELS } from '@/domain/labels';

type TitleOf = (params: Readonly<Record<string, string | undefined>>) => string;

/**
 * Titre d'onglet déduit de l'adresse. Premier motif qui correspond ; les noms
 * viennent du lexique. Table provisoire : elle rejoindra le registre unique des
 * écrans (menu, fil d'Ariane, titres) quand il existera.
 */
const ROUTE_TITLES: readonly (readonly [pattern: string, title: string | TitleOf])[] = [
  ['/dashboard', SCREEN_LABELS.dashboard],
  ['/mes-bons/*', SCREEN_LABELS.mesEquipements],
  ['/inventaire', SCREEN_LABELS.inventaire],
  ['/materiel/:reference', ({ reference }) => equipmentTitle(reference)],
  ['/bons', SCREEN_LABELS.bons],
  ['/bons/new', SCREEN_LABELS.newBon],
  ['/bons/:id/edit', SCREEN_LABELS.editBon],
  ['/bons/:id', SCREEN_LABELS.bon],
  ['/admin/contestations', SCREEN_LABELS.contestations],
  ['/admin/utilisateurs', SCREEN_LABELS.utilisateurs],
  ['/admin/filiales', SCREEN_LABELS.filiales],
  ['/admin/catalogue', SCREEN_LABELS.catalogue],
  ['/admin/configuration/*', SCREEN_LABELS.configuration],
  ['/admin/templates/email', SCREEN_LABELS.emailTemplates],
  ['/admin/templates/pdf', SCREEN_LABELS.pdfTemplates],
  ['/admin/templates/*', SCREEN_LABELS.modeles],
  ['/admin/ldap-sync', SCREEN_LABELS.annuaire],
  ['/admin/audit', SCREEN_LABELS.journal],
  ['/login', SCREEN_LABELS.connexion],
  ['/change-password', SCREEN_LABELS.motDePasse],
  ['/signer/:token', SCREEN_LABELS.signature],
  ['/unauthorized', SCREEN_LABELS.accesRefuse],
];

/** Titre de la page à cette adresse, ou `null` si l'adresse est inconnue. */
export function routeTitle(pathname: string): string | null {
  for (const [pattern, title] of ROUTE_TITLES) {
    const match = matchPath({ path: pattern, end: true }, pathname);
    if (match) return typeof title === 'function' ? title(match.params) : title;
  }
  return null;
}

/** « Équipement SN-123 » ; la référence arrive encodée dans l'adresse. */
function equipmentTitle(reference: string | undefined): string {
  if (!reference) return SCREEN_LABELS.equipment;
  try {
    return `${SCREEN_LABELS.equipment} ${decodeURIComponent(reference)}`;
  } catch {
    return SCREEN_LABELS.equipment;
  }
}
