import type { ConfigRegistryEntry, ConfigScalar } from '@/contracts/config-registry';

/** Ton de la ligne d'aide : neutre, ou avertissement quand la saisie n'est pas appliquée telle quelle. */
export type AppliedValueTone = 'muted' | 'warning';

export interface AppliedValueCaption {
  readonly text: string;
  readonly tone: AppliedValueTone;
}

function display(value: ConfigScalar): string {
  if (value === true) return 'activé';
  if (value === false) return 'désactivé';
  return String(value);
}

function boundText(entry: ConfigRegistryEntry): string {
  if (entry.appliedValue === entry.min) return 'minimum';
  if (entry.appliedValue === entry.max) return 'maximum';
  return 'autorisée';
}

/**
 * Ce que l'écran affiche sous un réglage, d'après le registre du serveur :
 *  - rien de saisi : « Valeur appliquée : 3 (par défaut) » (ou la valeur reprise
 *    de la configuration du serveur) ;
 *  - saisie hors bornes : elle est ramenée à la borne, et on le dit ;
 *  - saisie illisible : le défaut s'applique, et on le dit ;
 *  - saisie normale, ou secret : rien (`null`).
 */
export function appliedValueCaption(entry: ConfigRegistryEntry | undefined): AppliedValueCaption | null {
  if (!entry || entry.secret) return null;
  const applied = entry.appliedValue;
  if (entry.source === 'environment' && applied !== null) {
    return { text: `Valeur appliquée : ${display(applied)} (reprise de la configuration du serveur)`, tone: 'muted' };
  }
  if (entry.source === 'stored') {
    if (!entry.adjusted || applied === null) return null;
    return {
      text: `La valeur saisie (${entry.storedValue}) est hors des bornes : valeur appliquée ${display(applied)} (${boundText(entry)}).`,
      tone: 'warning',
    };
  }
  if (applied === null) return { text: 'Non renseigné : aucune valeur par défaut.', tone: 'muted' };
  if (entry.adjusted) {
    return {
      text: `La valeur saisie (${entry.storedValue}) est illisible : valeur appliquée ${display(applied)} (par défaut).`,
      tone: 'warning',
    };
  }
  return { text: `Valeur appliquée : ${display(applied)} (par défaut)`, tone: 'muted' };
}

/** Interrupteur affiché : la valeur saisie, sinon celle que le serveur applique. */
export function toggleChecked(value: string | undefined, entry: ConfigRegistryEntry | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return entry?.appliedValue === true;
}
