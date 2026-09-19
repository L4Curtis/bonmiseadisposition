import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveFiliales } from '@/hooks/use-active-filiales';

const ALL_VALUE = 'all';

export interface FilialeFilterProps {
  value: string | null;
  onChange: (filialeId: string | null) => void;
  className?: string;
}

/** Filtre filiale global du tableau de bord — `GET /filiales/active`,
 *  mutualisé et mis en cache via `useActiveFiliales` (partagé avec les autres
 *  filtres/formulaires du même nom). */
export function FilialeFilter({ value, onChange, className }: FilialeFilterProps) {
  const { filiales, error } = useActiveFiliales();
  // Une erreur vide l'affichage (comportement historique de ce composant),
  // contrairement à d'autres appelants qui gardent la dernière liste connue.
  const options = error ? [] : filiales;

  return (
    <Select value={value ?? ALL_VALUE} onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}>
      <SelectTrigger className={className ?? 'h-9 w-[200px]'} aria-label="Filtrer par filiale">
        <SelectValue placeholder="Toutes les filiales" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>Toutes les filiales</SelectItem>
        {options.map((f) => (
          <SelectItem key={f.id} value={f.id}>{f.displayName}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
