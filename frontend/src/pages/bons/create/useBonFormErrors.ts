import { useState } from 'react';
import { runBonValidation, type BonFieldErrors, type BonFormValues } from './lib/validation';

/** Erreurs de saisie du formulaire d'un bon, montrées à partir du premier
 *  envoi refusé puis recalculées à chaque frappe : le récapitulatif et le
 *  message sous un champ disparaissent dès que la saisie est corrigée, sans
 *  attendre un nouvel envoi. Avant le premier envoi, rien n'est montré (on ne
 *  reproche pas un champ que l'utilisateur n'a pas encore eu le temps de
 *  remplir). */
export function useBonFormErrors(values: BonFormValues) {
  const [revealed, setRevealed] = useState(false);
  // Incrémenté à chaque envoi refusé : le récapitulatif s'amène alors à l'écran.
  const [attempt, setAttempt] = useState(0);

  const validation = runBonValidation(values);
  const fieldErrors: BonFieldErrors = revealed && !validation.success ? validation.fieldErrors : {};

  const reveal = () => {
    setRevealed(true);
    setAttempt((n) => n + 1);
  };

  return { fieldErrors, attempt, reveal };
}
