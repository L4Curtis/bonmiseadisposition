import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { apposerCachetIt, initiatePresentiel } from './helpers/it-cachet';
import { completeSignature } from './helpers/signer';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 4 — Collaborateur SANS adresse email : l'envoi par email doit être
 * refusé avec un message qui propose la signature présentielle, et le
 * présentiel doit fonctionner malgré tout jusqu'à l'activation du bon.
 */
test('collaborateur sans adresse : envoi refusé, présentiel fonctionnel', async ({ page }) => {
  const suffix = uniqueSuffix();

  const { url } = await createDraftBon(page, {
    collaborateur: { firstName: 'Sans', lastName: `Adresse${suffix}` }, // pas d'email
    serialNumbers: [`SN-SANSADRESSE-${suffix}`],
  });

  await expect(
    page.getByText(/Adresse email du collaborateur non valide/i),
  ).toBeVisible();

  // Tentative d'envoi par email : le cachet est déjà exigé par l'interface
  // avant de découvrir le refus côté serveur (voir handleSend, BonDetail.tsx)
  // — c'est le comportement réel de l'application, pas un raccourci de test.
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await apposerCachetIt(page);

  // .first() : le toast d'erreur est doublé par une région aria-live dédiée
  // aux lecteurs d'écran (même texte, deux nœuds DOM) — un match strict sur
  // le texte échoue par intermittence selon l'instant exact de l'assertion.
  await expect(
    page.getByText("Corrigez l'adresse ou utilisez la signature présentielle.").first(),
  ).toBeVisible();
  await expect(page.getByText('Brouillon', { exact: true }).first()).toBeVisible();

  // Referme la modale de rattrapage (« Cachet enregistré — action
  // interrompue ») sans relancer l'envoi — scoping obligatoire : le bouton
  // « Annuler » du bandeau d'annulation du bon (toujours visible sur un
  // brouillon) porte le même libellé.
  const rattrapage = page.getByRole('dialog', { name: 'Cachet enregistré — action interrompue' });
  await expect(rattrapage).toBeVisible();
  await rattrapage.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(rattrapage).not.toBeVisible();

  // Le présentiel, lui, fonctionne : jusqu'à l'activation du bon.
  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);

  await page.goto(url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();
});
