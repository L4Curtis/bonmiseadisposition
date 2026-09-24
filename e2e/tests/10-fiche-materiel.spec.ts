import { test, expect } from './fixtures';
import { createActiveBon } from './helpers/bon-create';
import { uniqueSuffix } from './helpers/ids';

/**
 * Test 10 — Fiche matériel (`/materiel/:reference`) : depuis l'inventaire, le
 * numéro de série d'un équipement prêté ouvre sa fiche, qui nomme le détenteur
 * actuel ; le numéro d'inventaire du même équipement mène à la même fiche.
 */
test('fiche matériel : depuis l’inventaire, par n° de série puis par n° d’inventaire', async ({ page }) => {
  const suffix = uniqueSuffix();
  const firstName = 'Fiche';
  const lastName = `Materiel${suffix}`;
  // Nom affiché d'un collaborateur créé à la main : prénom + NOM en capitales
  // (même convention qu'au test 6).
  const displayName = `${firstName} ${lastName.toUpperCase()}`;
  const serial = `SN-FICHE-${suffix}`;
  const inventaire = `INV-FICHE-${suffix}`;

  await createActiveBon(page, {
    collaborateur: { firstName, lastName },
    serialNumbers: [serial],
    inventoryNumbers: [inventaire],
  });

  const ouvrirDepuisInventaire = async (numero: string): Promise<void> => {
    await page.goto('/inventaire');
    await page.getByLabel('Rechercher un équipement').fill(serial);
    // Attendre que la recherche (différée de 300 ms) soit appliquée avant de
    // cliquer : sinon son écriture dans l'URL, survenue pendant le chargement
    // de la fiche, ramène à l'inventaire.
    await expect(page).toHaveURL(new RegExp(`[?&]search=${serial}`));
    await page.getByRole('link', { name: `Historique du matériel ${numero}` }).click();
    await page.waitForURL(`**/materiel/${encodeURIComponent(numero)}`);
    await expect(page.getByRole('heading', { level: 1, name: numero })).toBeVisible();
    await expect(page.getByText(`Chez ${displayName} depuis le`)).toBeVisible();
  };

  await ouvrirDepuisInventaire(serial);
  await ouvrirDepuisInventaire(inventaire);
});
