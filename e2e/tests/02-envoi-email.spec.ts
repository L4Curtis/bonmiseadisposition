import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { sendBySignatureLink } from './helpers/it-cachet';
import { uniqueSuffix } from './helpers/ids';
import { waitForEmailTo, extractSignerPath } from './helpers/mailpit';

/**
 * Test 2 — Création d'un bon pour un collaborateur avec adresse, cachet IT
 * dessiné, envoi par email : le bon passe « Remise à signer » et
 * l'email de demande de signature arrive dans mailpit, adressé au
 * collaborateur, avec un lien /signer/.
 *
 * Couvre directement la régression qui a motivé ce lot : l'envoi (cachet +
 * passage du statut) doit fonctionner depuis l'interface, pas seulement via
 * un repli API.
 */
test('création, cachet IT et envoi par email', async ({ page }) => {
  const suffix = uniqueSuffix();
  const collaborateurEmail = `collab.${suffix}@e2e.local`;

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Camille', lastName: `Envoi${suffix}`, email: collaborateurEmail },
    serialNumbers: [`SN-ENVOI-${suffix}`],
  });

  await expect(page.getByText('Brouillon', { exact: true }).first()).toBeVisible();

  await sendBySignatureLink(page);

  await expect(page.getByText('Remise à signer', { exact: true }).first()).toBeVisible();

  const email = await waitForEmailTo(collaborateurEmail);
  expect(email.to.toLowerCase()).toBe(collaborateurEmail.toLowerCase());
  const signerPath = extractSignerPath(email.html);
  expect(signerPath).toMatch(/^\/signer\//);

  // Le bon reste bien joignable à l'URL de création initiale (aucune
  // redirection inattendue après l'envoi).
  await page.goto(url);
  await expect(page.getByText('Remise à signer', { exact: true }).first()).toBeVisible();
});
