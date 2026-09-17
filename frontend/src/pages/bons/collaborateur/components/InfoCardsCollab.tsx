import { Building2, CheckCircle2, Clock, PenTool } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateLong } from '@/lib/utils';
import { sigTypeLabel } from '../../detail/types';
import type { BonDetailData } from '../../detail/types';

interface InfoCardsCollabProps {
  bon: BonDetailData;
}

export function InfoCardsCollab({ bon }: InfoCardsCollabProps) {
  const signablesigs = bon.signatures.filter((s) => s.type !== 'it_cachet');
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Filiale & Dates
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Filiale</span>
            <span className="font-medium">{bon.filiale.displayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date mise à disposition</span>
            <span className="font-medium">{formatDateLong(bon.dateMiseDisposition)}</span>
          </div>
          {bon.dateRestitution && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date restitution prévue</span>
              <span className="font-medium">{formatDateLong(bon.dateRestitution)}</span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PenTool className="h-4 w-4 text-muted-foreground" /> Signatures
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {signablesigs.map((sig) => (
            <div key={sig.id} className="flex items-center justify-between">
              <span className="text-muted-foreground">{sigTypeLabel(sig.type)}</span>
              {sig.signed ? (
                <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400 text-xs font-medium">
                  <CheckCircle2 className="h-3 w-3" /> Signé le {formatDateLong(sig.signedAt)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400 text-xs font-medium">
                  <Clock className="h-3 w-3" /> En attente
                </span>
              )}
            </div>
          ))}
          {signablesigs.length === 0 && (
            <p className="text-muted-foreground text-xs">Aucune signature pour le moment</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
