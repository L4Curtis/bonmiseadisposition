import { BON_SELECT_SHAPE } from '../common/types';

/**
 * Internal query shape: no legacy Bytes columns (they used to be serialized
 * into signature endpoint responses), but FULL signature records because PDF
 * snapshot generation needs signatureImagePath. Responses must be passed
 * through sanitizeBonForResponse() before leaving the service.
 *
 * Partagée par bon-info.ts, preview-pdf.ts, signing.ts et it-cachet.ts.
 */
export const BON_FOR_SIGNATURE_SELECT = {
  ...BON_SELECT_SHAPE.select,
  equipments: { orderBy: { order: 'asc' as const }, include: { catalogItem: true } },
  signatures: true,
} as const;
