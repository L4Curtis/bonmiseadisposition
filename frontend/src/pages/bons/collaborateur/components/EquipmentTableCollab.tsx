import { Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { equipmentLabel } from '../../detail/types';
import type { BonDetailData } from '../../detail/types';
import { EquipmentStatusBadge } from './EquipmentStatusBadge';

interface EquipmentTableCollabProps {
  bon: BonDetailData;
  showEquipmentStatus: boolean;
}

export function EquipmentTableCollab({ bon, showEquipmentStatus }: EquipmentTableCollabProps) {
  const hasNotes = bon.equipments.some((e) => e.notes);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          Équipements ({bon.equipments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Liste des équipements">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">Désignation</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden sm:table-cell">N° série</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden md:table-cell">N° inventaire</th>
                {showEquipmentStatus && (
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">État</th>
                )}
                {hasNotes && (
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider hidden lg:table-cell">Notes</th>
                )}
              </tr>
            </thead>
            <tbody>
              {bon.equipments.map((eq) => (
                <tr key={eq.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{equipmentLabel(eq)}</span>
                    {eq.catalogItem?.category && (
                      <span className="ml-2 text-xs text-muted-foreground">({eq.catalogItem.category})</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs hidden sm:table-cell">
                    {eq.serialNumber || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs hidden md:table-cell">
                    {eq.inventoryNumber || '—'}
                  </td>
                  {showEquipmentStatus && (
                    <td className="px-4 py-2.5">
                      <EquipmentStatusBadge eq={eq} />
                      {eq.notReturned && eq.notReturnedReason && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{eq.notReturnedReason}</p>
                      )}
                    </td>
                  )}
                  {hasNotes && (
                    <td className="px-4 py-2.5 text-muted-foreground text-xs hidden lg:table-cell">
                      {eq.notes || '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
