/**
 * Scellement HMAC des enregistrements de signature (intégrité en base) et
 * vérification agrégée pour un bon. Fonctions pures extraites de
 * SignatureService : `verifySeal` est injecté explicitement (EncryptionService
 * reste un provider Nest, mais son appel est un simple callback ici) plutôt
 * que de faire de ce module un service injectable.
 */

export interface SealFields {
  bonId: string;
  signatureId: string;
  type: string;
  signerEmail: string | null;
  signedAt: Date;
  mentionLuApprouve: boolean;
  isInPerson: boolean;
  signedByProxy: boolean;
}

/**
 * Charge canonique scellée par HMAC : version + identité + champs probants.
 * Stable et ordonnée (toute modif d'un champ casse le sceau). Le scellement
 * du PDF lui-même est couvert ailleurs (SHA-256 du snapshot + ProofArchive) ;
 * ce sceau-ci protège l'intégrité de l'ENREGISTREMENT de signature en base.
 */
export function buildSealPayload(f: SealFields): string {
  return [
    'seal-v1',
    f.bonId,
    f.signatureId,
    f.type,
    (f.signerEmail ?? '').toLowerCase().trim(),
    f.signedAt.toISOString(),
    f.mentionLuApprouve ? '1' : '0',
    f.isInPerson ? '1' : '0',
    f.signedByProxy ? '1' : '0',
  ].join('|');
}

export interface StoredSignatureForIntegrity {
  id: string;
  bonId: string;
  type: string;
  signed: boolean;
  signerEmail: string | null;
  mentionLuApprouve: boolean;
  isInPerson: boolean;
  signedByProxy: boolean;
  seal: string | null;
  signedAt: Date | null;
  tsToken: string | null;
  tsAuthority: string | null;
}

export interface SignatureIntegrityEntry {
  id: string;
  type: string;
  signed: boolean;
  sealed: boolean;
  sealValid: boolean | null;
  timestamped: boolean;
  timestampAuthority: string | null;
  signedAt: Date | null;
}

/**
 * Recalcule le sceau de chaque signature et le compare à celui stocké.
 * Un bon anonymisé (RGPD) a perdu les champs PII qui entrent dans le sceau :
 * celui-ci n'est alors plus recalculable — ce n'est pas une altération, juste
 * un état non vérifiable (sealValid: null, n'invalide jamais allValid).
 */
export function computeSignatureIntegrity(
  signatures: StoredSignatureForIntegrity[],
  anonymized: boolean,
  verifySeal: (expected: string, seal: string) => boolean,
): { allValid: boolean; signatures: SignatureIntegrityEntry[] } {
  const entries = signatures.map((s) => {
    const sealed = !!s.seal;
    let sealValid: boolean | null = null;
    if (anonymized) {
      sealValid = null;
    } else if (sealed && s.signedAt) {
      const expected = buildSealPayload({
        bonId: s.bonId,
        signatureId: s.id,
        type: s.type,
        signerEmail: s.signerEmail,
        signedAt: s.signedAt,
        mentionLuApprouve: s.mentionLuApprouve,
        isInPerson: s.isInPerson,
        signedByProxy: s.signedByProxy,
      });
      sealValid = verifySeal(expected, s.seal as string);
    }
    return {
      id: s.id,
      type: s.type,
      signed: s.signed,
      sealed,
      sealValid,
      timestamped: !!s.tsToken,
      timestampAuthority: s.tsAuthority ?? null,
      signedAt: s.signedAt,
    };
  });

  // Valide si tout enregistrement scellé l'est correctement (les non scellés —
  // ex. signatures antérieures à cette version — ne rendent pas le bon invalide).
  // Un bon anonymisé n'est jamais marqué invalide : sealValid:null est "non
  // vérifiable", pas "faux".
  const allValid = anonymized || entries.every((s) => s.sealValid !== false);
  return { allValid, signatures: entries };
}
