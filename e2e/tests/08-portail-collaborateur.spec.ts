import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures';
import { createActiveBon } from './helpers/bon-create';
import { PORTAIL_DISPLAY_NAME } from './helpers/env';
import { openPortailSession, portailSection } from './helpers/portail';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 8 — Portail collaborateur (`/mes-equipements`), du point de vue de celui qui
 * signe : il voit son bon en cours et ses équipements (n° de série), ouvre le
 * bon, ouvre le document signé dans le navigateur — et ne voit ni ne
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
    // ── Liste : son bon dans « Bons en cours », son équipement dans « Chez
    // vous » avec son n° de série ; rien de l'autre ────────────────────────
    const enCours = portailSection(portail, /Bons en cours/);
    await expect(enCours.getByText(sien.reference, { exact: true })).toBeVisible();
    await expect(portailSection(portail, /Chez vous/).getByText(`SN-PORTAIL-${suffix}`, { exact: true })).toBeVisible();
    await expect(portail.getByText(autre.reference, { exact: true })).toHaveCount(0);

    // ── Fiche : ouverture depuis la liste, puis le document signé, ouvert
    // dans le navigateur (lecteur du téléphone) plutôt que téléchargé ──────
    await enCours.getByText(sien.reference, { exact: true }).click();
    await portail.waitForURL(`**/mes-bons/${sien.bonId}`);
    await expect(portail.getByRole('heading', { level: 1, name: sien.reference })).toBeVisible();
    await expect(portail.getByText(/^En cours ·/).first()).toBeVisible();

    // L'onglet s'ouvre au clic, puis reçoit le document. Chromium sans
    // interface n'a pas de lecteur PDF : il remet le document de l'onglet sous
    // forme de téléchargement, ce qui permet d'en lire le contenu réel (le
    // corps de la réponse, lu par l'application en Blob, n'est pas relisible
    // côté Playwright). L'écoute du téléchargement démarre dès l'ouverture de
    // l'onglet (avant la fin du chargement du PDF) : attachée après coup, elle
    // manquerait un document remis très vite.
    const [{ onglet, telechargement }, pdf] = await Promise.all([
      portail.waitForEvent('popup').then((p) => ({ onglet: p, telechargement: p.waitForEvent('download') })),
      portail.waitForResponse((r) => r.url().includes(`/api/bons/${sien.bonId}/pdf`)),
      portail.getByRole('button', { name: 'Ouvrir Bon de mise à disposition signé' }).click(),
    ]);
    expect(pdf.ok()).toBe(true);
    expect(pdf.headers()['content-type']).toBe('application/pdf');
    const document = await telechargement;
    const contenu = await readFile(await document.path());
    expect(contenu.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    await onglet.close();

    // ── Accès direct à l'adresse du bon d'un autre : refusé ─────────────────
    await portail.goto(`/mes-bons/${autre.bonId}`);
    await expect(portail.getByRole('alert').filter({ hasText: 'Accès refusé à ce bon' })).toBeVisible();
    await expect(portail.getByText(autre.reference)).toHaveCount(0);
  } finally {
    await context.close();
  }
});
