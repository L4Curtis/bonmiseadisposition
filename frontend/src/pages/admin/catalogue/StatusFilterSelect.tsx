import { STATUS_FILTER_OPTIONS } from './lib/statusFilter';
import type { ItemStatusFilter } from './lib/statusFilter';

interface StatusFilterSelectProps {
  value: ItemStatusFilter;
  onChange: (value: ItemStatusFilter) => void;
  label: string;
}

/** Sélecteur d'état (Actifs par défaut / Tous / Désactivés), partagé par le
 *  catalogue et les packs pour un comportement cohérent entre les deux
 *  onglets — voir {@link ./lib/statusFilter}. */
export function StatusFilterSelect({ value, onChange, label }: StatusFilterSelectProps) {
  return (
    <select
      className="field-modern h-9 px-3 cursor-pointer"
      value={value}
      onChange={(e) => onChange(e.target.value as ItemStatusFilter)}
      aria-label={label}
    >
      {STATUS_FILTER_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
