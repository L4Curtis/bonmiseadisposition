import { Link } from 'react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { EquipmentItem } from './types';
import { equipmentLabel } from './types';

export interface BonEquipmentTableProps {
  readonly equipments: readonly EquipmentItem[];
  readonly showEquipmentStatus: boolean;
  /** Accepté mais plus utilisé depuis le lot L1 : l'historique d'un matériel
   *  est désormais une page dédiée (/materiel/:reference), sans notion de
   *  « bon actuel » à mettre en évidence. Conservé pour ne pas casser
   *  BonDetail.tsx (hors périmètre de ce lot), qui continue de le passer. */
  readonly bonId?: string;
}

export function BonEquipmentTable({ equipments, showEquipmentStatus }: BonEquipmentTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Équipements ({equipments.length})</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {equipments.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground/70 py-6">Aucun équipement</p>
        ) : (
          <table className="w-full text-sm" aria-label="Liste des équipements du bon">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Désignation</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° Série</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">N° Inventaire</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Notes</th>
                {showEquipmentStatus && (
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Statut</th>
                )}
              </tr>
            </thead>
            <tbody>
              {equipments.map((eq, i) => (
                <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-2.5 text-muted-foreground/70">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{equipmentLabel(eq)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {eq.serialNumber ? (
                      <Link
                        to={`/materiel/${encodeURIComponent(eq.serialNumber)}`}
                        className="hover:text-foreground hover:underline decoration-dotted underline-offset-2 transition-colors"
                        title={`Historique du matériel ${eq.serialNumber}`}
                        aria-label={`Historique du matériel ${eq.serialNumber}`}
                      >
                        {eq.serialNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {eq.inventoryNumber ? (
                      <Link
                        to={`/materiel/${encodeURIComponent(eq.inventoryNumber)}`}
                        className="hover:text-foreground hover:underline decoration-dotted underline-offset-2 transition-colors"
                        title={`Historique du matériel ${eq.inventoryNumber}`}
                        aria-label={`Historique du matériel ${eq.inventoryNumber}`}
                      >
                        {eq.inventoryNumber}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{eq.notes || ''}</td>
                  {showEquipmentStatus && (
                    <td className="px-4 py-2.5">
                      {eq.returnedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Rendu
                        </span>
                      ) : eq.notReturned ? (
                        <span className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-0.5 rounded-full" title={eq.notReturnedReason || ''}>
                          <XCircle className="h-3 w-3" /> Non rendu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-warning bg-warning/10 px-2 py-0.5 rounded-full">
                          <Clock className="h-3 w-3" /> En attente
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
