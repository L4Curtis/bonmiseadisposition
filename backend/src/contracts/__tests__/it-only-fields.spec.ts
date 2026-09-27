import type { BonDetail, BonForSignature, BonItOnlyField, PortalBon } from '../bons';

/**
 * Champs réservés à l'équipe informatique (« Note interne IT », refus d'envoi
 * d'un lien) : les réponses destinées au collaborateur ne peuvent pas les
 * porter. Vérifié À LA COMPILATION (`tsc --noEmit`, étape « Type-check
 * backend » de la CI) : si l'un de ces types regagne un de ces champs, le
 * fichier ne compile plus. Les formes des tests de contrat (`object<T>`, qui
 * refuse toute clé inconnue) font le même contrôle sur les réponses réelles.
 */
type HasNoItOnlyField<T> = Extract<keyof T, BonItOnlyField> extends never ? true : false;
type IsItOnlyInDetail = BonItOnlyField extends keyof BonDetail ? true : false;

const PORTAL_IS_CLEAN: HasNoItOnlyField<PortalBon> = true;
const SIGNATURE_PAGE_IS_CLEAN: HasNoItOnlyField<BonForSignature> = true;
const DETAIL_CARRIES_THEM: IsItOnlyInDetail = true;

describe('contrats — champs réservés à l’IT', () => {
  it('absents du bon du portail et du bon de la page de signature, présents sur la fiche IT', () => {
    expect([PORTAL_IS_CLEAN, SIGNATURE_PAGE_IS_CLEAN, DETAIL_CARRIES_THEM]).toEqual([true, true, true]);
  });
});
