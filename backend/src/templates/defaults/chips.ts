import { HeaderChip } from '../email-layout';

// Chips de statut affichés dans l'en-tête de marque (fond blanc translucide
// par-dessus l'aplat rouge Livio ; le texte du chip porte le sens)
export const CHIP_ACTION: HeaderChip = { text: 'À signer', bg: 'rgba(255,255,255,0.16)' };
export const CHIP_SUCCESS: HeaderChip = { text: 'Signé', bg: 'rgba(255,255,255,0.18)' };
export const CHIP_DANGER = (text: string): HeaderChip => ({ text, bg: 'rgba(255,255,255,0.18)' });
export const CHIP_WARNING = (text: string): HeaderChip => ({ text, bg: 'rgba(255,255,255,0.18)' });
