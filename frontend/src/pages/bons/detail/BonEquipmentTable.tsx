import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { EquipmentItem } from './types';
import { equipmentLabel } from './types';

export interface BonEquipmentTableProps {
  readonly equipments: readonly EquipmentItem[];
  readonly showEquipmentStatus: boolean;
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
                    {eq.serialNumber || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {eq.inventoryNumber || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{eq.notes || ''}</td>
                  {showEquipmentStatus && (
                    <td className="px-4 py-2.5">
                      {eq.returnedAt ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/20 px-2 py-0.5 rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Rendu
                        </span>
                      ) : eq.notReturned ? (
                        <span className="inline-flex items-center gap-1 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/20 px-2 py-0.5 rounded-full" title={eq.notReturnedReason || ''}>
                          <XCircle className="h-3 w-3" /> Non rendu
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
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
