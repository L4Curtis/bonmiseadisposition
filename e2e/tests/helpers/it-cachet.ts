import { expect, type Page } from '@playwright/test';
import { drawSignature } from './canvas';

/** Clique une action de la fiche d'un bon : bouton du panneau « À faire
 *  maintenant », ou entrée du menu « Autres actions ». */
export async function clickBonAction(page: Page, name: string): Promise<void> {
  const button = page.getByRole('button', { name, exact: true });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }
  await page.getByRole('button', { name: /Autres actions/ }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** Trace la signature IT dans la fenêtre déjà ouverte (« Signature IT ») et
 *  valide — commune à la remise, à la restitution et au renvoi d'un lien. */
export async function apposerCachetIt(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog', { name: 'Signature IT' });
  await expect(dialog).toBeVisible();
  await drawSignature(page, dialog);
  await dialog.getByRole('button', { name: 'Signer et continuer' }).click();
  await expect(dialog).not.toBeVisible();
}

/** « Envoyer par email » sur un brouillon : contrôles des numéros, signature
 *  IT, puis envoi du lien. */
export async function sendBySignatureLink(page: Page): Promise<void> {
  await clickBonAction(page, 'Envoyer par email');
  await apposerCachetIt(page);
}

/** Lit le lien `/signer/:token` affiché dans la fenêtre « Signature au
 *  guichet », puis la ferme. */
async function readInPersonLink(page: Page): Promise<string> {
  const dialog = page.getByRole('dialog', { name: 'Signature au guichet' });
  await expect(dialog).toBeVisible();
  const match = (await dialog.innerText()).match(/\/signer\/[A-Za-z0-9_-]+/);
  if (!match) throw new Error('Lien de signature au guichet introuvable dans la fenêtre');
  // La fenêtre a deux « Fermer » (la croix et le bouton du bas) : on prend le
  // bouton du bas, celui qu'utilise le technicien.
  await dialog.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(dialog).toBeHidden();
  return match[0];
}

/**
 * Signature au guichet :
 *  - remise : « Faire signer au guichet », signature IT, lien ;
 *  - restitution : « Restitution au guichet », sélection des équipements
 *    rendus (`returnedSerials`, tous ceux encore chez le collaborateur par
 *    défaut), signature IT, lien.
 * Renvoie le chemin `/signer/:token` affiché dans la fenêtre.
 */
export async function initiatePresentiel(
  page: Page,
  type: 'mise_disposition' | 'restitution',
  returnedSerials?: readonly string[],
): Promise<string> {
  if (type === 'mise_disposition') {
    await clickBonAction(page, 'Faire signer au guichet');
  } else {
    await clickBonAction(page, 'Restitution au guichet');
    const dialog = page.getByRole('dialog', { name: /Restitution au guichet/ });
    await expect(dialog).toBeVisible();
    // Chaque case est nommée par sa ligne (libellé et n° de série) : on coche
    // par n° de série, comme le technicien lit la liste.
    // Sans liste : tous ceux encore chez le collaborateur (cases actives).
    const toCheck = returnedSerials
      ? returnedSerials.map((serial) => dialog.getByRole('checkbox', { name: serial }))
      : await dialog.locator('input[type="checkbox"]:not([disabled])').all();
    for (const box of toCheck) await box.check();
    await dialog.getByRole('button', { name: `Continuer : signature IT (${toCheck.length})` }).click();
  }
  await apposerCachetIt(page);
  return readInPersonLink(page);
}

/** « Faire signer sur place » : réaffiche (ou crée) le lien au guichet du
 *  document en attente (remise, restitution, PV de non-restitution). */
export async function showInPersonLink(page: Page): Promise<string> {
  await clickBonAction(page, 'Faire signer sur place');
  return readInPersonLink(page);
}
