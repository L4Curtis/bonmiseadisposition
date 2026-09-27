import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { clickBonAction, initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { drawSignature } from './helpers/canvas';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 5 — Collaborateur sans adresse, deux équipements : l'un déclaré non
 * restitué, l'autre rendu au guichet (restitution partielle au guichet :
 * seul l'équipement coché est marqué rendu). La signature de cette
 * restitution laisse le bon « Restitution en cours » et déclenche le PV de
 * non-restitution (sous-état « PV de non-restitution à signer ») ; sans
 * adresse, aucun email ne part. Le bon est ensuite clôturé sans signature
 * (IT, motif obligatoire).
 */
test('équipement non rendu, restitution présentielle du second, PV émis, clôture sans signature : bon clôturé', async ({ page }) => {
  const suffix = uniqueSuffix();
  const serialRendu = `SN-RESTITUE-${suffix}`;
  const serialPerdu = `SN-NONRENDU-${suffix}`;

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Restitution', lastName: `NonRendu${suffix}` }, // pas d'email
    serialNumbers: [serialRendu, serialPerdu],
  });

  // Mise à disposition en présentiel jusqu'à l'activation, comme au test 3.
  const signerPath1 = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath1);
  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();

  // ── Déclaration du second équipement comme non restitué ─────────────────
  await clickBonAction(page, 'Déclarer non restitué');
  const nonRenduDialog = page.getByRole('dialog', { name: 'Déclarer des équipements non restitués' });
  await expect(nonRenduDialog).toBeVisible();
  await nonRenduDialog.locator('label').filter({ hasText: serialPerdu }).locator('input[type="checkbox"]').check();
  await nonRenduDialog.getByPlaceholder(/Perte, vol, casse/i).fill('Équipement égaré (test E2E).');
  await drawSignature(page, nonRenduDialog);
  await nonRenduDialog.getByRole('button', { name: /Certifier et déclarer/ }).click();
  await expect(nonRenduDialog).not.toBeVisible();
  await expect(page.getByText('Restitution en cours', { exact: true }).first()).toBeVisible();

  // ── Restitution au guichet du premier équipement, seul coché ─────────────
  const signerPath2 = await initiatePresentiel(page, 'restitution', [serialRendu]);
  await completeSignature(page, signerPath2);
  await page.goto(url);

  // Le bon reste « Restitution en cours » (pas clôturé directement) : un
  // équipement est déclaré non restitué, le PV de non-restitution est émis.
  await expect(page.getByText('Restitution en cours', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Non restitué', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Rendu', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('PV de non-restitution à signer').first()).toBeVisible();
  // PV émis : la version signée par l'IT figure dans les documents (l'email
  // de co-signature, lui, ne peut pas partir faute d'adresse — attendu, tracé,
  // sans bloquer l'émission).
  await expect(page.getByText('PV de non-restitution — signé par l’IT', { exact: true }).first()).toBeVisible();

  // ── Clôture sans signature (IT), motif obligatoire, jusqu'à l'archivage ───
  // Autorisée dès que plus aucun équipement n'est « ni rendu ni déclaré » —
  // aucune attente de délai ou de signature du collaborateur n'est exigée.
  await clickBonAction(page, 'Clôturer sans signature');
  const closeDialog = page.getByRole('dialog', { name: 'Clôturer sans signature ?' });
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByLabel('Motif (obligatoire)').fill('Équipement perdu, PV émis, clôture actée (test E2E).');
  await closeDialog.getByRole('button', { name: 'Clôturer sans signature', exact: true }).click();
  await expect(closeDialog).not.toBeVisible();

  await page.goto(url);
  await expect(page.getByText('Clôturé', { exact: true }).first()).toBeVisible();
});
