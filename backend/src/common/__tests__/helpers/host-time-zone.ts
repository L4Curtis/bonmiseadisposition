import { afterAll, beforeAll } from 'vitest';

/**
 * Fait tourner les tests d'un bloc `describe` comme sur une machine réglée sur
 * `timeZone`. Le conteneur de production tourne en UTC alors que le poste de
 * développement est à l'heure de Paris : un calcul qui dépend en douce du
 * fuseau de la machine (`toLocaleDateString` sans `timeZone`, `getDate()`…)
 * passe sur le poste et se trompe en production. Ces tests le révèlent.
 *
 * Node relit `process.env.TZ` à chaque affectation. Chaque fichier de test
 * tourne dans son propre processus (Vitest, pool `forks`) : le changement ne
 * déborde pas sur les autres fichiers, et il est tout de même annulé après le
 * bloc.
 */
export function useHostTimeZone(timeZone: string): void {
  let previousEnv: string | undefined;
  let previousZone = '';

  beforeAll(() => {
    previousEnv = process.env.TZ;
    previousZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = timeZone;
    const applied = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Garde-fou : si le fuseau n'a pas pu être changé, le test ne prouverait
    // plus rien. Mieux vaut échouer franchement.
    if (applied !== timeZone) {
      throw new Error(`Impossible de simuler le fuseau ${timeZone} (fuseau obtenu : ${applied})`);
    }
  });

  afterAll(() => {
    // Supprimer TZ ne suffit pas : Node garderait le dernier fuseau lu. On
    // remet d'abord le fuseau d'origine, puis la variable telle qu'elle était.
    process.env.TZ = previousZone;
    if (previousEnv === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousEnv;
    }
  });
}
