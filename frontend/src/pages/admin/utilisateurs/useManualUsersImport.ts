import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { readFileAsText } from '../filiales/lib/csv';
import { MANUAL_USERS_IMPORT_MAX_ROWS, parseManualUsersCsv } from './lib/csv';
import type { ManualUserCsvRowError, ParsedManualUserRow } from './lib/csv';
import type { ManualUserImportReportLine, ManualUsersImportSummary } from './types';

export interface ManualUsersImportReport {
  created: number;
  updated: number;
  skipped: number;
  errorCount: number;
  lines: ManualUserImportReportLine[];
}

export interface UseManualUsersImportResult {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  fileName: string | null;
  rows: ParsedManualUserRow[];
  invalidRows: ManualUserCsvRowError[];
  handleFile: (file: File) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  report: ManualUsersImportReport | null;
  runImport: () => Promise<void>;
  tooManyRows: boolean;
}

/** Rattache chaque ligne du compte rendu serveur (index dans le tableau
 *  envoyé) au numéro de ligne du fichier d'origine. */
function toReport(response: ManualUsersImportSummary, rows: ParsedManualUserRow[]): ManualUsersImportReport {
  return {
    created: response.created,
    updated: response.updated,
    skipped: response.skipped,
    errorCount: response.errors.length,
    lines: response.lines.map((line) => ({ ...line, fileLine: rows[line.index]?.line ?? null })),
  };
}

/** État et logique de l'import CSV des collaborateurs créés à la main :
 *  lecture et contrôle du fichier dans le navigateur (aperçu, doublons
 *  internes au fichier), puis POST /users/manual/import et compte rendu ligne
 *  par ligne — même déroulé que l'import des filiales. */
export function useManualUsersImport(onImported: () => void): UseManualUsersImportResult {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedManualUserRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<ManualUserCsvRowError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [report, setReport] = useState<ManualUsersImportReport | null>(null);

  const resetState = (): void => {
    setFileName(null);
    setRows([]);
    setInvalidRows([]);
    setSubmitError(null);
    setReport(null);
  };

  const openDialog = (): void => { resetState(); setOpen(true); };
  const closeDialog = (): void => { setOpen(false); resetState(); };

  const handleFile = async (file: File): Promise<void> => {
    setSubmitError(null);
    setReport(null);
    setFileName(file.name);
    try {
      const parsed = parseManualUsersCsv(await readFileAsText(file));
      setRows(parsed.rows);
      setInvalidRows(parsed.invalidRows);
    } catch (e: unknown) {
      setRows([]);
      setInvalidRows([{ line: 1, message: errorMessage(e, 'Impossible de lire le fichier') }]);
    }
  };

  const tooManyRows = rows.length > MANUAL_USERS_IMPORT_MAX_ROWS;

  const runImport = async (): Promise<void> => {
    if (rows.length === 0 || tooManyRows) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const response = await api.post<ManualUsersImportSummary>(
        '/users/manual/import',
        { items: rows.map((r) => r.item) },
      );
      setReport(toReport(response, rows));
      toast({ title: 'Import des collaborateurs terminé', variant: 'success' });
      if (response.created > 0 || response.updated > 0) onImported();
    } catch (e: unknown) {
      setSubmitError(errorMessage(e, "Erreur lors de l'import des collaborateurs"));
    } finally {
      setSubmitting(false);
    }
  };

  return {
    open,
    openDialog,
    closeDialog,
    fileName,
    rows,
    invalidRows,
    handleFile,
    submitting,
    submitError,
    report,
    runImport,
    tooManyRows,
  };
}
