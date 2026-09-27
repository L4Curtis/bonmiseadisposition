import type { InventorySituation } from './types';

/** Couleurs de situation, en classes sémantiques compatibles thème sombre ;
 *  partagées par le tableau (bureau) et les cartes (téléphone). */
export const SITUATION_CLASSES: Record<InventorySituation, string> = {
  en_attente_signature: 'bg-warning/10 text-warning border border-warning/30',
  en_circulation: 'bg-muted text-foreground/80 border border-border',
  en_litige: 'bg-destructive/10 text-destructive border border-destructive/30',
  non_restitue: 'bg-destructive/10 text-destructive border border-destructive/30',
};
