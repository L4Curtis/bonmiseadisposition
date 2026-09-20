import { test, expect } from '@playwright/test';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 6 — Inventaire, vue « Par collaborateur » : un collaborateur avec un
 * bon actif à deux équipements apparaît dans le regroupement avec le bon
 * nombre d'équipements.
 */
test('inventaire « Par collaborateur » : bon nombre d’équipements', async ({ page }) => {
  const suffix = uniqueSuffix();
  const firstName = 'Karim';
  const lastName = `Inventaire${suffix}`;
  const displayName = `${firstName} ${lastName.toUpperCase()}`;

  await createDraftBon(page, {
    collaborateur: { firstName, lastName, email: `inventaire.${suffix}@e2e.local` },
    serialNumbers: [`SN-INV-A-${suffix}`, `SN-INV-B-${suffix}`],
  });

  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);

  await page.goto('/inventaire');
  await page.getByRole('tab', { name: 'Par collaborateur' }).click();
  await page.getByLabel('Rechercher un équipement').fill(lastName);

  const row = page.getByRole('row', { name: new RegExp(displayName) });
  await expect(row).toBeVisible();
  await expect(row.getByRole('cell').nth(2)).toHaveText('2');
});
