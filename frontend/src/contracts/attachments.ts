// ─────────────────────────────────────────────────────────────────────────────
// FICHIER GÉNÉRÉ — NE PAS MODIFIER.
// Source : backend/src/contracts/attachments.ts
// Pour changer ce contrat : modifier la source, puis lancer
// `npm run sync-contracts` dans backend/ et versionner les deux fichiers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Contrats de l'API — pièces jointes d'un bon
 * (`backend/src/attachments/attachments.controller.ts`).
 *
 * Seules les métadonnées sont renvoyées (`AttachmentsService.toSafe`) : jamais
 * le chemin de stockage interne ni l'auteur par identifiant. Le contenu se
 * télécharge par GET /api/bons/:bonId/attachments/:id (réponse binaire).
 */
import type { IsoDateTime, OkResponse } from './common';

/** Étape du bon à laquelle la pièce jointe se rattache ; toute valeur
 *  inconnue envoyée à l'ajout est enregistrée comme `general`. */
export type AttachmentStage = 'mise_disposition' | 'restitution' | 'pv_cloture' | 'general';

/** Type réel du fichier, détecté par ses premiers octets (pas celui annoncé
 *  par le navigateur). */
export type AttachmentMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';

/** Métadonnées d'une pièce jointe. */
export interface BonAttachment {
  id: string;
  bonId: string;
  stage: AttachmentStage;
  /** Nom d'origine assaini (affichage uniquement). */
  filename: string;
  mimeType: AttachmentMimeType;
  /** Taille en octets. */
  size: number;
  /** Empreinte SHA-256 (hexadécimal) du contenu en clair. */
  sha256: string;
  label: string | null;
  uploadedByEmail: string | null;
  createdAt: IsoDateTime;
}

/** GET /api/bons/:bonId/attachments — pièces jointes du bon, de la plus
 *  ancienne à la plus récente (tableau vide pour un bon inconnu). */
export type AttachmentListResponse = BonAttachment[];

/** POST /api/bons/:bonId/attachments — ajout (multipart, champ `file`) (201). */
export type UploadAttachmentResponse = BonAttachment;

/** DELETE /api/bons/:bonId/attachments/:id — suppression. */
export type DeleteAttachmentResponse = OkResponse;
