import { test, expect } from './fixtures';
import { createDraftBon } from './helpers/bon-create';
import { CATALOG_ITEM_LABEL, CATALOG_QUERY, FILIALE_NAME } from './helpers/env';
import { selectExistingCollaborateur } from './helpers/collaborateur';
import { uniqueSuffix } from './helpers/ids';

/** Date du jour à Paris (YYYY-MM-DD), celle que le formulaire pré-remplit —
 *  pas `toISOString()`, qui bascule au lendemain UTC en soirée. */
function todayInParis(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

/**
 * Test 11 — Création rapide d'un bon : ce que le formulaire fait pour
 * l'utilisateur, sans rien lui demander.
 *  - la date de mise à disposition est déjà celle du jour ;
 *  - choisir un collaborateur remplit sa filiale ;
 *  - un numéro de série déjà en circulation (ici sur un brouillon, statut qui
 *    compte déjà) est signalé dès la sortie du champ ;
 *  - au clavier, Entrée dans « N° Série » crée la ligne suivante (usage d'un
 *    lecteur de code-barres) SANS soumettre le formulaire, pourtant complet.
 */
test('création rapide : pré-remplissages, n° de série en circulation, Entrée au clavier', async ({ page }) => {
  const suffix = uniqueSuffix();
  const serialEnCirculation = `SN-CIRC-${suffix}`;

  const existant = await createDraftBon(page, {
    collaborateur: { firstName: 'Deja', lastName: `Circulation${suffix}` },
    serialNumbers: [serialEnCirculation],
  });

  await page.goto('/bons/new');
  await expect(page.getByRole('heading', { name: 'Nouveau bon de mise à disposition' })).toBeVisible();

  // ── Date du jour pré-remplie, filiale remplie par le collaborateur ────────
  await expect(page.getByLabel(/Date de mise à disposition/)).toHaveValue(todayInParis());
  await selectExistingCollaborateur(page, 'E2E Seed AvecEmail', 'E2E Seed AvecEmail');
  await expect(page.getByLabel('Filiale *')).toContainText(FILIALE_NAME);

  // ── N° de série déjà en circulation : signalé à la sortie du champ ────────
  await page.getByLabel('Rechercher dans le catalogue').fill(CATALOG_QUERY);
  await page.getByRole('option', { name: CATALOG_ITEM_LABEL }).click();
  const serialInputs = page.getByLabel(/^Numéro de série - ligne \d+$/);
  const lignes = await serialInputs.count();
  const derniere = serialInputs.nth(lignes - 1);

  await derniere.fill(serialEnCirculation);
  await expect(page.getByText(/Déjà en circulation sur/)).toHaveCount(0);
  await derniere.press('Tab');
  await expect(page.getByRole('alert').filter({ hasText: `Déjà en circulation sur ${existant.reference}` })).toBeVisible();

  // ── Entrée dans « N° Série » : nouvelle ligne, formulaire non soumis ──────
  // Numéro libre cette fois : le formulaire est alors complet et valide, une
  // soumission par Entrée créerait réellement un bon.
  await derniere.fill(`SN-RAPIDE-${suffix}`);
  await derniere.press('Enter');

  await expect(serialInputs).toHaveCount(lignes + 1);
  const nouvelle = serialInputs.nth(lignes);
  await expect(nouvelle).toBeFocused();
  await expect(nouvelle).toHaveValue('');
  await expect(page).toHaveURL(/\/bons\/new$/);
  await expect(page.getByRole('heading', { name: 'Nouveau bon de mise à disposition' })).toBeVisible();
});
