import { expect, type Browser, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { adresseClient } from '../fixtures';
import { BASE_URL, PORTAIL_EMAIL, PORTAIL_PASSWORD } from './env';

export interface PortailSession {
  context: BrowserContext;
  page: Page;
}

/**
 * Ouvre une session collaborateur dans un contexte de navigateur SÉPARÉ de
 * celui du test (qui porte la session admin enregistrée par le projet
 * "setup") : cookies vides, connexion locale avec le compte collaborateur de
 * l'amorçage. Les deux sessions coexistent ainsi dans un même test — l'IT
 * agit d'un côté, le collaborateur constate de l'autre.
 *
 * À refermer par l'appelant (`context.close()`), idéalement dans un finally.
 */
export async function openPortailSession(browser: Browser): Promise<PortailSession> {
  // Le collaborateur est sur son propre poste : sa propre adresse client
  // (voir fixtures.ts — plafonds par adresse du backend).
  const context = await browser.newContext({
    baseURL: BASE_URL,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: { 'CF-Connecting-IP': adresseClient(`portail-${Date.now()}-${Math.random()}`) },
  });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByRole('button', { name: /connexion avec un compte local/i }).click();
  await page.getByLabel('Email').fill(PORTAIL_EMAIL);
  await page.getByLabel('Mot de passe').fill(PORTAIL_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();

  // Un collaborateur n'a que la vue « Collaborateur » : l'accueil le mène
  // directement à son portail.
  await page.waitForURL(/\/mes-bons$/);
  await expect(page.getByRole('heading', { name: 'Mes équipements' })).toBeVisible();
  return { context, page };
}

/**
 * Section du portail (« En cours », « En contestation »…) repérée par son
 * titre : les bons y sont rangés par statut, et c'est précisément ce
 * rangement qu'on vérifie.
 */
export function portailSection(page: Page, title: RegExp): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: title }) });
}
