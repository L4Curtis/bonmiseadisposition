import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { MANUAL_USERS_EXPECTED_HEADER, MANUAL_USERS_IMPORT_MAX_ROWS } from './lib/csv';
import type { ParsedManualUserRow } from './lib/csv';
import type { ManualUserImportLineStatus } from './types';
import type { ManualUsersImportReport, UseManualUsersImportResult } from './useManualUsersImport';

/** Nombre de lignes montrées dans l'aperçu (le total reste affiché). */
const PREVIEW_ROWS = 8;

const STATUS_LABELS: Record<ManualUserImportLineStatus, { label: string; className: string }> = {
  created: { label: 'Créé', className: 'text-success' },
  updated: { label: 'Mis à jour', className: 'text-primary' },
  skipped: { label: 'Ignoré', className: 'text-muted-foreground' },
  error: { label: 'Erreur', className: 'text-destructive' },
};

function PreviewTable({ rows }: { rows: ParsedManualUserRow[] }) {
  const shown = rows.slice(0, PREVIEW_ROWS);
  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <table className="w-full text-xs">
        <caption className="sr-only">Aperçu des lignes à importer</caption>
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">Ligne</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">Opération</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">Nom</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">Email</th>
            <th scope="col" className="px-2 py-1 text-left font-medium">Filiale</th>
          </tr>
        </thead>
        <tbody>
          {shown.map(({ line, item }) => (
            <tr key={line} className="border-t border-border">
              <td className="px-2 py-1 tabular-nums">{line}</td>
              <td className="px-2 py-1">{item.samAccountName ? `Mise à jour (${item.samAccountName})` : 'Création'}</td>
              <td className="px-2 py-1">{item.firstName} {item.lastName.toUpperCase()}</td>
              <td className="px-2 py-1">{item.email ?? '—'}</td>
              <td className="px-2 py-1">{item.filiale ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && (
        <p className="px-2 py-1 text-xs text-muted-foreground border-t border-border">
          … et {rows.length - shown.length} autre(s) ligne(s).
        </p>
      )}
    </div>
  );
}

function ImportReport({ report }: { report: ManualUsersImportReport }) {
  const detailed = report.lines.filter((l) => l.status !== 'skipped' || l.message !== 'Ligne de commentaire.');
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 space-y-2">
      <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
        <CheckCircle2 className="h-4 w-4 text-success" />
        Import terminé
      </p>
      <p className="text-sm text-foreground/80">
        Créés : {report.created} · Mis à jour : {report.updated} · Ignorés : {report.skipped} · Erreurs : {report.errorCount}
      </p>
      {detailed.length > 0 && (
        <ul className="text-xs space-y-0.5 max-h-48 overflow-auto" aria-label="Compte rendu ligne par ligne">
          {detailed.map((l) => {
            const meta = STATUS_LABELS[l.status];
            return (
              <li key={l.index}>
                <span className="tabular-nums">Ligne {l.fileLine ?? '?'}</span>
                {' — '}
                <span className={`font-medium ${meta.className}`}>{meta.label}</span>
                {l.displayName && <> · {l.displayName}</>}
                {l.samAccountName && <> ({l.samAccountName})</>}
                {l.message && <> : {l.message}</>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Boîte d'import CSV des collaborateurs créés à la main : sélection du
 *  fichier, aperçu des lignes (création ou mise à jour) et des lignes
 *  rejetées avant tout envoi, puis compte rendu ligne par ligne. */
export function ManualUsersImportDialog({ state }: { state: UseManualUsersImportResult }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    open, closeDialog, fileName, rows, invalidRows,
    handleFile, submitting, submitError, report, runImport, tooManyRows,
  } = state;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des collaborateurs</DialogTitle>
          <DialogDescription>
            Collaborateurs sans compte Active Directory uniquement. Colonnes attendues :
            {' '}{MANUAL_USERS_EXPECTED_HEADER} (séparateur point-virgule ou virgule,
            {' '}{MANUAL_USERS_IMPORT_MAX_ROWS} lignes maximum). Identifiant vide : création ;
            identifiant renseigné : mise à jour. Une cellule vide ne modifie pas le champ.
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
                {rows.length} lignes valides détectées, la limite est de {MANUAL_USERS_IMPORT_MAX_ROWS} lignes par import.
              </p>
            </div>
          )}

          {!tooManyRows && rows.length > 0 && !report && (
            <>
              <p className="text-sm text-foreground/80">
                {rows.length} ligne(s) valide(s) prête(s) à importer.
              </p>
              <PreviewTable rows={rows} />
            </>
          )}

          {invalidRows.length > 0 && !report && (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 max-h-40 overflow-auto">
              <p className="text-xs font-medium text-destructive mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                {invalidRows.length} ligne(s) écartée(s)
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

          {report && <ImportReport report={report} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Fermer
          </Button>
          {!report && (
            <Button onClick={() => void runImport()} disabled={submitting || rows.length === 0 || tooManyRows}>
              {submitting ? 'Import en cours...' : `Importer (${rows.length})`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
