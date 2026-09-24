import { test as base, expect } from '@playwright/test';

/**
 * Chaque test se présente avec **sa propre adresse client**.
 *
 * Pourquoi : le backend plafonne certaines routes par adresse (le cachet IT à
 * 10 appels par minute, par exemple). En CI, les parcours s'enchaînent en
 * moins d'une minute depuis une seule adresse — ce qu'aucune équipe réelle ne
 * fait, chaque technicien ayant son poste — et finissaient par recevoir des
 * 429 « Trop de requêtes » au milieu d'un parcours. Plutôt que d'assouplir un
 * plafond qui protège la production, les tests modélisent la réalité.
 *
 * Comment : l'en-tête `CF-Connecting-IP` est celui que le nginx du frontend
 * reconnaît comme l'adresse réelle du visiteur (voir frontend/nginx.conf) ; le
 * backend, qui fait confiance au premier proxy, compte alors par adresse.
 * L'adresse est dérivée du titre du test : stable d'un passage à l'autre, et
 * distincte d'un test à l'autre.
 */
export function adresseClient(graine: string): string {
  let h = 2166136261;
  for (const c of graine) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `10.${(h >>> 16) % 250}.${(h >>> 8) % 250}.${(h % 250) + 1}`;
}

export const test = base.extend<{ adresseDuTest: string }>({
  adresseDuTest: [
    async ({ context }, use, testInfo) => {
      const ip = adresseClient(testInfo.titlePath.join(' › '));
      await context.setExtraHTTPHeaders({ 'CF-Connecting-IP': ip });
      await use(ip);
    },
    { auto: true },
  ],
});

export { expect };
