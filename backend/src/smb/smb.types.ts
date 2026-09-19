export interface SmbExportResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
}

export interface SmbStatus {
  enabled: boolean;
  total?: number;
  success?: number;
  failed?: number;
  pending?: number;
  lastSuccessAt?: Date | null;
}
