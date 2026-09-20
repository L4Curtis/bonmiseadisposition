import type { Locator, Page } from '@playwright/test';

/**
 * Dessine un trait de signature sur le premier `<canvas>` trouvé dans `scope`
 * — tous les canevas de signature de l'application (cachet IT, restitution,
 * non-rendu, signature collaborateur) partagent le même contrat
 * mousedown/mousemove/mouseup (voir `useSignatureCanvas`), donc la même
 * séquence de souris fonctionne partout.
 */
export async function drawSignature(page: Page, scope: Locator | Page = page): Promise<void> {
  const canvas = scope.locator('canvas').first();
  await canvas.waitFor({ state: 'visible' });
  // `page.mouse` dessine à des coordonnées de viewport absolues et ne fait
  // AUCUN scroll automatique (contrairement à `.click()`) : sur la page de
  // signature (canevas plus bas que dans les modales de cachet), le trait
  // partait dans le vide hors viewport et n'était jamais enregistré.
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Zone de signature (canvas) introuvable ou non visible');

  const y = box.y + box.height / 2;
  const startX = box.x + box.width * 0.15;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(startX + i * (box.width * 0.06), y + Math.sin(i) * (box.height * 0.15), { steps: 3 });
  }
  await page.mouse.up();
}
