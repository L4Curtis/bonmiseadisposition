import { test, expect } from '@playwright/test';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 7 — Régression fa1c97d : l'initiation d'une restitution PAR EMAIL vers
 * un collaborateur sans adresse délivrable doit être refusée (le lien de
 * signature ne peut être envoyé à personne), avec un message qui propose la
 * signature présentielle — même garde que l'envoi (voir bon-send.ts) et la
 * relance (bon-resend.ts), désormais reprise par l'initiation de restitution
 * (bon-restitution.ts, initiateRestitution). Le bon doit rester actif : rien
 * n'est marqué restitué avant que la garde ne s'applique.
 */
test('collaborateur sans adresse : initiation de restitution par email refusée, bon reste actif', async ({ page }) => {
  const suffix = uniqueSuffix();
  const serialNumber = `SN-RESTITSANSADR-${suffix}`;

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'RestitSansAdresse', lastName: `Test${suffix}` }, // pas d'email
    serialNumbers: [serialNumber],
  });

  // Mise à disposition en présentiel (n'exige aucune adresse) jusqu'à
  // l'activation — comme au test 4.
  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);
  await page.goto(url);
  await expect(page.getByText('Actif', { exact: true }).first()).toBeVisible();

  // Initier une restitution par email (bouton « Initier restitution »,
  // sélection par case à cocher) : la garde s'applique dès l'appel API, avant
  // toute écriture — contrairement à l'envoi d'une mise à disposition, aucun
  // cachet IT n'est demandé au préalable ici (voir handleRestitutionConfirm,
  // BonDetail.tsx : le cachet n'est proposé qu'APRÈS le succès de
  // l'initiation).
  await page.getByRole('button', { name: 'Initier restitution', exact: true }).click();
  const restitutionDialog = page.getByRole('dialog', { name: 'Initier la restitution' });
  await expect(restitutionDialog).toBeVisible();
  await restitutionDialog.locator('label').filter({ hasText: serialNumber }).locator('input[type="checkbox"]').check();
  await restitutionDialog.getByRole('button', { name: 'Lancer la restitution (1)' }).click();
  await expect(restitutionDialog).not.toBeVisible();

  // Message affiché par l'interface (toast d'erreur) — même refus que
  // l'envoi, qui propose la signature présentielle. .first() : le toast est
  // doublé par une région aria-live dédiée aux lecteurs d'écran (même texte,
  // deux nœuds DOM) — voir le même correctif au test 4.
  await expect(
    page.getByText("Corrigez l'adresse ou utilisez la signature présentielle.").first(),
  ).toBeVisible();

  // Rien n'a été marqué restitué : le bon reste actif.
  await page.goto(url);
  await expect(page.getByText('Actif', { exact: true }).first()).toBeVisible();
});
