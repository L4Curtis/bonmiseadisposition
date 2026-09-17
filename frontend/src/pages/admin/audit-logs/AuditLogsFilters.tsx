import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ACTION_LABELS } from './actionMeta';

interface AuditLogsFiltersProps {
  userEmailInput: string;
  onUserEmailInputChange: (value: string) => void;
  onApplySearch: () => void;
  action: string;
  onActionChange: (value: string) => void;
  availableActions: string[];
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
  onReset: () => void;
}

/** Barre de filtres du journal d'audit : email, action, plage de dates. */
export function AuditLogsFilters({
  userEmailInput,
  onUserEmailInputChange,
  onApplySearch,
  action,
  onActionChange,
  availableActions,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  onReset,
}: AuditLogsFiltersProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              className="pl-9"
              placeholder="Email utilisateur..."
              value={userEmailInput}
              onChange={(e) => onUserEmailInputChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onApplySearch(); }}
            />
          </div>

          <Select
            value={action || '__all__'}
            onValueChange={(v) => onActionChange(v === '__all__' ? '' : v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Toutes les actions</SelectItem>
              {availableActions.map((a) => (
                <SelectItem key={a} value={a}>{ACTION_LABELS[a]?.label ?? a}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            title="Date depuis"
          />

          <Input
            type="date"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            title="Date jusqu'au"
          />
        </div>

        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onApplySearch}>Rechercher</Button>
          <Button size="sm" variant="outline" onClick={onReset}>Réinitialiser</Button>
        </div>
      </CardContent>
    </Card>
  );
}
