import type { User } from '@/types';

/** Compte d'une page de GET /users : `lockedUntil`, fin du verrou de sa
 *  connexion locale (`null` : pas verrouillé), calculée par le serveur comme
 *  à la connexion. */
export type UserRow = User & { readonly lockedUntil: string | null };

export type ManualUserImportLineStatus = 'created' | 'updated' | 'skipped' | 'error';

/** Compte rendu d'une ligne envoyée (index dans le tableau `items`). */
export interface ManualUserImportLine {
  index: number;
  status: ManualUserImportLineStatus;
  samAccountName?: string;
  displayName?: string;
  message?: string;
}

/** Réponse de POST /users/manual/import. */
export interface ManualUsersImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
  lines: ManualUserImportLine[];
}

/** Ligne du compte rendu affiché, rattachée au numéro de ligne du fichier. */
export interface ManualUserImportReportLine extends ManualUserImportLine {
  fileLine: number | null;
}
