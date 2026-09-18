import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { CSV_IMPORT_MAX_ROWS } from './lib/csv';
import type { useCatalogueImport } from './useCatalogueImport';

interface CatalogueImportDialogProps {
  state: ReturnType<typeof useCatalogueImport>;
}

/** Boîte d'import CSV du catalogue : sélection du fichier, aperçu du nombre de
 *  lignes valides/invalides, puis compte rendu détaillé (créés, réactivés,
 *  ignorés, erreurs ligne par ligne) une fois l'appel API terminé. */
export function CatalogueImportDialog({ state }: CatalogueImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    open, closeDialog, fileName, rows, invalidRows,
    handleFile, submitting, submitError, result, runImport, tooManyRows,
  } = state;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Importer un CSV</DialogTitle>
          <DialogDescription>
            Colonnes attendues : categorie;marque;modele;description (séparateur point-virgule ou virgule,
            500 lignes maximum).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Fichier CSV à importer"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
            <Upload className="h-4 w-4" />
            Choisir un fichier
          </Button>
          {fileName && <p className="text-sm text-muted-foreground">Fichier sélectionné : {fileName}</p>}

          {tooManyRows && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-2">
              <p className="text-sm text-destructive">
                {rows.length} lignes valides détectées, la limite est de {CSV_IMPORT_MAX_ROWS} lignes par import.
              </p>
            </div>
          )}

          {!tooManyRows && rows.length > 0 && !result && (
            <p className="text-sm text-foreground/80">
              {rows.length} ligne(s) valide(s) prête(s) à importer.
            </p>
          )}

          {invalidRows.length > 0 && !result && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 max-h-40 overflow-auto">
              <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {invalidRows.length} ligne(s) ignorée(s)
              </p>
              <ul className="text-xs text-destructive/90 space-y-0.5">
                {invalidRows.map((err) => (
                  <li key={err.line}>Ligne {err.line} : {err.message}</li>
                ))}
              </ul>
            </div>
          )}

          {submitError && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/20 p-2">
              <p className="text-sm text-destructive">{submitError}</p>
            </div>
          )}

          {result && (
            <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                Import terminé
              </p>
              <p className="text-sm text-foreground/80">
                Créés : {result.created} · Réactivés : {result.updated} · Ignorés : {result.skipped}
              </p>
              {result.errors.length > 0 && (
                <ul className="text-xs text-destructive space-y-0.5 max-h-32 overflow-auto">
                  {result.errors.map((err) => <li key={err.index}>{err.message}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Fermer
          </Button>
          {!result && (
            <Button onClick={() => void runImport()} disabled={submitting || rows.length === 0 || tooManyRows}>
              {submitting ? 'Import en cours...' : `Importer (${rows.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
