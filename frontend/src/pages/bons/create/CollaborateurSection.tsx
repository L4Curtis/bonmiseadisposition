import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { isDeliverableEmail } from '@/lib/email';
import type { Filiale } from '@/types';
import { UserAutocomplete } from './UserAutocomplete';
import type { CiviliteChoice, UserResult } from './types';
import { CIVILITE_LABELS, CIVILITE_LONG_LABELS } from '@/domain/labels';

export interface CollaborateurSectionProps {
  readonly civilite: CiviliteChoice;
  /** La civilité affichée vient du compte du collaborateur (bon précédent). */
  readonly civiliteFromAccount?: boolean;
  readonly onCiviliteChange: (civilite: 'mme' | 'mr') => void;
  readonly filialeId: string;
  readonly onFilialeIdChange: (filialeId: string) => void;
  readonly filiales: Filiale[];
  readonly collaborateur: UserResult | null;
  readonly onCollaborateurChange: (user: UserResult | null) => void;
}

/** Carte « Collaborateur & Filiale » : civilité, filiale et sélection du
 *  collaborateur, avec l'avertissement pour un compte sans email valide (le
 *  lien de signature ne pourra alors pas lui être envoyé). */
export function CollaborateurSection({
  civilite,
  civiliteFromAccount = false,
  onCiviliteChange,
  filialeId,
  onFilialeIdChange,
  filiales,
  collaborateur,
  onCollaborateurChange,
}: CollaborateurSectionProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Collaborateur et filiale</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label id="civilite-label">Civilité *</Label>
          <div role="radiogroup" aria-labelledby="civilite-label" className="flex gap-2">
            {(['mme', 'mr'] as const).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={civilite === c}
                aria-label={CIVILITE_LONG_LABELS[c]}
                onClick={() => onCiviliteChange(c)}
                className={`min-h-11 rounded-md border px-4 text-sm font-medium transition-colors sm:min-h-9 ${
                  civilite === c
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground hover:bg-muted/40'
                }`}
              >
                {CIVILITE_LABELS[c]}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {civilite === ''
              ? 'À choisir : aucune civilité n’est proposée par défaut.'
              : civiliteFromAccount
                ? 'Reprise du compte du collaborateur (bon précédent).'
                : 'Elle sera retenue pour les prochains bons de ce collaborateur.'}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="filiale-select">Filiale *</Label>
          <Select value={filialeId ?? ''} onValueChange={onFilialeIdChange}>
            <SelectTrigger id="filiale-select">
              <SelectValue placeholder="Sélectionner une filiale..." />
            </SelectTrigger>
            <SelectContent>
              {filiales.map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Collaborateur *</Label>
          <UserAutocomplete value={collaborateur} onChange={onCollaborateurChange} />
          {collaborateur && !isDeliverableEmail(collaborateur.email) && (
            <p
              role="alert"
              className="mt-1 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                Ce compte n'a pas d'adresse email valide ({collaborateur.email || 'vide'}) : le lien de signature ne
                pourra pas lui être envoyé. Seule la signature au guichet sera possible.
              </span>
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
