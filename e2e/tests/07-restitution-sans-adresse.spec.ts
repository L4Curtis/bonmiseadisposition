import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 7 — Collaborateur sans adresse délivrable : la restitution par email
 * est proposée grisée (rien n'est marqué rendu), la restitution au guichet
 * reste possible. Même règle unique que l'envoi (canSendLink).
 */
test('collaborateur sans adresse : restitution par email grisée, bon reste en cours', async ({ page }) => {
  const suffix = uniqueSuffix();
  const serialNumber = `SN-RESTITSANSADR-${suffix}`;

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'RestitSansAdresse', lastName: `Test${suffix}` }, // pas d'email
    serialNumbers: [serialNumber],
  });

  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);
  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();

  await expect(page.getByRole('button', { name: 'Restitution par email', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Restitution au guichet', exact: true })).toBeEnabled();

  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();
});
