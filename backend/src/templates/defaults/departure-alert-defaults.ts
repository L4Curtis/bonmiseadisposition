import {
  emailWrapper,
  card,
  brandHeader,
  metaStrip,
  body,
  footer,
  ctaButton,
  equipList,
  sectionLabel,
} from '../email-layout';
import { CHIP_WARNING } from './chips';

// ─── 12. Alerte départ avec matériel (lot D1) ───────────────────────────────
// Envoyé au staff IT en fin de synchronisation LDAP : alerte seule, aucune
// action automatique sur les bons (décision produit) — le texte le rappelle
// explicitement pour éviter tout réflexe de restitution automatique.

export function defaultDepartureAlert(): string {
  return emailWrapper(card(
    brandHeader('Départs avec matériel non restitué', 'Synchronisation annuaire', CHIP_WARNING('Alerte')),
    metaStrip(['<strong style="color:#1B1A18">{{COUNT}}</strong> collaborateur(s) concerné(s)']),
    body(`
      <p style="margin:0 0 20px;font-size:15px;color:#4A463F;line-height:1.75">
        La synchronisation avec l'annuaire vient de désactiver un ou plusieurs comptes qui détiennent encore du matériel non restitué. Cette alerte ne déclenche <strong style="color:#1B1A18">aucune action automatique</strong> : un compte peut être désactivé pour un congé long, une erreur de synchronisation ou un changement de structure. Vérifiez chaque situation avant toute restitution.
      </p>
      ${sectionLabel('Collaborateurs concernés')}
      ${equipList('{{DEPART_LIST}}')}
      ${ctaButton('{{INVENTORY_URL}}', "Voir l'inventaire filtré")}
      `),
    footer(),
  ));
}
