import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 4 — Collaborateur SANS adresse email : la fiche le dit (« Signature au
 * guichet uniquement »), l'envoi par email est proposé grisé, AVANT toute
 * signature IT (règle unique canSendLink), et la remise au guichet va
 * jusqu'à l'activation du bon.
 */
test('collaborateur sans adresse : envoi grisé avant toute signature, guichet fonctionnel', async ({ page }) => {
  const suffix = uniqueSuffix();

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Sans', lastName: `Adresse${suffix}` }, // pas d'email
    serialNumbers: [`SN-SANSADRESSE-${suffix}`],
  });

  await expect(page.getByText('Signature au guichet uniquement')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Envoyer par email', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: 'Signature IT' })).not.toBeVisible();

  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);

  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();
});
