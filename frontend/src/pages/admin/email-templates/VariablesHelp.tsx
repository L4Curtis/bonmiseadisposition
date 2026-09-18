import { toast } from '@/hooks/use-toast';
import type { Variable } from './types';

interface VariablesHelpProps {
  variables: Variable[];
}

/** Liste des variables disponibles pour un template email, cliquables pour
 *  copier le jeton `{{name}}` dans le presse-papier. */
export function VariablesHelp({ variables }: VariablesHelpProps) {
  if (variables.length === 0) return null;

  return (
    <div className="border-t px-4 py-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground mb-2">Variables disponibles :</p>
      <div className="flex flex-wrap gap-2">
        {variables.map((v) => (
          <span
            key={v.name}
            title={v.description}
            className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs font-mono cursor-pointer hover:bg-muted/80"
            onClick={() => {
              const token = `{{${v.name}}}`;
              navigator.clipboard?.writeText(token);
              toast({ title: 'Copié', description: `${token} copié dans le presse-papier` });
            }}
          >
            {`{{${v.name}}}`}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-1.5">Cliquez sur une variable pour la copier.</p>
    </div>
  );
}
