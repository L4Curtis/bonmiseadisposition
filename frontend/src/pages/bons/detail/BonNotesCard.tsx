import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export interface BonNotesCardProps {
  readonly notes: string;
}

export function BonNotesCard({ notes }: BonNotesCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Remarques</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground">{notes}</CardContent>
    </Card>
  );
}
