import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SmbFailedExport } from '@/contracts/admin';

/** Nombre d'exports en échec affichés ; le reste est annoncé. */
export const SMB_FAILED_SHOWN = 20;

interface SmbFailedExportsProps {
  exports: SmbFailedExport[];
  retrying: string | null;
  retryingAll: boolean;
  onRetry: (exp: SmbFailedExport) => void;
  onRetryAll: () => void;
}

function RetryButton({ exp, retrying, onRetry }: { exp: SmbFailedExport; retrying: boolean; onRetry: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={retrying}
      className="min-h-11 gap-1 sm:min-h-8"
      aria-label={`Relancer la copie de ${exp.filename}`}
    >
      {retrying ? <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="h-3 w-3" />}
      Relancer
    </Button>
  );
}

/** Exports en échec : tableau sur grand écran, une carte par export sur téléphone. */
export function SmbFailedExports({ exports, retrying, retryingAll, onRetry, onRetryAll }: SmbFailedExportsProps) {
  const shown = exports.slice(0, SMB_FAILED_SHOWN);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Copies en échec</p>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-8" onClick={onRetryAll} disabled={retryingAll}>
          {retryingAll ? <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          Tout relancer
        </Button>
      </div>

      <ul className="space-y-2 md:hidden" aria-label="Copies en échec">
        {shown.map((exp) => (
          <li key={exp.id} className="space-y-1 rounded-lg border p-3 text-sm">
            <p className="font-mono text-xs">{exp.bonReference}</p>
            <p className="break-all text-xs">{exp.filename}</p>
            <p className="break-words text-xs text-destructive">{exp.errorMessage ?? 'Erreur inconnue'}</p>
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Tentatives : {exp.retryCount}/3</span>
              <RetryButton exp={exp} retrying={retrying === exp.id} onRetry={() => onRetry(exp)} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-lg border md:block">
        <table className="w-full text-sm" aria-label="Copies en échec">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Bon</th>
              <th className="px-3 py-2 text-left font-medium">Fichier</th>
              <th className="px-3 py-2 text-left font-medium">Erreur</th>
              <th className="px-3 py-2 text-center font-medium">Tentatives</th>
              <th className="px-3 py-2 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {shown.map((exp) => (
              <tr key={exp.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-mono text-xs">{exp.bonReference}</td>
                <td className="max-w-[200px] truncate px-3 py-2 text-xs" title={exp.filename}>{exp.filename}</td>
                <td className="max-w-[250px] truncate px-3 py-2 text-xs text-destructive" title={exp.errorMessage ?? ''}>
                  {exp.errorMessage ?? 'Erreur inconnue'}
                </td>
                <td className="px-3 py-2 text-center text-xs">{exp.retryCount}/3</td>
                <td className="px-3 py-2 text-right">
                  <RetryButton exp={exp} retrying={retrying === exp.id} onRetry={() => onRetry(exp)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {exports.length > SMB_FAILED_SHOWN && (
        <p className="text-xs text-muted-foreground">
          {exports.length - SMB_FAILED_SHOWN} autre(s) copie(s) en échec non affichée(s).
        </p>
      )}
    </div>
  );
}
