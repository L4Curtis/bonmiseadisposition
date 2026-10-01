import type { Prisma } from '@prisma/client';

/**
 * Champs d'un compte renvoyés par l'API (contrat `User`, `contracts/users.ts`) :
 * jamais `passwordHash` ni `passwordChangedAt`. De la filiale, seulement son
 * identité : ni cachet, ni logo, ni adresse.
 */
export const USER_SAFE_SELECT = {
  id: true,
  samAccountName: true,
  displayName: true,
  email: true,
  department: true,
  company: true,
  title: true,
  // Civilité retenue sur le compte (choisie par le technicien au premier
  // bon) : le formulaire de bon la repropose pour les bons suivants.
  civilite: true,
  filialeId: true,
  filiale: { select: { id: true, name: true, displayName: true, active: true } },
  isItStaff: true,
  role: true,
  isLocalAccount: true,
  isManualAccount: true,
  mustChangePassword: true,
  active: true,
  lastLdapSync: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;
