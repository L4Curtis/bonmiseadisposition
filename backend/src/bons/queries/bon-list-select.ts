import { Prisma } from '@prisma/client';

/**
 * Projection de `GET /bons` (liste paginée), volontairement plus légère que
 * BON_SELECT (fiche d'un bon, `GET /bons/:id`) : 71 ko pour 25 bons avant ce
 * découpage, dont l'essentiel en équipements complets, signatures détaillées et
 * fiche filiale entière, que la liste n'affiche pas.
 *
 * Chaque champ conservé a un consommateur connu côté frontend — le relire
 * avant d'en retirer un :
 * - liste des bons (pages/bons/list) : référence, statut, dates, filiale,
 *   collaborateur, créateur, nombre d'équipements, signatures en attente
 *   (badge « En attente de signature » et relance), adresse du collaborateur
 *   (un bon sans adresse ne peut pas être relancé par email) ;
 * - bloc « À traiter aujourd'hui » (dashboard/tabs/today/useActionableBons) :
 *   référence, collaborateur, createdAt, updatedAt, dateRestitution ;
 * - recherche globale (components/layout/header/GlobalSearch) : numéros de
 *   série et d'inventaire, article ou libellé des équipements, pour afficher
 *   l'équipement qui correspond à la saisie ;
 * - « Repartir d'un bon existant » (bons/create/DuplicateBonButton) : article
 *   du catalogue (id, marque, modèle) ou libellé libre de chaque équipement.
 *
 * Signatures : seules les NON signées sont renvoyées. Le badge de statut
 * (`hasPendingSignature`) ne regarde que celles-là, et la relance a besoin de
 * la date d'envoi du dernier lien ; l'historique des signatures reste sur la
 * fiche du bon.
 */
export const BON_LIST_SELECT = {
  id: true,
  reference: true,
  status: true,
  collaborateurEmail: true,
  dateMiseDisposition: true,
  dateRestitution: true,
  createdAt: true,
  updatedAt: true,
  filiale: { select: { id: true, displayName: true } },
  collaborateur: { select: { id: true, displayName: true, email: true } },
  createdBy: { select: { id: true, displayName: true } },
  equipments: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      customLabel: true,
      serialNumber: true,
      inventoryNumber: true,
      catalogItem: { select: { id: true, brand: true, model: true } },
    },
  },
  signatures: {
    where: { signed: false },
    orderBy: { createdAt: 'desc' },
    select: { type: true, signed: true, createdAt: true },
  },
} satisfies Prisma.BonSelect;
