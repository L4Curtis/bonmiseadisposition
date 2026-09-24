import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BON_STATUS_LABELS, type BonStatus } from '@/types';
import { Loader2, X } from 'lucide-react';
import type { PreviewBonOption } from './types';

/** Délai avant de lancer la recherche pendant la frappe. */
const SEARCH_DEBOUNCE_MS = 250;

interface BonPickerProps {
  /** Préfixe des identifiants (deux sélecteurs peuvent coexister dans la page). */
  idPrefix: string;
  selected: PreviewBonOption | null;
  onSelect: (bon: PreviewBonOption | null) => void;
}

function statusLabel(status: string): string {
  return BON_STATUS_LABELS[status as BonStatus] ?? status;
}

/** Recherche d'un bon par référence (lot H3) : sans saisie, les bons les plus
 *  récents sont proposés. Les bons anonymisés ne sont jamais proposés. */
export function BonPicker({ idPrefix, selected, onSelect }: BonPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PreviewBonOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selected) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      api.get<PreviewBonOption[]>(`/admin/email-templates/preview-bons?q=${encodeURIComponent(query.trim())}`)
        .then((r) => { if (!cancelled) setResults(r); })
        .catch((e: unknown) => { if (!cancelled) setError(errorMessage(e, 'Recherche impossible.')); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, selected]);

  if (selected) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
        <span className="font-mono font-semibold">{selected.reference}</span>
        <span className="text-muted-foreground">
          {selected.collaborateurName ?? 'Collaborateur inconnu'}
          {selected.filialeName ? ` · ${selected.filialeName}` : ''}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={() => onSelect(null)}>
          <X className="h-3.5 w-3.5" /> Changer de bon
        </Button>
      </div>
    );
  }

  const inputId = `${idPrefix}-bon-search`;
  const listId = `${idPrefix}-bon-results`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>Bon à utiliser (recherche par référence)</Label>
      <div className="relative">
        <Input
          id={inputId}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ex. BON-2026-0042"
          aria-controls={listId}
          autoComplete="off"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground motion-reduce:animate-none" aria-hidden="true" />
        )}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      ) : (
        <ul id={listId} aria-label="Bons trouvés" className="max-h-44 overflow-auto rounded-md border divide-y">
          {results.length === 0 && !loading ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">Aucun bon ne correspond à cette référence.</li>
          ) : results.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => onSelect(b)}
                className="flex w-full flex-wrap items-baseline gap-x-2 px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              >
                <span className="font-mono font-semibold">{b.reference}</span>
                <span className="text-muted-foreground">{b.collaborateurName ?? 'Collaborateur inconnu'}</span>
                <span className="ml-auto text-xs text-muted-foreground">{statusLabel(b.status)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
