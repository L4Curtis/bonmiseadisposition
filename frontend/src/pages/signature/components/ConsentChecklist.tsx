interface ConsentChecklistProps {
  isPvCloture: boolean;
  sigType: string;
  luApprouve: boolean;
  onChange: (checked: boolean) => void;
}

/** Case « Lu et approuvé » — le libellé varie selon le type de document
 *  (procès-verbal d'équipements non restitués vs. mise à disposition/
 *  restitution). */
export function ConsentChecklist({ isPvCloture, sigType, luApprouve, onChange }: ConsentChecklistProps) {
  return (
    // Toute la ligne est la zone de toucher (≥ 44 px de haut) ; la case elle-
    // même est agrandie à 24 px pour rester visible et facile à viser au doigt.
    <label className="-mx-2 flex min-h-11 items-start gap-3 rounded-lg px-2 py-2 cursor-pointer group hover:bg-muted/40 transition-colors">
      <input
        type="checkbox"
        checked={luApprouve}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-6 w-6 shrink-0 cursor-pointer rounded border-input accent-primary text-primary focus:ring-primary/40"
      />
      <span className="text-sm leading-relaxed text-foreground/80 group-hover:text-foreground transition-colors">
        {isPvCloture ? (
          <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance du présent procès-verbal d'équipements non restitués. Je comprends que cette signature électronique a valeur contractuelle.</>
        ) : (
          <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance de la liste des équipements ci-dessus et en confirme la {sigType}. Je comprends que cette signature électronique a valeur contractuelle.</>
        )}
      </span>
    </label>
  );
}
