import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/dates';
import { equipmentOverdueDays } from './dateMetrics';
import { filledSerial } from './serial';
import { InventoryRowActions } from './InventoryRowActions';
import { SituationCell } from './SituationCell';
import type { InventoryItem } from './types';

interface InventoryCardListProps {
  items: InventoryItem[];
  /** Direction : lecture seule, aucun lien vers les bons. */
  canLinkToBon: boolean;
}

function InventoryCard({ item, canLinkToBon }: { item: InventoryItem; canLinkToBon: boolean }) {
  const retardJours = equipmentOverdueDays(item);
  const serial = filledSerial(item.serialNumber);
  const reference = (
    <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium text-foreground/80">{item.bonReference}</span>
  );
  return (
    <li className={cn('space-y-2 px-4 py-3', retardJours !== null && 'bg-destructive/5')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium leading-tight text-foreground [overflow-wrap:anywhere]">{item.label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground/70">
            {item.categoryLabel ?? item.category}
            {serial && <span className="font-mono"> · {serial}</span>}
          </p>
        </div>
        <InventoryRowActions item={item} canLinkToBon={canLinkToBon} touch />
      </div>
      <SituationCell item={item} />
      <p className="text-sm text-foreground/80">
        {item.collaborateur.displayName}
        <span className="text-xs text-muted-foreground"> · {item.filiale.displayName}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {canLinkToBon ? (
          <Link to={`/bons/${item.bonId}`} className="inline-flex min-h-[44px] items-center hover:underline">
            {reference}
          </Link>
        ) : (
          reference
        )}
        <span>{`remis le ${formatDate(item.dateMiseDisposition)}`}</span>
        {item.dateRestitution && <span>{`retour prévu le ${formatDate(item.dateRestitution)}`}</span>}
      </div>
    </li>
  );
}

/** Inventaire sur téléphone : une carte par équipement, la situation et le
 *  bon toujours visibles, sans tableau à faire glisser de côté. */
export function InventoryCardList({ items, canLinkToBon }: InventoryCardListProps) {
  return (
    <ul className="divide-y divide-border" aria-label="Inventaire">
      {items.map((item) => (
        <InventoryCard key={item.equipmentId} item={item} canLinkToBon={canLinkToBon} />
      ))}
    </ul>
  );
}
