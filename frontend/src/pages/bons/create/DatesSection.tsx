import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { todayInParis } from '@/lib/kpi-period';
import type { BonFieldErrors } from './lib/validation';
import { invalidFieldProps } from './fieldAnchors';
import { FieldError } from './FieldError';

export interface DatesSectionProps {
  readonly dateMiseDisposition: string;
  readonly onDateMiseDispositionChange: (value: string) => void;
  readonly dateRestitution: string;
  readonly onDateRestitutionChange: (value: string) => void;
  /** Erreurs de saisie montrées après un envoi refusé. */
  readonly errors?: Pick<BonFieldErrors, 'dateMiseDisposition' | 'dateRestitution'>;
}

/** Carte « Dates » : mise à disposition (obligatoire) et restitution prévue
 *  (optionnelle), chacune avec un raccourci « Aujourd'hui ». */
export function DatesSection({
  dateMiseDisposition,
  onDateMiseDispositionChange,
  dateRestitution,
  onDateRestitutionChange,
  errors = {},
}: DatesSectionProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Dates</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="date-mise-disposition">Date de mise à disposition *</Label>
          <div className="flex gap-1.5">
            <Input
              id="date-mise-disposition"
              type="date"
              value={dateMiseDisposition}
              onChange={(e) => onDateMiseDispositionChange(e.target.value)}
              required
              {...invalidFieldProps('dateMiseDisposition', errors.dateMiseDisposition)}
              className={`flex-1${errors.dateMiseDisposition ? ' border-destructive' : ''}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Aujourd'hui"
              onClick={() => onDateMiseDispositionChange(todayInParis())}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
            </Button>
          </div>
          <FieldError field="dateMiseDisposition" message={errors.dateMiseDisposition} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date-restitution">Date de restitution prévue <span className="text-muted-foreground/70 text-xs">(optionnel)</span></Label>
          <div className="flex gap-1.5">
            <Input
              id="date-restitution"
              type="date"
              value={dateRestitution}
              onChange={(e) => onDateRestitutionChange(e.target.value)}
              {...invalidFieldProps('dateRestitution', errors.dateRestitution)}
              className={`flex-1${errors.dateRestitution ? ' border-destructive' : ''}`}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Aujourd'hui"
              onClick={() => onDateRestitutionChange(todayInParis())}
            >
              <CalendarCheck className="h-3.5 w-3.5" />
            </Button>
          </div>
          <FieldError field="dateRestitution" message={errors.dateRestitution} />
        </div>
      </CardContent>
    </Card>
  );
}
