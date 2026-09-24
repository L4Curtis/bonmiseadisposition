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
