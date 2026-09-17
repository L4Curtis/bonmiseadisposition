/** Valide les champs obligatoires du formulaire d'un equipement de catalogue.
 *  Retourne le message d'erreur a afficher, ou `null` si le formulaire est valide. */
export function validateCatalogItemForm(form: { brand: string; model: string }): string | null {
  if (!form.brand.trim() || !form.model.trim()) {
    return 'La marque et le modèle sont obligatoires';
  }
  return null;
}
