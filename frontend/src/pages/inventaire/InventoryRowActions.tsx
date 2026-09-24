import { Link } from 'react-router';
import { FileText, History, RotateCcw } from 'lucide-react';
import type { BonStatus } from '@/types';
import type { InventoryItem } from './types';

/** Statuts de bon depuis lesquels la fiche propose « Initier restitution »
 *  (miroir de BonDetail.tsx : bon actif ou partiellement restitué). */
const RESTITUTION_STATUSES: readonly BonStatus[] = ['active', 'partially_returned'];

const ACTION_CLASS =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20';

/** Référence de la page /materiel/:reference : le n° de série de préférence,
 *  à défaut le n° d'inventaire (la page accepte les deux). */
function materielReference(item: InventoryItem): string | null {
  return item.serialNumber || item.inventoryNumber || null;
}

interface InventoryRowActionsProps {
  item: InventoryItem;
  /** Direction : ni lien vers le bon, ni restitution (/bons/:id → 403). */
  canLinkToBon: boolean;
}

/** Actions d'une ligne de l'inventaire : ouvrir le bon, voir l'historique du
 *  matériel, initier la restitution (lien profond qui ouvre directement la
 *  boîte de dialogue sur la fiche du bon). Liens plutôt que boutons : ils
 *  s'ouvrent aussi dans un nouvel onglet. */
export function InventoryRowActions({ item, canLinkToBon }: InventoryRowActionsProps) {
  const reference = materielReference(item);
  const canRestitute = canLinkToBon && RESTITUTION_STATUSES.includes(item.bonStatus);

  return (
    <div className="flex items-center justify-end gap-0.5">
      {canLinkToBon && (
        <Link
          to={`/bons/${item.bonId}`}
          className={ACTION_CLASS}
          title={`Ouvrir le bon ${item.bonReference}`}
          aria-label={`Ouvrir le bon ${item.bonReference}`}
        >
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
      {reference && (
        <Link
          to={`/materiel/${encodeURIComponent(reference)}`}
          className={ACTION_CLASS}
          title={`Voir l’historique de ce matériel (${reference})`}
          aria-label={`Voir l’historique de ce matériel : ${item.label}`}
        >
          <History className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
      {canRestitute && (
        <Link
          to={`/bons/${item.bonId}?action=restitution`}
          className={ACTION_CLASS}
          title={`Initier la restitution du bon ${item.bonReference}`}
          aria-label={`Initier la restitution du bon ${item.bonReference}`}
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
