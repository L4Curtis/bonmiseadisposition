import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { test as setup, expect, type Page } from '@playwright/test';
import { ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD, ADMIN_NEW_PASSWORD, STORAGE_STATE_PATH } from './helpers/env';

/** Remplit et soumet le formulaire de connexion locale. */
async function submitLocalLogin(page: Page, password: string): Promise<void> {
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
}

/**
 * Attend l'issue de la tentative de connexion qui vient d'être soumise :
 * redirection (succès) ou bandeau « Identifiants incorrects » (échec). Poll
 * court borné (200 ms) plutôt qu'un sélecteur unique : les deux issues sont
 * mutuellement exclusives et aucune des deux n'est du texte qu'on pourrait
 * attendre avec une seule assertion Playwright.
 */
async function loginSucceeded(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!page.url().includes('/login')) return true;
    if (await page.getByText('Identifiants incorrects').isVisible().catch(() => false)) return false;
    await page.waitForTimeout(200);
  }
  return false;
}

/**
 * Test 1 — Connexion locale de l'admin.
 *
 * Ce test est aussi le projet Playwright "setup" (voir playwright.config.ts,
 * dependencies) : tous les autres tests dépendent de lui et réutilisent la
 * session qu'il enregistre, plutôt que de se reconnecter chacun de leur côté.
 *
 * admin@local est provisionné par le backend au démarrage avec
 * mustChangePassword=true (voir backend/src/auth/admin-provisioning.ts) :
 * plutôt que de neutraliser ce changement de mot de passe obligatoire dans
 * l'amorçage, on choisit de le traverser ici — c'est un parcours réel de
 * premier login. Idempotent d'une exécution à l'autre de la suite sur la
 * même compose (le mot de passe n'est changé qu'une fois) : on tente d'abord
 * le nouveau mot de passe (cas du 2e passage, ou d'un simple re-run) et on ne
 * bascule sur le mot de passe initial + le changement obligatoire que s'il
 * est refusé (premier passage sur une base fraîchement amorcée).
 */
setup('connexion locale de l’admin (mot de passe imposé au premier login)', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: /connexion avec un compte local/i }).click();

  await submitLocalLogin(page, ADMIN_NEW_PASSWORD);

  if (!(await loginSucceeded(page))) {
    await submitLocalLogin(page, ADMIN_INITIAL_PASSWORD);
    await page.waitForURL(/\/change-password/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Changement de mot de passe obligatoire' })).toBeVisible();

    // Les 3 champs mot de passe (actuel/nouveau/confirmation) ne portent pas
    // de <label htmlFor> — juste un <label> visuel juxtaposé (voir
    // frontend/src/pages/__tests__/ChangePassword.test.tsx, qui cible ces
    // mêmes champs par ordre d'apparition pour la même raison).
    const passwordInputs = page.locator('input[type="password"]');
    await passwordInputs.nth(0).fill(ADMIN_INITIAL_PASSWORD);
    await passwordInputs.nth(1).fill(ADMIN_NEW_PASSWORD);
    await passwordInputs.nth(2).fill(ADMIN_NEW_PASSWORD);
    await page.getByRole('button', { name: 'Enregistrer le nouveau mot de passe' }).click();

    await expect(page.getByText('Mot de passe modifié')).toBeVisible();
    await page.waitForURL((url) => !url.pathname.startsWith('/change-password'), { timeout: 10_000 });
  }

  // Confirme l'arrivée effective sur l'application authentifiée (pas
  // seulement le changement d'URL).
  await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible({ timeout: 15_000 });

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: STORAGE_STATE_PATH });
});
