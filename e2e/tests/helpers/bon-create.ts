import { expect, type Page } from '@playwright/test';
import { CATALOG_ITEM_LABEL, CATALOG_QUERY, FILIALE_NAME } from './env';
import { todayISO } from './ids';
import { createManualCollaborateur, selectExistingCollaborateur, type NouveauCollaborateur } from './collaborateur';
import { initiatePresentiel } from './it-cachet';
import { completeSignature } from './signer';

export interface ExistingCollaborateur {
  existing: true;
  searchQuery: string;
  resultName: string;
}

export interface DraftBonParams {
  collaborateur: NouveauCollaborateur | ExistingCollaborateur;
  /** Un numéro de série par équipement à ajouter (le même article de
   *  catalogue fourni par l'amorçage E2E est utilisé pour chacun). */
  serialNumbers: string[];
  /** Numéros d'inventaire facultatifs, alignés sur `serialNumbers` (même
   *  index = même ligne) ; une entrée absente laisse le champ vide. */
  inventoryNumbers?: string[];
  /** YYYY-MM-DD — par défaut aujourd'hui. */
  dateMiseDisposition?: string;
}

export interface DraftBon {
  bonId: string;
  url: string;
  /** Référence métier affichée en titre de la fiche (ex. BON-2026-0001). */
  reference: string;
}

/**
 * Remplit et soumet le formulaire de création de bon (`/bons/new`) : filiale
 * (seule option fournie par l'amorçage E2E), collaborateur (créé à la volée,
 * voir `createManualCollaborateur`), date de mise à disposition, un ou
 * plusieurs équipements pris dans le catalogue avec leur numéro de série.
 * Retourne l'id du bon créé, déduit de la redirection post-création vers
 * `/bons/:id`, et sa référence, lue dans le titre de la fiche.
 */
export async function createDraftBon(page: Page, params: DraftBonParams): Promise<DraftBon> {
  await page.goto('/bons/new');
  await expect(page.getByRole('heading', { name: 'Nouveau bon de mise à disposition' })).toBeVisible();

  await page.getByLabel('Filiale *').click();
  await page.getByRole('option', { name: FILIALE_NAME }).click();

  if ('existing' in params.collaborateur) {
    await selectExistingCollaborateur(page, params.collaborateur.searchQuery, params.collaborateur.resultName);
  } else {
    await createManualCollaborateur(page, params.collaborateur);
  }

  await page.getByLabel(/Date de mise à disposition/).fill(params.dateMiseDisposition ?? todayISO());

  // Le formulaire démarre avec UNE ligne vide déjà présente (avant tout ajout
  // depuis le catalogue) : la ligne qu'on vient d'ajouter n'est donc PAS
  // forcément « ligne 1 » — c'est toujours la DERNIÈRE ligne du tableau.
  const catalogSearch = page.getByLabel('Rechercher dans le catalogue');
  const serialInputs = page.getByLabel(/^Numéro de série - ligne \d+$/);
  const inventoryInputs = page.getByLabel(/^Numéro d'inventaire - ligne \d+$/);
  for (const [index, serialNumber] of params.serialNumbers.entries()) {
    await catalogSearch.fill(CATALOG_QUERY);
    await page.getByRole('option', { name: CATALOG_ITEM_LABEL }).click();
    const count = await serialInputs.count();
    await serialInputs.nth(count - 1).fill(serialNumber);
    const inventoryNumber = params.inventoryNumbers?.[index];
    if (inventoryNumber) await inventoryInputs.nth(count - 1).fill(inventoryNumber);
  }

  await page.getByRole('button', { name: 'Créer le bon' }).click();
  // Motif UUID explicite : `[^/]+$` matche AUSSI `/bons/new` (déjà l'URL
  // courante avant la redirection post-création), ce qui faisait résoudre
  // waitForURL immédiatement — avant même la vraie navigation — et capturait
  // l'URL du formulaire au lieu de celle du bon créé.
  await page.waitForURL(/\/bons\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

  const url = page.url();
  const bonId = new URL(url).pathname.split('/bons/')[1];
  // Titre attendu par son motif : juste après la redirection, le titre du
  // formulaire (« Nouveau bon… ») peut encore être à l'écran.
  const reference = (await page.getByRole('heading', { level: 1, name: /^BON-\d{4}-/ }).innerText()).trim();
  return { bonId, url, reference };
}

/**
 * Crée un bon puis le mène jusqu'au statut actif par une signature
 * présentielle (cachet IT, signature recueillie depuis la session IT — voir
 * `completeSignature`), comme aux tests 3 et 6. Revient sur la fiche du bon
 * et attend le statut « Actif » avant de rendre la main.
 */
export async function createActiveBon(page: Page, params: DraftBonParams): Promise<DraftBon> {
  const bon = await createDraftBon(page, params);
  const signerPath = await initiatePresentiel(page, 'mise_disposition');
  await completeSignature(page, signerPath);
  await page.goto(bon.url);
  await expect(page.getByText('En cours', { exact: true }).first()).toBeVisible();
  return bon;
}
