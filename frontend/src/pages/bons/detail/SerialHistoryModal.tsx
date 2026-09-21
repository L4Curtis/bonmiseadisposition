import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { History, Loader2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { StatusBadge } from '@/components/StatusBadge';
import type { BonStatus } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SerialHistoryEntry {
  equipmentId: string;
  serialNumber: string;
  label: string | null;
  returnedAt: string | null;
  notReturned: boolean;
  bon: {
    id: string;
    reference: string;
    status: BonStatus;
    dateMiseDisposition: string;
    dateRestitution?: string | null;
    collaborateur: { displayName: string; email: string };
    filiale: { displayName: string };
  };
}

/** Réponse de GET /equipment/serial-history. Le backend renvoie une ENVELOPPE,
 *  pas un tableau : `truncated` signale que l'historique dépasse la limite de
 *  200 bons, et `total` donne le compte réel. Lire `items`. */
interface SerialHistoryResponse {
  items: SerialHistoryEntry[];
  truncated: boolean;
  total: number;
}

interface SerialHistoryModalProps {
  readonly serialNumber: string;
  /** Bon depuis lequel la modale est ouverte — marqué « bon actuel », non navigable. */
  readonly currentBonId?: string;
  readonly onClose: () => void;
}

/** Historique d'un numéro de série : tous les bons où il apparaît. */
export function SerialHistoryModal({ serialNumber, currentBonId, onClose }: SerialHistoryModalProps) {
  const navigate = useNavigate();
  const [history, setHistory] = useState<SerialHistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<SerialHistoryResponse>(`/equipment/serial-history?q=${encodeURIComponent(serialNumber)}`)
      .then(setHistory)
      .catch((e: unknown) => setError(e instanceof Error && e.message ? e.message : 'Erreur de chargement'));
  }, [serialNumber]);

  const entries = history?.items ?? null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Historique du n° <span className="font-mono">{serialNumber}</span>
          </DialogTitle>
          <DialogDescription>Tous les bons où ce numéro de série apparaît.</DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="py-6 text-center text-sm text-destructive" role="alert">
            <XCircle className="h-6 w-6 mx-auto mb-2" />
            <p>{error}</p>
          </div>
        ) : entries === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none text-muted-foreground" />
          </div>
        ) : entries.filter((e) => e.bon.id !== currentBonId).length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground/70">
            Aucun autre bon ne référence ce numéro de série.
          </p>
        ) : (
          <>
          {history?.truncated && (
            <p className="text-xs text-muted-foreground/80 pb-1">
              {`Les ${entries?.length ?? 0} bons les plus récents, sur ${history.total}.`}
            </p>
          )}
          <ul className="divide-y divide-border max-h-80 overflow-y-auto">
            {entries.map((entry) => {
              const isCurrent = entry.bon.id === currentBonId;
              return (
                <li key={entry.equipmentId}>
                  <button
                    type="button"
                    disabled={isCurrent}
                    className={`w-full flex items-center justify-between gap-3 px-1 py-2.5 text-left rounded-md ${isCurrent ? 'opacity-60 cursor-default' : 'hover:bg-muted/40'}`}
                    onClick={() => { if (!isCurrent) { onClose(); navigate(`/bons/${entry.bon.id}`); } }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium font-mono">
                        {entry.bon.reference}
                        {isCurrent && <span className="ml-2 text-xs font-sans text-muted-foreground/70">(bon actuel)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {entry.bon.collaborateur.displayName} · {entry.bon.filiale.displayName} ·{' '}
                        {formatDate(entry.bon.dateMiseDisposition)}
                        {entry.label ? ` · ${entry.label}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.returnedAt && (
                        <span className="text-xs text-success">rendu</span>
                      )}
                      {entry.notReturned && (
                        <span className="text-xs text-destructive">non rendu</span>
                      )}
                      <StatusBadge status={entry.bon.status} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
