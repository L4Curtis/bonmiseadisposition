/** Numéro de série affichable : un numéro vide ou fait seulement d'espaces
 *  (donnée ancienne) compte comme absent, comme pour le filtre « Sans numéro
 *  de série » et la carte « Avec numéro de série ». */
export function filledSerial(serial: string | null): string | null {
  return serial?.trim() || null;
}
