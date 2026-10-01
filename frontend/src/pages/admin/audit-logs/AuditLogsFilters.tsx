import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AUDIT_ACTIONS, AUDIT_ACTION_DOMAINS } from '@/contracts/audit-actions';
import type { AuditAction, AuditActionDomain } from '@/contracts/audit-actions';
import { actionsByDomain, type AuditFilters } from './auditFilters';

const ALL = '__all__';

interface AuditLogsFiltersProps {
  filters: AuditFilters;
  onChange: (changes: Partial<AuditFilters>) => void;
  onReset: () => void;
}

/** Famille d'actions : changer de famille retire une action qui n'en fait pas partie. */
function DomainSelect({ filters, onChange }: Omit<AuditLogsFiltersProps, 'onReset'>) {
  const changeDomain = (value: string) => {
    const domain = value === ALL ? '' : (value as AuditActionDomain);
    const keepAction = filters.action && (!domain || AUDIT_ACTIONS[filters.action].domain === domain);
    onChange({ domain, action: keepAction ? filters.action : '' });
  };
  return (
    <Select value={filters.domain || ALL} onValueChange={changeDomain}>
      <SelectTrigger aria-label="Famille d'actions" className="min-h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Toutes les familles</SelectItem>
        {(Object.keys(AUDIT_ACTION_DOMAINS) as AuditActionDomain[]).map((d) => (
          <SelectItem key={d} value={d}>{AUDIT_ACTION_DOMAINS[d]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionSelect({ filters, onChange }: Omit<AuditLogsFiltersProps, 'onReset'>) {
  return (
    <Select
      value={filters.action || ALL}
      onValueChange={(v) => onChange({ action: v === ALL ? '' : (v as AuditAction) })}
    >
      <SelectTrigger aria-label="Action" className="min-h-11">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Toutes les actions</SelectItem>
        {actionsByDomain(filters.domain).map((group) => (
          <SelectGroup key={group.domain}>
            <div className="px-2 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
              {AUDIT_ACTION_DOMAINS[group.domain]}
            </div>
            {group.actions.map((a) => (
              <SelectItem key={a} value={a}>{AUDIT_ACTIONS[a].label}</SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Barre de filtres du journal : auteur (nom ou email), famille, action,
 *  période (jours civils, bornes incluses). Tout est gardé dans l'adresse. */
export function AuditLogsFilters({ filters, onChange, onReset }: AuditLogsFiltersProps) {
  const [userInput, setUserInput] = useState(filters.user);
  useEffect(() => setUserInput(filters.user), [filters.user]);
  const applyUser = () => onChange({ user: userInput.trim() });

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70" />
            <Input
              className="pl-9 min-h-11"
              placeholder="Auteur (nom ou email)…"
              aria-label="Auteur de l'action (nom ou email)"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyUser(); }}
              onBlur={applyUser}
            />
          </div>
          <DomainSelect filters={filters} onChange={onChange} />
          <ActionSelect filters={filters} onChange={onChange} />
          <Input
            type="date"
            className="min-h-11"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            max={filters.dateTo || undefined}
            aria-label="Période : du (inclus)"
          />
          <Input
            type="date"
            className="min-h-11"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            min={filters.dateFrom || undefined}
            aria-label="Période : au (inclus)"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="min-h-11" onClick={applyUser}>Rechercher</Button>
          <Button size="sm" variant="outline" className="min-h-11" onClick={onReset}>Réinitialiser</Button>
        </div>
      </CardContent>
    </Card>
  );
}
