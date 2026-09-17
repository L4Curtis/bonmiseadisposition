// ─── Signature page types ───────────────────────────────────────────────────

export interface BonInfo {
  id: string;
  reference: string;
  civilite: string;
  dateMiseDisposition: string;
  dateRestitution?: string;
  notes?: string;
  collaborateur: { displayName: string; email: string; department?: string };
  collaborateurEmail: string;
  filiale: { name: string; displayName: string; address?: string };
  equipments: {
    id: string;
    order: number;
    catalogItem?: { brand: string; model: string; category: string };
    customLabel?: string;
    serialNumber?: string;
    inventoryNumber?: string;
    notes?: string;
    notReturned?: boolean;
    notReturnedReason?: string;
    returnedAt?: string;
  }[];
}

export interface SignatureResponse {
  status: 'pending' | 'already_signed' | 'expired' | 'replaced' | 'unauthorized' | 'cancelled' | 'contested';
  /** Référence seule pour les statuts non-pending (payload minimal côté backend) */
  reference?: string;
  /** Ajouté par le lot backend (lot B) au payload minimal 'already_signed'
   *  pour permettre un vrai téléchargement — absent aujourd'hui, lu
   *  défensivement (fallback : lien vers /mes-bons). */
  bonId?: string;
  bon?: BonInfo;
  signature?: {
    id: string;
    type: string;
    signed: boolean;
    signedAt?: string;
    signerEmail?: string;
    isInPerson: boolean | null;
    tokenExpiresAt: string;
    /** Champ backend potentiellement ajouté plus tard — absent de la réponse
     *  actuelle : on le lit défensivement pour distinguer une signature
     *  recueillie par un mandataire IT (le compte connecté fait foi en attendant). */
    signedByProxy?: boolean;
  };
}
