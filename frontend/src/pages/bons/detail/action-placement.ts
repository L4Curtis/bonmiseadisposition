import type { BonActionName, BonAvailableAction, BonDetail } from '@/contracts';
import { SECONDARY_ACTIONS } from './bon-lexicon';

/** Où va chaque action du panneau « À faire maintenant ». */
export interface ActionPlacement {
  readonly primary: BonAvailableAction | null;
  /** Boutons visibles à côté de l'action principale. */
  readonly inline: readonly BonAvailableAction[];
  /** Menu « Autres actions ». */
  readonly more: readonly BonAvailableAction[];
}

/** Tant qu'un document attend la signature du collaborateur, lancer une
 *  nouvelle restitution ou déclarer une perte n'est pas le geste attendu :
 *  ces actions restent possibles, mais rangées dans « Autres actions ». */
const WHILE_PENDING: ReadonlySet<BonActionName> = new Set<BonActionName>([
  'start_restitution', 'restitution_in_person', 'declare_not_returned',
]);

/** Gestes qui relancent la signature du document en attente. */
const SIGNATURE_REQUESTS: ReadonlySet<BonActionName> = new Set<BonActionName>(['resend', 'show_in_person_link']);

type PlacementContext = Pick<BonDetail, 'availableActions' | 'pendingSignature'> & Partial<Pick<BonDetail, 'contestation'>>;

function isSecondary(entry: BonAvailableAction, bon: PlacementContext, hasPrimary: boolean): boolean {
  if (SECONDARY_ACTIONS.has(entry.action)) return true;
  if (!bon.pendingSignature) return false;
  if (WHILE_PENDING.has(entry.action)) return true;
  // Contestation Fondée pas encore corrigée : relancer la signature renverrait
  // le même document faux ; seule la correction reste en vue.
  if (bon.contestation?.stage === 'correction' && SIGNATURE_REQUESTS.has(entry.action)) return true;
  // Lien encore valide : rien à renvoyer ; seul le guichet reste en vue, pour
  // le collaborateur qui se présente.
  return entry.action === 'resend' && !hasPrimary;
}

/**
 * Une action claire à la fois (R-023) : l'action principale calculée par le
 * serveur, les gestes utiles tout de suite à côté, le reste dans « Autres
 * actions ». Les actions et leur blocage viennent du serveur ; seule leur
 * place est décidée ici.
 */
export function placeActions(bon: PlacementContext): ActionPlacement {
  const actions = bon.availableActions ?? [];
  const primary = actions.find((a) => a.primary) ?? null;
  const others = actions.filter((a) => !a.primary);
  return {
    primary,
    inline: others.filter((a) => !isSecondary(a, bon, primary !== null)),
    more: others.filter((a) => isSecondary(a, bon, primary !== null)),
  };
}
