import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { mapDuplicableEquipments } from './lib/duplicateBon';
import type { DuplicableBon } from './lib/duplicateBon';
import type { EquipmentLine } from './types';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

export interface DuplicateBonButtonProps {
  /** Reçoit les lignes d'équipement déjà construites (article uniquement —
   *  ni numéro de série, ni numéro d'inventaire, voir lib/duplicateBon). */
  readonly onImport: (lines: EquipmentLine[]) => void;
}

/** Bouton + boîte de dialogue « Repartir d'un bon existant » : recherche un
 *  bon déjà saisi (référence ou collaborateur) et n'en reprend que les
 *  équipements — le cas courant du kit standard remis à chaque arrivée. Le
 *  collaborateur, les dates et les numéros de série/inventaire ne sont
 *  jamais repris (voir CHANGELOG). */
export function DuplicateBonButton({ onImport }: DuplicateBonButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DuplicableBon[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
    setError('');
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    let ignore = false;
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ search: query.trim(), limit: '10' });
      api.get<{ bons: DuplicableBon[] }>(`/bons?${params}`)
        .then((res) => { if (!ignore) setResults(res.bons); })
        .catch(() => { if (!ignore) setError('Recherche indisponible pour le moment.'); })
        .finally(() => { if (!ignore) setLoading(false); });
    }, SEARCH_DEBOUNCE_MS);
    return () => { ignore = true; clearTimeout(t); };
  }, [query, open]);

  const handlePick = (bon: DuplicableBon) => {
    onImport(mapDuplicableEquipments(bon.equipments));
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Copy className="h-3.5 w-3.5" /> Repartir d'un bon existant
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repartir d'un bon existant</DialogTitle>
            <DialogDescription>
              Reprend uniquement les équipements (article ou libellé) — ni le collaborateur, ni les dates, ni les
              numéros de série ou d'inventaire, propres à chaque exemplaire.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Référence, collaborateur..."
            aria-label="Rechercher un bon à dupliquer"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="max-h-64 divide-y overflow-auto rounded-md border">
            {results.map((bon) => (
              <button
                key={bon.id}
                type="button"
                onClick={() => handlePick(bon)}
                className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span className="font-medium">{bon.reference} — {bon.collaborateur.displayName}</span>
                <span className="text-xs text-muted-foreground/70">
                  {bon.equipments.length} équipement{bon.equipments.length > 1 ? 's' : ''} — {formatDate(bon.dateMiseDisposition)}
                </span>
              </button>
            ))}
            {!loading && query.trim().length >= MIN_QUERY_LENGTH && results.length === 0 && !error && (
              <p className="px-3 py-2 text-sm text-muted-foreground/70">Aucun bon trouvé</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
