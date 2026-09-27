/**
 * Noms des signataires, par adresse email (en minuscules). Une signature
 * n'enregistre que l'adresse du compte connecté : le PDF retrouve le nom du
 * compte pour écrire « Théo Bernard » plutôt qu'une adresse.
 */
export type SignerNames = ReadonlyMap<string, string>;

export const NO_SIGNER_NAMES: SignerNames = new Map();

export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Nom du compte de cette adresse, ou `null` s'il est inconnu. */
export function signerName(names: SignerNames, email: string | null | undefined): string | null {
  return names.get(normalizeEmail(email)) ?? null;
}
