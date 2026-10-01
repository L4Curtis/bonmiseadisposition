import { Link } from 'react-router';
import { ArrowRightLeft, CheckCircle2, Clock, PenLine, XCircle } from 'lucide-react';
import type { BonDetail, BonRef, EquipmentReturnState } from '@/contracts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EQUIPMENT_RETURN_STATE_LABELS } from './bon-lexicon';
import { equipmentLabel, type FicheEquipment } from './types';

export interface BonEquipmentTableProps {
  readonly equipments: readonly FicheEquipment[];
  /** Colonne « État » : utile dès qu'une restitution a commencé. */
  readonly showEquipmentStatus: boolean;
  /** Bon remplaçant (bon clôturé « remplacé ») : ses équipements y sont suivis. */
  readonly replacedBy?: BonRef | null;
}

/** Statuts où la colonne « État » a un sens, quels que soient les équipements. */
const RESTITUTION_STARTED: ReadonlySet<string> = new Set(['sent_restitution', 'partially_returned', 'archived']);

/**
 * La colonne « État » s'affiche dès qu'une restitution a commencé, et aussi
 * sur un bon contesté dont des équipements sont déjà marqués rendus ou
 * déclarés non restitués : pour trancher, il faut voir ce qui a été marqué.
 */
export function showsEquipmentState(bon: Pick<BonDetail, 'status' | 'equipments'>): boolean {
  if (RESTITUTION_STARTED.has(bon.status)) return true;
  return bon.equipments.some((e) => (e.returnState ?? 'out') !== 'out' || e.returnedAt !== null || e.notReturned);
}

const STATE_STYLES: Readonly<Record<EquipmentReturnState, { className: string; Icon: typeof Clock }>> = {
  out: { className: 'text-muted-foreground bg-muted', Icon: Clock },
  returned_to_sign: { className: 'text-warning bg-warning/10', Icon: PenLine },
  returned: { className: 'text-success bg-success/10', Icon: CheckCircle2 },
  not_returned: { className: 'text-destructive bg-destructive/10', Icon: XCircle },
  replaced: { className: 'text-muted-foreground bg-muted', Icon: ArrowRightLeft },
};

function StateBadge({ equipment, replacedBy }: { equipment: FicheEquipment; replacedBy?: BonRef | null }) {
  const state = equipment.returnState ?? (equipment.notReturned ? 'not_returned' : equipment.returnedAt ? 'returned' : 'out');
  const { className, Icon } = STATE_STYLES[state];
  if (state === 'replaced' && replacedBy) {
    return (
      <Link
        to={`/bons/${replacedBy.id}`}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs underline-offset-2 hover:underline ${className}`}
      >
        <Icon className="h-3 w-3" aria-hidden="true" /> Repris sur {replacedBy.reference}
      </Link>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${className}`} title={equipment.notReturnedReason ?? undefined}>
      <Icon className="h-3 w-3" aria-hidden="true" /> {EQUIPMENT_RETURN_STATE_LABELS[state]}
    </span>
  );
}

function NumberLink({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return (
    <Link
      to={`/materiel/${encodeURIComponent(value)}`}
      className="transition-colors decoration-dotted underline-offset-2 hover:text-foreground hover:underline"
      title={`Historique de l’équipement ${value}`}
    >
      {value}
    </Link>
  );
}

/** Équipements du bon, avec l'état de chacun calculé par le serveur. */
export function BonEquipmentTable({ equipments, showEquipmentStatus, replacedBy }: BonEquipmentTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Équipements ({equipments.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {equipments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground/70">Aucun équipement</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Équipements du bon">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Désignation</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° de série</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° d’inventaire</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Notes</th>
                  {showEquipmentStatus && <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">État</th>}
                </tr>
              </thead>
              <tbody>
                {equipments.map((eq, i) => (
                  <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5 text-muted-foreground/70">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium">{equipmentLabel(eq)}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground"><NumberLink value={eq.serialNumber} /></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground"><NumberLink value={eq.inventoryNumber} /></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{eq.notes || ''}</td>
                    {showEquipmentStatus && <td className="whitespace-nowrap px-4 py-2.5"><StateBadge equipment={eq} replacedBy={replacedBy} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
