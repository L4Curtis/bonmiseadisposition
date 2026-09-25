import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { drawSignature } from './helpers/canvas';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 5 — Restitution partielle (un équipement rendu sur deux) et
 * déclaration du second comme non rendu : PV de clôture émis, puis clôture
 * sans signature jusqu'à l'archivage — entièrement en présentiel pour les
 * deux signatures collaborateur (mise à disposition ET restitution).
 *
 * Pourquoi cet ordre (déclaration du second équipement AVANT la restitution
 * du premier) : « Initier restitution » (sélection par cases à cocher, voir
 * RestitutionModal) crée une signature à DISTANCE (isInPerson: false), qui
 * exige une adresse délivrable (bon-restitution.ts, isDeliverableEmail) — ce
 * test crée son propre collaborateur SANS adresse (comme les autres tests,
 * voir helpers/collaborateur.ts) : cette voie lui est donc fermée.
 * « Restitution présentielle » (bouton dédié, POST /bons/:id/initiate-
 * inperson type=restitution) n'exige aucune adresse — mais restitue TOUS les
 * équipements encore en attente en une seule fois, sans sélection possible
 * (voir bon-send.ts, initiateInPersonSignature). Pour obtenir malgré tout
 * UNE restitution partielle, le second équipement est donc déclaré non rendu
 * AVANT la restitution présentielle : il ne reste alors plus qu'un seul
 * équipement en attente, et c'est bien lui seul que la restitution
 * présentielle traite.
 *
 * Cet ordre a révélé un défaut d'application, corrigé pendant ce lot (hors
 * périmètre e2e/ — voir backend/src/signature/status-transition.ts et
 * signing.ts) : la signature de la restitution présentielle laisse
 * maintenant le bon en `partially_returned` (au lieu de l'archiver
 * directement) dès qu'un équipement est déjà déclaré non rendu, ce qui
 * déclenche l'émission du PV de clôture — le document qui acte la perte.
 * L'email du PV ne peut pas partir (collaborateur sans adresse) : c'est
 * attendu et tracé dans l'historique des emails, sans bloquer la suite. Le
 * bon est ensuite clôturé sans signature (IT), motif obligatoire, jusqu'à
 * l'archivage.
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

  // ── Déclaration du second équipement comme non rendu (AVANT la
  //    restitution — voir le commentaire d'en-tête pour le pourquoi) ────────
  await page.getByRole('button', { name: 'Non rendu', exact: true }).click();
  const nonRenduDialog = page.getByRole('dialog', { name: 'Déclarer des équipements non rendus' });
  await expect(nonRenduDialog).toBeVisible();
  await nonRenduDialog.locator('label').filter({ hasText: serialPerdu }).locator('input[type="checkbox"]').check();
  await nonRenduDialog.getByPlaceholder(/Perte, vol, casse/i).fill('Équipement égaré (test E2E).');
  await drawSignature(page, nonRenduDialog);
  await nonRenduDialog.getByRole('button', { name: /Certifier et déclarer/ }).click();
  await expect(nonRenduDialog).not.toBeVisible();
  await expect(page.getByText('Restitution en cours', { exact: true }).first()).toBeVisible();

  // ── Restitution présentielle du seul équipement encore en attente ─────────
  const signerPath2 = await initiatePresentiel(page, 'restitution');
  await completeSignature(page, signerPath2);
  await page.goto(url);

  // Le bon reste en restitution partielle (pas archivé directement) : un
  // équipement est déjà déclaré non rendu, le PV de clôture doit d'abord
  // être émis — voir le commentaire d'en-tête.
  await expect(page.getByText('Restitution en cours', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Non rendu', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Rendu', { exact: true }).first()).toBeVisible();
  // PV émis : document disponible (l'email de co-signature, lui, ne peut pas
  // partir faute d'adresse — attendu, tracé, sans bloquer l'émission).
  await expect(page.getByText('PV — Équipements non restitués')).toBeVisible();

  // ── Clôture sans signature (IT), motif obligatoire, jusqu'à l'archivage ───
  // Autorisée dès que plus aucun équipement n'est « ni rendu ni déclaré » —
  // aucune attente de délai ou de signature du collaborateur n'est exigée.
  await page.getByRole('button', { name: 'Clôturer sans signature', exact: true }).click();
  const closeDialog = page.getByRole('dialog', { name: 'Clôturer sans signature ?' });
  await expect(closeDialog).toBeVisible();
  await closeDialog.getByLabel('Motif (obligatoire)').fill('Équipement perdu, PV émis, clôture actée (test E2E).');
  await closeDialog.getByRole('button', { name: 'Clôturer sans signature', exact: true }).click();
  await expect(closeDialog).not.toBeVisible();

  await page.goto(url);
  await expect(page.getByText('Clôturé', { exact: true }).first()).toBeVisible();
});
