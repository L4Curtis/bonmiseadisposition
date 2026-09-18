import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { FILIALE_IMPORT_MAX_ROWS, parseFilialesCsv, readFileAsText } from './lib/csv';
import type { FilialeCsvRowError, ParsedFilialeRow } from './lib/csv';
import type { FilialeImportSummary } from './types';

interface UseFilialesImportResult {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  fileName: string | null;
  rows: ParsedFilialeRow[];
  invalidRows: FilialeCsvRowError[];
  handleFile: (file: File) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  result: FilialeImportSummary | null;
  runImport: () => Promise<void>;
  tooManyRows: boolean;
}

/** État et logique de l'import CSV des filiales : lecture et validation du
 *  fichier côté navigateur (aperçu du nombre de lignes valides/invalides),
 *  puis appel à POST /filiales/import. Les erreurs renvoyées par le serveur
 *  (index dans le tableau envoyé) sont ré-associées au numéro de ligne du
 *  fichier d'origine pour le compte rendu final. */
export function useFilialesImport(onImported: () => Promise<void>): UseFilialesImportResult {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedFilialeRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<FilialeCsvRowError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<FilialeImportSummary | null>(null);

  const resetState = (): void => {
    setFileName(null);
    setRows([]);
    setInvalidRows([]);
    setSubmitError(null);
    setResult(null);
  };

  const openDialog = (): void => { resetState(); setOpen(true); };
  const closeDialog = (): void => { setOpen(false); resetState(); };

  const handleFile = async (file: File): Promise<void> => {
    setSubmitError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const text = await readFileAsText(file);
      const parsed = parseFilialesCsv(text);
      setRows(parsed.rows);
      setInvalidRows(parsed.invalidRows);
    } catch (e: unknown) {
      setRows([]);
      setInvalidRows([{ line: 1, message: errorMessage(e, 'Impossible de lire le fichier') }]);
    }
  };

  const tooManyRows = rows.length > FILIALE_IMPORT_MAX_ROWS;

  const runImport = async (): Promise<void> => {
    if (rows.length === 0 || tooManyRows) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = rows.map((r) => r.item);
      const response = await api.post<FilialeImportSummary>('/filiales/import', { items: payload });
      const mappedErrors = response.errors.map((err) => ({
        index: err.index,
        message: rows[err.index] ? `Ligne ${rows[err.index].line} : ${err.message}` : err.message,
      }));
      setResult({ ...response, errors: mappedErrors });
      toast({ title: 'Import des filiales terminé', variant: 'success' });
      if (response.created > 0 || response.updated > 0) {
        await onImported();
      }
    } catch (e: unknown) {
      setSubmitError(errorMessage(e, "Erreur lors de l'import des filiales"));
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
    result,
    runImport,
    tooManyRows,
  };
}
