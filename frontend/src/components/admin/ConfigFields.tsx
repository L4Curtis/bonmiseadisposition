import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ConfigRegistryEntry } from '@/contracts/config-registry';
import { appliedValueCaption, toggleChecked } from '@/pages/admin/configuration/appliedValue';

export const SECRET_MASK = '••••••••';

export type FieldDef = {
  key: string;
  label: string;
  /** Exemple de saisie (jamais une valeur par défaut : celle-ci s'affiche en clair dessous). */
  placeholder?: string;
  type?: string;
  encrypted?: boolean;
  toggle?: boolean;
  /** Texte d'aide affiché sous le champ. */
  help?: string;
  min?: number;
  max?: number;
};

/** La ligne d'aide décrit ce qui est ENREGISTRÉ : on la montre tant que le
 *  champ est vide ou qu'il porte encore la valeur enregistrée. */
function describesField(value: string | undefined, entry: ConfigRegistryEntry | undefined): boolean {
  return value === undefined || value === '' || value === entry?.storedValue;
}

/** « Valeur appliquée : 3 (par défaut) », ou l'avertissement d'une saisie non appliquée telle quelle. */
function AppliedValueLine({ id, entry, value }: { id: string; entry: ConfigRegistryEntry | undefined; value: string | undefined }) {
  const caption = appliedValueCaption(entry);
  if (!caption || !describesField(value, entry)) return null;
  return (
    <p id={id} className={`text-xs ${caption.tone === 'warning' ? 'text-warning' : 'text-muted-foreground'}`}>
      {caption.text}
    </p>
  );
}

function Toggle({ checked, onChange, id, label, describedBy }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  id: string;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      // Nom accessible : le libellé visible est un <Label> voisin.
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-card shadow-sm ring-1 ring-black/5 transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </span>
    </button>
  );
}

export function ToggleField({ field, value, entry, onChange }: {
  field: FieldDef;
  value: string | undefined;
  entry: ConfigRegistryEntry | undefined;
  onChange: (value: string) => void;
}) {
  const captionId = `${field.key}-applique`;
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Toggle
        id={field.key}
        label={field.label}
        describedBy={appliedValueCaption(entry) ? captionId : undefined}
        checked={toggleChecked(value, entry)}
        onChange={(checked) => onChange(checked ? 'true' : 'false')}
      />
      <div className="min-w-0 pt-2.5">
        <Label htmlFor={field.key} className="cursor-pointer select-none">{field.label}</Label>
        <AppliedValueLine id={captionId} entry={entry} value={value} />
      </div>
    </div>
  );
}

export function InputField({ field, value, entry, onChange, onFocusSecret }: {
  field: FieldDef;
  value: string;
  entry: ConfigRegistryEntry | undefined;
  onChange: (value: string) => void;
  onFocusSecret: (input: HTMLInputElement) => void;
}) {
  const captionId = `${field.key}-applique`;
  const helpId = `${field.key}-aide`;
  const describedBy = [appliedValueCaption(entry) ? captionId : null, field.help ? helpId : null].filter(Boolean).join(' ');
  return (
    <div className="min-w-0 space-y-1">
      <Label htmlFor={field.key}>{field.label}</Label>
      <Input
        id={field.key}
        type={field.type || 'text'}
        placeholder={field.placeholder}
        min={field.min ?? entry?.min ?? undefined}
        max={field.max ?? entry?.max ?? undefined}
        value={value}
        aria-describedby={describedBy || undefined}
        className="h-11 sm:h-9"
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => {
          // Le masque d'un secret n'est jamais effacé au focus : il est
          // sélectionné, et la première frappe le remplace.
          if (field.encrypted && e.target.value === SECRET_MASK) onFocusSecret(e.target);
        }}
      />
      <AppliedValueLine id={captionId} entry={entry} value={value} />
      {field.help && <p id={helpId} className="text-xs text-muted-foreground">{field.help}</p>}
    </div>
  );
}
