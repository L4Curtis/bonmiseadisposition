/** Réponse de POST /filiales/import. */
export interface FilialeImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: { index: number; message: string }[];
}
