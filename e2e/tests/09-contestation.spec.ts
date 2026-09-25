import { test, expect } from './fixtures';
import { createActiveBon } from './helpers/bon-create';
import { PORTAIL_DISPLAY_NAME, PORTAIL_EMAIL } from './helpers/env';
import { waitForEmailTo } from './helpers/mailpit';
import { openPortailSession, portailSection } from './helpers/portail';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 9 — Contestation, aller et retour : le collaborateur conteste son bon
 * depuis le portail ; l'IT la voit (badge du menu, Admin → Contestations) et
 * la rejette avec une réponse ; le collaborateur retrouve son bon actif, et
 * reçoit l'email de réponse qui reprend le message de l'IT.
 *
 * Rejet plutôt qu'acceptation : sans « Corriger et re-signer », les deux
 * issues rendent au bon son statut antérieur, mais le rejet est le cas où le
 * collaborateur n'a, dans l'application, que cet email pour comprendre ce qui
 * a été décidé.
 */
test('contestation : le collaborateur conteste, l’IT tranche, le collaborateur voit l’issue', async ({ page, browser }) => {
  const suffix = uniqueSuffix();
  const motif = `Il manque la sacoche livrée avec le portable (E2E ${suffix}).`;
  const reponse = `Sacoche jamais prévue sur ce bon, vérifié avec le stock (E2E ${suffix}).`;

  const bon = await createActiveBon(page, {
    collaborateur: { existing: true, searchQuery: PORTAIL_DISPLAY_NAME, resultName: PORTAIL_DISPLAY_NAME },
    serialNumbers: [`SN-CONTEST-${suffix}`],
  });

  const { context, page: portail } = await openPortailSession(browser);
  try {
    // ── Collaborateur : contestation depuis la fiche de son bon ─────────────
    await portailSection(portail, /En cours/).getByText(bon.reference, { exact: true }).click();
    await portail.waitForURL(`**/mes-bons/${bon.bonId}`);
    // L'URL change avant que la fiche ne remplace la liste : tant que celle-ci
    // est affichée, chaque bon actif y porte son propre bouton « Contester »
    // (le compte de l'amorçage en accumule d'une exécution à l'autre). Attendre
    // le titre de la fiche garantit de viser le bon bouton.
    await expect(portail.getByRole('heading', { level: 1, name: bon.reference })).toBeVisible();
    await portail.getByRole('button', { name: 'Contester' }).click();

    const contestDialog = portail.getByRole('dialog', { name: `Contester le bon ${bon.reference}` });
    await expect(contestDialog).toBeVisible();
    await contestDialog.getByLabel('Motif de contestation').fill(motif);
    await contestDialog.getByRole('button', { name: 'Envoyer la contestation' }).click();
    await expect(contestDialog).not.toBeVisible();
    await expect(portail.getByText('Contesté', { exact: true }).first()).toBeVisible();

    await portail.goto('/mes-bons');
    await expect(portailSection(portail, /En contestation/).getByText(bon.reference, { exact: true })).toBeVisible();

    // ── IT : badge du menu, puis traitement depuis Admin → Contestations ────
    // Rechargement complet : le badge n'interroge l'API qu'au montage, puis
    // au plus toutes les 30 s (voir use-open-contestations-count).
    await page.goto('/dashboard');
    const menuContestations = page
      .getByRole('navigation', { name: 'Navigation principale' })
      .getByRole('link', { name: /^Contestations\s*\d+\+?$/ });
    await expect(menuContestations).toBeVisible();
    await menuContestations.click();
    await page.waitForURL('**/admin/contestations');

    const ligne = page.getByRole('row').filter({ hasText: bon.reference });
    await expect(ligne).toContainText('Ouverte');
    await expect(ligne).toContainText(motif);
    await ligne.getByRole('button', { name: 'Traiter' }).click();

    const resolveDialog = page.getByRole('dialog', { name: 'Traiter la contestation' });
    await expect(resolveDialog).toBeVisible();
    await resolveDialog.getByRole('button', { name: 'Rejeter', exact: true }).click();
    await resolveDialog.getByLabel('Réponse au collaborateur (optionnel)').fill(reponse);
    await resolveDialog.getByRole('button', { name: 'Rejeter la contestation' }).click();
    await expect(resolveDialog).not.toBeVisible();
    // La liste n'affiche par défaut que les contestations ouvertes : celle-ci
    // en sort, et se retrouve sous le filtre « Non retenue ».
    await expect(ligne).toHaveCount(0);
    await page.getByRole('button', { name: 'Non retenue', exact: true }).click();
    await expect(ligne).toContainText('Non retenue');
    await expect(ligne).toContainText('Traité par');

    // ── Collaborateur : le bon a quitté la contestation, il est de nouveau actif ─
    await portail.goto('/mes-bons');
    await expect(portailSection(portail, /En cours/).getByText(bon.reference, { exact: true })).toBeVisible();
    await expect(portailSection(portail, /En contestation/).getByText(bon.reference, { exact: true })).toHaveCount(0);

    // ── Email de réponse, avec le message de l'IT ───────────────────────────
    const email = await waitForEmailTo(PORTAIL_EMAIL, {
      subjectContains: [bon.reference, 'Réponse à votre contestation'],
    });
    expect(email.html).toContain(reponse);
  } finally {
    await context.close();
  }
});
