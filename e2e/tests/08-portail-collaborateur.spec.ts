import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { createActiveBon } from './helpers/bon-create';
import { PORTAIL_DISPLAY_NAME } from './helpers/env';
import { openPortailSession, portailSection } from './helpers/portail';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 8 — Portail collaborateur (`/mes-bons`), du point de vue de celui qui
 * signe : il voit son bon actif, l'ouvre, télécharge le PDF — et ne voit ni ne
 * peut ouvrir le bon d'un autre, même en tapant son adresse directement.
 *
 * L'IT prépare les deux bons (session admin du test) ; le collaborateur se
 * connecte dans un contexte séparé avec le compte local de l'amorçage, seul
 * compte collaborateur authentifiable dans cet environnement.
 */
test('portail collaborateur : ses bons, le PDF, et jamais ceux des autres', async ({ page, browser }) => {
  const suffix = uniqueSuffix();

  const sien = await createActiveBon(page, {
    collaborateur: { existing: true, searchQuery: PORTAIL_DISPLAY_NAME, resultName: PORTAIL_DISPLAY_NAME },
    serialNumbers: [`SN-PORTAIL-${suffix}`],
  });
  // Bon actif lui aussi (un brouillon n'apparaîtrait de toute façon dans aucun
  // portail) : c'est l'isolement entre collaborateurs qu'on vérifie.
  const autre = await createActiveBon(page, {
    collaborateur: { firstName: 'Autre', lastName: `Portail${suffix}` },
    serialNumbers: [`SN-AUTRE-${suffix}`],
  });

  const { context, page: portail } = await openPortailSession(browser);
  try {
    // ── Liste : son bon dans « En cours », pas celui de l'autre ─────────────
    const enCours = portailSection(portail, /En cours/);
    await expect(enCours.getByText(sien.reference, { exact: true })).toBeVisible();
    await expect(portail.getByText(autre.reference, { exact: true })).toHaveCount(0);

    // ── Fiche : ouverture depuis la liste, puis téléchargement du PDF ───────
    await enCours.getByText(sien.reference, { exact: true }).click();
    await portail.waitForURL(`**/mes-bons/${sien.bonId}`);
    await expect(portail.getByRole('heading', { level: 1, name: sien.reference })).toBeVisible();
    await expect(portail.getByText('Actif', { exact: true }).first()).toBeVisible();

    const downloadPromise = portail.waitForEvent('download');
    await portail.getByRole('button', { name: 'PDF', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`bon-${sien.reference}.pdf`);
    const pdf = await readFile(await download.path());
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // ── Accès direct à l'adresse du bon d'un autre : refusé ─────────────────
    await portail.goto(`/mes-bons/${autre.bonId}`);
    await expect(portail.getByRole('alert').filter({ hasText: 'Accès refusé à ce bon' })).toBeVisible();
    await expect(portail.getByText(autre.reference)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
