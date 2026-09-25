/**
 * Valeurs fixes du jeu de données des tests de contrat : les tests les citent
 * pour retrouver ce que seed.ts a créé (numéro de série en double, jetons de
 * signature, mot de passe du compte local…).
 */
export const CONTRACT_YEAR = 2026;

export const LOCAL_ADMIN_PASSWORD = 'Contrat-Http-2026!';

/** Numéro de série présent sur deux bons en circulation : il doit ressortir
 *  dans GET /equipment/serial-conflicts. */
export const DUPLICATE_SERIAL = 'SN-CONTRAT-DOUBLON';
export const INVENTORY_NUMBER = 'INV-CONTRAT-0001';

/** Jetons des liens de signature en attente (remise et restitution). */
export const PENDING_REMISE_TOKEN = 'jeton-contrat-remise-en-attente-0000000000000';
export const PENDING_RESTITUTION_TOKEN = 'jeton-contrat-restitution-en-attente-000000000';
export const SIGNED_TOKEN = 'jeton-contrat-remise-deja-signee-000000000000';

export const EMAILS = {
  admin: 'admin@contrat.test',
  technician: 'technicien@contrat.test',
  direction: 'direction@contrat.test',
  collaborator: 'collaborateur@contrat.test',
  otherCollaborator: 'autre.collaborateur@contrat.test',
  departed: 'parti@contrat.test',
} as const;

/** Bons du jeu de données, un par statut utile aux tests. */
export type BonFixtureKey =
  | 'draft'
  | 'sentMiseDispo'
  | 'active'
  | 'sentRestitution'
  | 'partiallyReturned'
  | 'archived'
  | 'cancelled'
  | 'contested'
  | 'otherCollaboratorActive'
  | 'departedActive';
