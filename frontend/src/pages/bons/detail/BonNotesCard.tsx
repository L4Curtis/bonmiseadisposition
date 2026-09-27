import { Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface BonNotesCardProps {
  /** « Remarques sur le bon » : visibles par le collaborateur et sur le PDF. */
  readonly notes?: string | null;
  /** « Note interne IT » : jamais montrée au collaborateur (R-170). */
  readonly internalNote?: string | null;
}

/** Les deux textes libres du bon, bien séparés : ce que voit le
 *  collaborateur, et ce qui reste à l'équipe informatique. */
export function BonNotesCard({ notes, internalNote }: BonNotesCardProps) {
  if (!notes && !internalNote) return null;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Remarques sur le bon</CardTitle>
            <p className="text-xs text-muted-foreground">Visibles par le collaborateur et sur le PDF.</p>
          </CardHeader>
          <CardContent className="whitespace-pre-line break-words text-sm text-muted-foreground">{notes}</CardContent>
        </Card>
      )}
      {internalNote && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-1.5 text-sm">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Note interne IT
            </CardTitle>
            <p className="text-xs text-muted-foreground">Jamais montrée au collaborateur.</p>
          </CardHeader>
          <CardContent className="whitespace-pre-line break-words text-sm text-muted-foreground">{internalNote}</CardContent>
        </Card>
      )}
    </div>
  );
}
