import { test, expect } from './fixtures';
import { createActiveBon } from './helpers/bon-create';
import { PORTAIL_DISPLAY_NAME, PORTAIL_EMAIL } from './helpers/env';
import { waitForEmailTo } from './helpers/mailpit';
import { openPortailSession, portailSection } from './helpers/portail';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 9 — Contestation, aller et retour : le collaborateur conteste la
 * remise de son bon depuis sa fiche et y revoit son motif ; l'IT la voit
 * (badge du menu, Contestations « À traiter ») et la juge « Non retenue » avec
 * une réponse obligatoire ; le collaborateur retrouve son bon en cours, lit
 * la décision et la réponse sur la fiche, et reçoit l'email de réponse.
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
    await portailSection(portail, /Bons en cours/).getByText(bon.reference, { exact: true }).click();
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
    // Bloc « Ma contestation » : le motif et l'état réel du traitement.
    const maContestation = portail.getByRole('region', { name: 'Ma contestation' });
    await expect(maContestation).toContainText(motif);
    await expect(maContestation).toContainText('pas encore prise en charge');

    await portail.goto('/mes-equipements');
    await expect(portailSection(portail, /Contestés/).getByText(bon.reference, { exact: true })).toBeVisible();

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
    await expect(ligne).toContainText('Nouvelle');
    await expect(ligne).toContainText(motif);
    await ligne.getByRole('button', { name: 'Trancher' }).click();

    const resolveDialog = page.getByRole('dialog', { name: 'Trancher la contestation' });
    await expect(resolveDialog).toBeVisible();
    await resolveDialog.getByRole('radio', { name: 'Non retenue' }).check();
    // « Non retenue » sans réponse au collaborateur : impossible (R-052).
    const enregistrer = resolveDialog.getByRole('button', { name: 'Enregistrer la décision' });
    await expect(enregistrer).toBeDisabled();
    await resolveDialog.getByLabel('Réponse au collaborateur (obligatoire)').fill(reponse);
    await enregistrer.click();
    await expect(resolveDialog).not.toBeVisible();
    // La liste s'ouvre sur « À traiter » : celle-ci en sort, et se retrouve
    // sous « Non retenues », « tranchée par » la personne connectée.
    await expect(ligne).toHaveCount(0);
    await page.getByRole('button', { name: 'Non retenues', exact: true }).click();
    await expect(ligne).toContainText('Non retenue — tranchée par');

    // ── Collaborateur : le bon est de nouveau en cours, la décision est lisible ─
    await portail.goto('/mes-equipements');
    await expect(portailSection(portail, /Bons en cours/).getByText(bon.reference, { exact: true })).toBeVisible();
    await expect(portailSection(portail, /Contestés/).getByText(bon.reference, { exact: true })).toHaveCount(0);
    await portail.goto(`/mes-bons/${bon.bonId}`);
    await expect(portail.getByRole('region', { name: 'Ma contestation' })).toContainText('Non retenue le');
    await expect(portail.getByRole('region', { name: 'Ma contestation' })).toContainText(reponse);

    // ── Email de réponse, avec le message de l'IT ───────────────────────────
    const email = await waitForEmailTo(PORTAIL_EMAIL, {
      subjectContains: [bon.reference, 'Réponse à votre contestation'],
    });
    expect(email.html).toContain(reponse);
  } finally {
    await context.close();
  }
});
