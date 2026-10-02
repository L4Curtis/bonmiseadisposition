import { useEffect, useRef } from 'react';
import { BON_FORM_FIELDS, type BonFieldErrors, type BonFormField } from './lib/validation';
import { BON_FIELD_ANCHORS } from './fieldAnchors';

export interface FormErrorSummaryProps {
  readonly errors: BonFieldErrors;
  /** Change à chaque envoi refusé : le récapitulatif revient alors à l'écran. */
  readonly attempt: number;
}

function focusField(field: BonFormField): void {
  const target = document.getElementById(BON_FIELD_ANCHORS[field]);
  target?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  target?.focus({ preventScroll: true });
}

/** Récapitulatif des erreurs en haut du formulaire : toutes à la fois, dans
 *  l'ordre de l'écran, chacune menant à son champ. Il se met à jour à chaque
 *  correction et disparaît quand il n'y a plus rien à corriger. */
export function FormErrorSummary({ errors, attempt }: FormErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fields = BON_FORM_FIELDS.filter((field) => errors[field]);
  const visible = fields.length > 0;

  // Le bouton d'envoi est en bas, le récapitulatif en haut : on l'amène sous
  // les yeux à chaque envoi refusé, sinon le refus passe inaperçu.
  useEffect(() => {
    if (attempt > 0 && visible) ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  if (!visible) return null;
  const title = `${fields.length} point${fields.length > 1 ? 's' : ''} à corriger`;
  return (
    <div
      ref={ref}
      role="alert"
      aria-labelledby="bon-form-errors-title"
      className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <p id="bon-form-errors-title" className="font-medium">{title}</p>
      <ul className="mt-1 space-y-0.5">
        {fields.map((field) => (
          <li key={field}>
            <button
              type="button"
              onClick={() => focusField(field)}
              className="min-h-11 w-full text-left underline underline-offset-2 hover:no-underline sm:min-h-0 sm:py-0.5"
            >
              {errors[field]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
