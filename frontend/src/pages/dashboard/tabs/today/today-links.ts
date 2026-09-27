/**
 * Listes ouvertes par les chiffres de l'accueil. Chaque adresse applique au
 * serveur le même prédicat que le chiffre (backend/src/common/bon-predicates.ts),
 * pour que le nombre de lignes de la liste égale celui de la tuile.
 */
export const TODAY_LINKS = {
  openBons: '/bons?excludeStatus=cancelled,archived',
  activeBons: '/bons?status=active',
  restitutionInProgress: '/bons?status=partially_returned',
  drafts: '/bons?status=draft',
  /** Filtre `awaitingSignature` de la liste des bons (buildAwaitingSignatureWhere). */
  awaitingSignatures: '/bons?awaitingSignature=1',
  /** Filtre `overdue` de la liste des bons (buildOverdueSignatureWhere). */
  overdueSignatures: '/bons?overdue=1',
  /** Filtre `linkExpired` de la liste des bons (buildExpiredLinkWhere). */
  expiredLinks: '/bons?linkExpired=1',
  /** Inventaire filtré « Retour en retard » (buildReturnOverdueEquipmentWhere). */
  overdueReturns: '/inventaire?overdue=1',
  /** Page Contestations filtrée « à traiter » (buildContestationToProcessWhere). */
  contestations: '/admin/contestations?aTraiter=1',
  departures: '/inventaire?vue=collaborateurs&compte=inactif',
  /** Filtre de sous-état de la liste des bons (bons/queries/bon-substatus-filter.ts). */
  partialRestitutionsToSign: '/bons?subStatus=partial_restitution_to_sign',
} as const;

/** Bons ouverts d'une filiale : même compte que la ligne « Bons ouverts par filiale ». */
export function openBonsOfFiliale(filialeId: string): string {
  return `/bons?excludeStatus=cancelled,archived&filialeId=${encodeURIComponent(filialeId)}`;
}
