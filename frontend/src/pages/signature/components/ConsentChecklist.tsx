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
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={luApprouve}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary/40"
      />
      <span className="text-sm text-foreground/80 group-hover:text-foreground transition-colors">
        {isPvCloture ? (
          <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance du présent procès-verbal d'équipements non restitués. Je comprends que cette signature électronique a valeur contractuelle.</>
        ) : (
          <><strong>Lu et approuvé</strong> — Je reconnais avoir pris connaissance de la liste des équipements ci-dessus et en confirme la {sigType}. Je comprends que cette signature électronique a valeur contractuelle.</>
        )}
      </span>
    </label>
  );
}
