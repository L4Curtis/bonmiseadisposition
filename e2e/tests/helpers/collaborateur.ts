import { expect, type Page } from '@playwright/test';

export interface NouveauCollaborateur {
  firstName: string;
  lastName: string;
  /** Omis (ou vide) pour un collaborateur sans adresse email — signature
   *  présentielle uniquement (voir isDeliverableEmail côté frontend/backend). */
  email?: string;
}

/**
 * Sur le formulaire de création de bon : cherche un collaborateur par nom
 * (recherche sans résultat, volontairement — le nom est unique par test),
 * puis le crée via la boîte de dialogue « Créer un collaborateur » (compte
 * manuel, sans annuaire Active Directory). Le collaborateur créé est
 * automatiquement sélectionné dans le formulaire à l'issue de l'appel.
 */
export async function createManualCollaborateur(page: Page, collaborateur: NouveauCollaborateur): Promise<void> {
  const search = page.getByLabel('Rechercher un collaborateur');
  await search.fill(collaborateur.lastName);

  const creerDepuisRecherche = page.getByRole('button', { name: /créer un collaborateur/i });
  await expect(creerDepuisRecherche).toBeVisible();
  await creerDepuisRecherche.click();

  const dialog = page.getByRole('dialog', { name: 'Créer un collaborateur' });
  await expect(dialog).toBeVisible();
  // exact: true sur « Nom * » — sinon « Prénom * » matche aussi (« Nom * » est
  // une sous-chaîne insensible à la casse de « Prénom * », et getByLabel fait
  // par défaut une recherche de sous-chaîne).
  await dialog.getByLabel('Prénom *').fill(collaborateur.firstName);
  await dialog.getByLabel('Nom *', { exact: true }).fill(collaborateur.lastName);
  if (collaborateur.email) {
    await dialog.getByLabel('Email (facultatif)').fill(collaborateur.email);
  }
  await dialog.getByRole('button', { name: 'Créer' }).click();
  await expect(dialog).not.toBeVisible();

  // Confirme que le collaborateur créé est bien sélectionné (puce affichée à
  // la place du champ de recherche) avant de continuer le formulaire.
  await expect(page.getByRole('button', { name: 'Retirer le collaborateur sélectionné' })).toBeVisible();
}

/**
 * Sélectionne un collaborateur déjà existant depuis l'autocomplétion (au lieu
 * d'en créer un nouveau). Utilisé uniquement quand le test a besoin d'un
 * compte réellement authentifiable dans cet environnement (aucune signature
 * SSO n'y est configurée) : voir tests/05-restitution-non-rendu.spec.ts, où
 * l'admin est délibérément son propre collaborateur pour pouvoir co-signer la
 * restitution partielle par email — même artifice que le scénario
 * fonctionnel de référence (flow-test.cjs) qui a inspiré ce lot.
 */
export async function selectExistingCollaborateur(page: Page, searchQuery: string, resultName: string): Promise<void> {
  const search = page.getByLabel('Rechercher un collaborateur');
  await search.fill(searchQuery);
  await page.getByRole('button', { name: resultName }).click();
  await expect(page.getByRole('button', { name: 'Retirer le collaborateur sélectionné' })).toBeVisible();
}
