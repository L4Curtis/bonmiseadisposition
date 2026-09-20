import { expect, type Page } from '@playwright/test';
import { drawSignature } from './canvas';

/** Dessine le cachet IT dans la modale déjà ouverte (« Cachet du service
 *  informatique ») et valide — commun à l'envoi par email, au présentiel
 *  (mise à disposition et restitution) et au rattrapage de cachet manquant. */
export async function apposerCachetIt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Cachet du service informatique' });
  await expect(dialog).toBeVisible();
  await drawSignature(page, dialog);
  await dialog.getByRole('button', { name: 'Apposer et continuer' }).click();
  await expect(dialog).not.toBeVisible();
}

/** Clique « Envoyer » sur un bon brouillon, appose le cachet IT requis avant
 *  l'envoi de l'email de signature (régression historique : le cachet était
 *  refusé sur un brouillon — voir le contexte de ce lot). */
export async function sendBySignatureLink(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await apposerCachetIt(page);
}

/**
 * Déclenche une signature présentielle (mise à disposition ou restitution) :
 * bouton dédié, cachet IT, puis lecture du lien `/signer/:token` affiché dans
 * la modale « Signature présentielle » (texte visible, pas de sélecteur
 * technique — le composant n'expose le lien que sous forme de texte).
 */
export async function initiatePresentiel(
  page: Page,
  type: 'mise_disposition' | 'restitution',
): Promise<string> {
  const buttonName = type === 'mise_disposition' ? 'Présentiel' : 'Restitution présentielle';
  await page.getByRole('button', { name: buttonName, exact: true }).click();
  await apposerCachetIt(page);

  const dialog = page.getByRole('dialog', { name: 'Signature présentielle' });
  await expect(dialog).toBeVisible();
  const content = await dialog.innerText();
  const match = content.match(/\/signer\/[A-Za-z0-9_-]+/);
  if (!match) throw new Error('Lien de signature présentielle introuvable dans la modale');

  await dialog.getByRole('button', { name: 'Fermer', exact: true }).click();
  return match[0];
}
