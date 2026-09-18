import { CalendarSearch } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FADE_IN } from './stagger';

interface EmptyPeriodNoticeProps {
  /** Ce qui n'a pas eu lieu, au pluriel : « bon créé, envoyé ou archivé ». */
  quoi: string;
  /** Élargit la période à douze mois. */
  onElargir: () => void;
  /** Masque le bouton quand la période affichée est déjà la plus large. */
  elargissementPossible: boolean;
}

/**
 * Bandeau affiché quand la période sélectionnée ne contient aucune activité.
 * Sans lui, l'onglet se remplit de zéros, de tirets et de graphiques plats :
 * on ne sait pas si l'application est cassée ou s'il ne s'est rien passé.
 */
export function EmptyPeriodNotice({ quoi, onElargir, elargissementPossible }: EmptyPeriodNoticeProps) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-5 py-4 ${FADE_IN}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background">
          <CalendarSearch className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground/80">Aucune activité sur la période choisie</p>
          <p className="text-xs text-muted-foreground/80">Aucun {quoi} sur cet intervalle.</p>
        </div>
      </div>
      {elargissementPossible && (
        <Button type="button" variant="outline" size="sm" onClick={onElargir}>
          Voir les 12 derniers mois
        </Button>
      )}
    </div>
  );
}
