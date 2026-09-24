import { test, expect, adresseClient } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { drawSignatureByTouch } from './helpers/canvas';
import { BASE_URL, STORAGE_STATE_PATH } from './helpers/env';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 12 — Signature présentielle sur téléphone : l'IT lance la signature
 * depuis son poste, puis le collaborateur signe au doigt sur un téléphone
 * (390 × 844, écran tactile). Le canevas n'a ici que des évènements tactiles
 * — c'est leur prise en charge qu'on vérifie : sans trait enregistré, le
 * bouton de signature resterait désactivé.
 *
 * Le téléphone porte la même session IT que le poste (présentiel : le
 * technicien tend son appareil, voir helpers/signer.ts).
 */
test('signature présentielle au doigt sur téléphone : bon actif', async ({ page, browser }) => {
  const suffix = uniqueSuffix();

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Mobile', lastName: `Tactile${suffix}` },
    serialNumbers: [`SN-MOBILE-${suffix}`],
  });
  const signerPath = await initiatePresentiel(page, 'mise_disposition');

  const telephone = await browser.newContext({
    baseURL: BASE_URL,
    storageState: STORAGE_STATE_PATH,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    // Le téléphone du collaborateur : sa propre adresse client (voir fixtures.ts).
    extraHTTPHeaders: { 'CF-Connecting-IP': adresseClient(`telephone-${suffix}`) },
  });
  try {
    const mobile = await telephone.newPage();
    await mobile.goto(signerPath);

    const signer = mobile.getByRole('button', { name: /^Signer le bon de/ });
    await expect(signer).toBeVisible();
    await expect(signer).toBeDisabled();

    await drawSignatureByTouch(mobile);
    await mobile.getByRole('checkbox').tap();
    await expect(signer).toBeEnabled();
    await signer.tap();

    await expect(mobile.getByRole('heading', { name: 'Document signé ✓' })).toBeVisible({ timeout: 10_000 });
  } finally {
    await telephone.close();
  }

  await page.goto(url);
  await expect(page.getByText('Actif', { exact: true }).first()).toBeVisible();
});
