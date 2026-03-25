import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateLong } from '@/lib/utils';
import type { BonDetailData } from './types';

export interface BonInfoCardsProps {
  readonly bon: BonDetailData;
  readonly civiliteLabel: string;
}

export function BonInfoCards({ bon, civiliteLabel }: BonInfoCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Card className="card-accent-top">
        <CardHeader><CardTitle className="text-sm">Collaborateur</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground/70 w-28 shrink-0">Nom</span>
            <span className="font-medium">{civiliteLabel} {bon.collaborateur.displayName}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground/70 w-28 shrink-0">Email</span>
            <span>{bon.collaborateurEmail}</span>
          </div>
          {bon.collaborateur.department && (
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Service</span>
              <span>{bon.collaborateur.department}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-accent-top">
        <CardHeader><CardTitle className="text-sm">Filiale & Dates</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-muted-foreground/70 w-28 shrink-0">Filiale</span>
            <span className="font-medium">{bon.filiale.displayName}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground/70 w-28 shrink-0">Mise à dispo</span>
            <span>{formatDateLong(bon.dateMiseDisposition)}</span>
          </div>
          {bon.dateRestitution && (
            <div className="flex gap-2">
              <span className="text-muted-foreground/70 w-28 shrink-0">Restitution</span>
              <span>{formatDateLong(bon.dateRestitution)}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
