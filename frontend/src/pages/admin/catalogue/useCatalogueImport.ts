import { useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { toast } from '@/hooks/use-toast';
import { CSV_IMPORT_MAX_ROWS, parseCatalogCsv, readFileAsText } from './lib/csv';
import type { CsvRowError, ParsedCsvRow } from './lib/csv';
import type { CatalogImportSummary } from './types';

interface UseCatalogueImportResult {
  open: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  fileName: string | null;
  rows: ParsedCsvRow[];
  invalidRows: CsvRowError[];
  handleFile: (file: File) => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  result: CatalogImportSummary | null;
  runImport: () => Promise<void>;
  tooManyRows: boolean;
}

/** État et logique de l'import CSV du catalogue : lecture et validation du
 *  fichier côté navigateur, aperçu du nombre de lignes valides, puis appel à
 *  POST /equipment/catalog/import. Ne recharge que le catalogue après un
 *  import réussi (jamais les packs) — cohérent avec {@link useCatalogue}, qui
 *  ne recharge plus jamais les deux ressources pour une seule mutation. */
export function useCatalogueImport(onImported: () => Promise<void>): UseCatalogueImportResult {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ParsedCsvRow[]>([]);
  const [invalidRows, setInvalidRows] = useState<CsvRowError[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<CatalogImportSummary | null>(null);

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
      const parsed = parseCatalogCsv(text);
      setRows(parsed.rows);
      setInvalidRows(parsed.invalidRows);
    } catch (e: unknown) {
      setRows([]);
      setInvalidRows([{ line: 1, message: errorMessage(e, 'Impossible de lire le fichier') }]);
    }
  };

  const tooManyRows = rows.length > CSV_IMPORT_MAX_ROWS;

  const runImport = async (): Promise<void> => {
    if (rows.length === 0 || tooManyRows) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = rows.map((r) => r.item);
      const response = await api.post<CatalogImportSummary>('/equipment/catalog/import', { items: payload });
      const mappedErrors = response.errors.map((err) => ({
        index: err.index,
        message: rows[err.index] ? `Ligne ${rows[err.index].line} : ${err.message}` : err.message,
      }));
      setResult({ ...response, errors: mappedErrors });
      toast({ title: 'Import du catalogue terminé', variant: 'success' });
      if (response.created > 0 || response.updated > 0) {
        await onImported();
      }
    } catch (e: unknown) {
      setSubmitError(errorMessage(e, "Erreur lors de l'import du catalogue"));
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
