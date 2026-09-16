import { BadRequestException } from '@nestjs/common';

/** Data URL prefix expected for an electronic-signature PNG payload. */
const PNG_DATA_URL_PREFIX = /^data:image\/png;base64,/;

/** PNG file signature (8 bytes) — RFC-defined magic bytes. */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Hard cap on the decoded signature image size (2 MB). */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

/**
 * Valide qu'une chaîne est bien une data URL PNG avant toute écriture en base
 * (signature IT d'un PV, cachet, etc.) : préfixe attendu, décodage base64,
 * magic bytes PNG et taille maximale. Lève une BadRequestException (jamais une
 * Error brute) pour rester cohérent avec les autres validations utilisateur —
 * appelée AVANT toute écriture pour éviter un état partiellement commité
 * (équipements marqués, transaction validée) suivi d'un échec de validation
 * tardif côté fichier.
 *
 * @returns le buffer décodé (PNG valide), pour réutilisation éventuelle par l'appelant.
 */
export function assertPngDataUrl(dataUrl: string): Buffer {
  if (typeof dataUrl !== 'string' || !PNG_DATA_URL_PREFIX.test(dataUrl)) {
    throw new BadRequestException('Format de signature invalide (PNG attendu)');
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  // Buffer.from(..., 'base64') ne lève jamais (les caractères hors alphabet
  // base64 sont simplement ignorés) : un try/catch autour n'est jamais
  // atteint — c'est la vérification des magic bytes ci-dessous qui rejette
  // un contenu invalide.
  const decoded = Buffer.from(base64, 'base64');

  if (decoded.length === 0 || decoded.length > MAX_SIGNATURE_BYTES) {
    throw new BadRequestException('Format de signature invalide (PNG attendu)');
  }

  if (decoded.length < PNG_MAGIC.length || !decoded.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    throw new BadRequestException('Format de signature invalide (PNG attendu)');
  }

  return decoded;
}
