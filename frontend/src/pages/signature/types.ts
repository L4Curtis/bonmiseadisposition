// ─── Types de la page de signature : ceux du contrat de l'API ───────────────

import type { BonForSignature } from '@/contracts/bons';
import type { SignatureInfoResponse, SignaturePendingResponse } from '@/contracts/signature';

/** Bon tel que renvoyé au destinataire d'un lien en attente. */
export type BonInfo = BonForSignature;

/** GET /api/signature/:token — union discriminée par `status`. */
export type SignatureResponse = SignatureInfoResponse;

/** Lien en attente : le bon complet et la signature attendue. */
export type PendingSignatureData = SignaturePendingResponse;
