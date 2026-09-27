/**
 * Données attendues par la génération des PDF. Réexportées par pdf.service.ts
 * pour les appelants existants.
 */

/** Images de signature déjà déchiffrées (URL `data:image/png;base64,…`).
 *  N'est plus lue par le rendu, qui charge lui-même les images des signatures
 *  du document (voir document-signatures.ts). Gardée pour les appelants. */
export interface SigImages {
  it: string | null;
  collab: string | null;
}

/** Une signature du bon, telle que lue en base (enregistrement complet). */
export interface PdfSignature {
  type: string;
  signed: boolean;
  signedAt?: Date | string | null;
  signatureImagePath?: string | null;
  /** Document auquel se rapporte une signature IT : `mise_disposition`,
   *  `restitution`, `pv_cloture` ou `avenant`. */
  pdfType?: string | null;
  createdAt?: Date | string | null;
  tokenExpiresAt?: Date | string | null;
  invalidatedAt?: Date | string | null;
  // Métadonnées de preuve (certificat de signature électronique)
  signerEmail?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  mentionLuApprouve?: boolean;
  isInPerson?: boolean;
  signedByProxy?: boolean;
}

/** Geste « sans signature » constaté par l'IT, imprimé à la place de la
 *  signature du collaborateur. */
export interface WithoutSignatureNotice {
  /** `handover` : remise constatée sans signature ; `closure` : bon clôturé
   *  sans signature. */
  kind: 'handover' | 'closure';
  reason: string;
  /** Nom du technicien qui a constaté. */
  actorName: string;
  at: Date | string;
}

/** Shape of the bon object expected by PDF generation methods. */
export interface BonForPdf {
  id: string;
  reference: string;
  civilite: string;
  status: string;
  /** Le cachet de la filiale est lu en base à partir de cet identifiant, au
   *  moment du rendu : il ne transite jamais par l'objet du bon. */
  filialeId?: string;
  dateMiseDisposition: Date | string;
  dateRestitution?: Date | string | null;
  notes?: string | null;
  filiale: {
    displayName?: string;
    name?: string;
    logoPath?: string | null;
    address?: string | null;
    siret?: string | null;
  };
  collaborateur: {
    displayName?: string;
    department?: string | null;
  };
  collaborateurEmail?: string | null;
  createdBy?: {
    displayName?: string;
  };
  equipments: Array<{
    id: string;
    catalogItem?: { brand: string; model: string } | null;
    customLabel?: string | null;
    serialNumber?: string | null;
    inventoryNumber?: string | null;
    notes?: string | null;
    returnedAt?: Date | string | null;
    notReturned?: boolean;
    notReturnedReason?: string | null;
  }>;
  signatures?: PdfSignature[];
  /** Used by avenant generation to filter equipment */
  _avenantEquipmentIds?: string[];
  /** Document d'un geste sans signature (remise constatée, clôture). */
  _withoutSignature?: WithoutSignatureNotice;
  /** Ancienne forme du geste sans signature : texte libre. Le document est
   *  alors rangé sous le type « sans signature » correspondant. */
  _unilateralNote?: string;
}
