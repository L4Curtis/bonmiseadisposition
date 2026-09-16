import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Filiale } from '@/types';

const ALL_VALUE = 'all';

export interface FilialeFilterProps {
  value: string | null;
  onChange: (filialeId: string | null) => void;
  className?: string;
}

/** Filtre filiale global du tableau de bord — `GET /filiales/active`. */
export function FilialeFilter({ value, onChange, className }: FilialeFilterProps) {
  const [filiales, setFiliales] = useState<Filiale[]>([]);

  useEffect(() => {
    api.get<Filiale[]>('/filiales/active').then(setFiliales).catch(() => setFiliales([]));
  }, []);

  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}>
      <SelectTrigger className={className ?? 'h-9 w-[200px]'} aria-label="Filtrer par filiale">
        <SelectValue placeholder="Toutes les filiales" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Toutes les filiales</SelectItem>
        {filiales.map((f) => (
          <SelectItem key={f.id} value={f.id}>{f.displayName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
