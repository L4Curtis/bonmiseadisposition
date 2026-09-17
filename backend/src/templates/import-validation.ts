export interface TemplateImportItem {
  id: string;
  html: string;
}

/**
 * Filtre les templates importés : id connu, HTML non vide et sous la taille
 * maximale, et présence de {{SIGNER_URL}} pour les templates qui l'exigent.
 * Fonction pure — aucune écriture ; l'appelant décide quoi faire de `valid`
 * (transaction Prisma + invalidation de cache dans template-repository.ts).
 */
export function filterValidImportItems(
  items: TemplateImportItem[],
  knownTemplateIds: string[],
  signerUrlRequiredIds: string[],
  maxHtmlLength: number,
): { valid: TemplateImportItem[]; skipped: number } {
  const valid: TemplateImportItem[] = [];
  let skipped = 0;

  for (const item of items) {
    const known = knownTemplateIds.includes(item.id);
    const htmlOk =
      typeof item.html === 'string' &&
      item.html.trim().length > 0 &&
      item.html.length <= maxHtmlLength;
    // htmlOk évalué AVANT signerOk : si html n'est pas une string (ex. null
    // envoyé par un import corrompu), `item.html.includes(...)` lèverait un
    // TypeError avant même que htmlOk soit pris en compte plus bas.
    const signerOk =
      !known ||
      !htmlOk ||
      !signerUrlRequiredIds.includes(item.id) ||
      item.html.includes('{{SIGNER_URL}}');

    if (!known || !htmlOk || !signerOk) {
      skipped++;
      continue;
    }
    valid.push(item);
  }

  return { valid, skipped };
}
