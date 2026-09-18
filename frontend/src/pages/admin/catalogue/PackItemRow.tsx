import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { CATEGORIES } from './types';
import type { Pack, RemovePackItemTarget } from './types';

const MIN_QTY = 1;
const MAX_QTY = 20;

function clampQty(value: number): number {
  if (!Number.isFinite(value)) return MIN_QTY;
  return Math.min(MAX_QTY, Math.max(MIN_QTY, Math.round(value)));
}

interface PackItemRowProps {
  pack: Pack;
  item: Pack['items'][number];
  pending: boolean;
  onUpdateQty: (catalogItemId: string, quantity: number) => void;
  onRemoveRequest: (target: RemovePackItemTarget) => void;
}

/** Une ligne d'équipement dans un pack : quantité réglable par les boutons
 *  +/- ou par saisie directe (bornée entre {@link MIN_QTY} et {@link MAX_QTY},
 *  la même limite que le backend), et retrait du pack. */
export function PackItemRow({ pack, item, pending, onUpdateQty, onRemoveRequest }: PackItemRowProps) {
  const [draft, setDraft] = useState(String(item.quantity));

  useEffect(() => { setDraft(String(item.quantity)); }, [item.quantity]);

  const commit = (): void => {
    const parsed = clampQty(Number(draft));
    setDraft(String(parsed));
    if (parsed !== item.quantity) onUpdateQty(item.catalogItem.id, parsed);
  };

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-sm">
      <span className="flex-1 text-foreground/80">
        <span className="font-medium">{item.catalogItem.brand} {item.catalogItem.model}</span>
        <span className="ml-2 text-muted-foreground/70">{CATEGORIES[item.catalogItem.category]}</span>
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="w-6 h-6 text-xs"
          disabled={pending || item.quantity <= MIN_QTY}
          onClick={() => onUpdateQty(item.catalogItem.id, item.quantity - 1)}
          aria-label="Diminuer la quantité"
        >-</Button>
        <input
          type="number"
          inputMode="numeric"
          min={MIN_QTY}
          max={MAX_QTY}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
              (e.target as HTMLInputElement).blur();
            }
          }}
          aria-label={`Quantité de ${item.catalogItem.brand} ${item.catalogItem.model}`}
          className="w-12 h-6 rounded border border-input bg-card text-center text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50"
        />
        <Button
          variant="outline"
          size="icon"
          className="w-6 h-6 text-xs"
          disabled={pending || item.quantity >= MAX_QTY}
          onClick={() => onUpdateQty(item.catalogItem.id, item.quantity + 1)}
          aria-label="Augmenter la quantité"
        >+</Button>
      </div>
      <button
        className="ml-1 text-muted-foreground/70 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded"
        disabled={pending}
        onClick={() => onRemoveRequest({
          pack,
          catalogItemId: item.catalogItem.id,
          label: `${item.catalogItem.brand} ${item.catalogItem.model}`,
        })}
        aria-label={`Retirer ${item.catalogItem.brand} ${item.catalogItem.model} du pack`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
