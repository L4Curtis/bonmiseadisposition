import { expect, type Page } from '@playwright/test';
import { drawSignature } from './canvas';

/**
 * Ouvre un lien `/signer/<token>` dans la page courante (déjà authentifiée en
 * IT — un technicien/admin qui ouvre ce lien signe pour le compte du
 * collaborateur : c'est exactement le scénario présentiel, et celui d'une
 * co-signature de procès-verbal recueillie sur place) et complète la
 * signature : dessin sur le canevas, case « Lu et approuvé », bouton Signer.
 */
export async function completeSignature(
  page: Page,
  signerPath: string,
  options?: { isPvCloture?: boolean },
): Promise<void> {
  await page.goto(signerPath);

  const submitName = options?.isPvCloture ? /^Signer le procès-verbal/ : /^Signer le bon de/;
  const submit = page.getByRole('button', { name: submitName });
  await expect(submit).toBeVisible();

  await drawSignature(page);
  await page.getByRole('checkbox').check();
  await submit.click();

  await expect(page.getByRole('heading', { name: 'Document signé ✓' })).toBeVisible({ timeout: 10_000 });
}
