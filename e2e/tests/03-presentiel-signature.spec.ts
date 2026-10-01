import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 3 — Même parcours qu'en envoi email, mais en présentiel jusqu'à la
 * signature (canevas + case « Lu et approuvé ») : le bon passe actif et le
 * PDF de mise à disposition est disponible sur la fiche.
 */
test('présentiel jusqu’à la signature : bon actif et PDF disponible', async ({ page }) => {
  const suffix = uniqueSuffix();

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Julien', lastName: `Presentiel${suffix}`, email: `presentiel.${suffix}@e2e.local` },
    serialNumbers: [`SN-PRESENTIEL-${suffix}`],
  });

  const signerPath = await initiatePresentiel(page, 'mise_disposition');

  await completeSignature(page, signerPath);

  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();
  // Deux documents attendus : le cachet IT (posé avant l'envoi) et la
  // signature du collaborateur (recueillie en présentiel, voir signing.ts).
  await expect(page.getByText(/Documents PDF \(2\)/)).toBeVisible();
  // Titres de la liste « Documents PDF », au vocabulaire de la fiche (« remise »,
  // « signature IT ») ; chacun est en vigueur.
  const documents = page.getByRole('list').filter({ hasText: 'Remise — signature IT' });
  await expect(documents.getByText('Remise — signature IT', { exact: true })).toBeVisible();
  await expect(documents.getByText('Remise — signée par le collaborateur', { exact: true })).toBeVisible();
  await expect(documents.getByText(/En vigueur/)).toHaveCount(2);
});
