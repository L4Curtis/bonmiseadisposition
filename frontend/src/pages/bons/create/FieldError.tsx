import type { BonFormField } from './lib/validation';
import { fieldErrorId } from './fieldAnchors';

/** Message d'erreur sous un champ du formulaire, relié au champ par
 *  `aria-describedby` (voir invalidFieldProps). */
export function FieldError({ field, message }: { readonly field: BonFormField; readonly message?: string }) {
  if (!message) return null;
  return (
    <p id={fieldErrorId(field)} className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}
