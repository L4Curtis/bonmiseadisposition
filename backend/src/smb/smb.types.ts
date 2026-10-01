export interface SmbExportResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

/** État de la copie réseau : aucun compteur quand elle est désactivée. */
export type SmbStatus =
  | { enabled: false }
  | { enabled: true; total: number; success: number; failed: number; pending: number; lastSuccessAt: Date | null };
