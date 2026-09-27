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
 * Pour calculer le sous-état, le document en attente et les retards (machine
 * à états, voir bon-list-view.ts), la requête lit aussi l'état de restitution
 * des équipements, le compte du collaborateur (actif, adresse) et toutes les
 * signatures utiles ; la réponse n'en garde que les signatures NON signées
 * (date d'envoi du dernier lien, pour la relance), comme avant.
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
  awaitingSince: true,
  filiale: { select: { id: true, displayName: true } },
  collaborateur: { select: { id: true, displayName: true, email: true, active: true } },
  createdBy: { select: { id: true, displayName: true } },
  equipments: {
    orderBy: { order: 'asc' },
    select: {
      id: true,
      customLabel: true,
      serialNumber: true,
      inventoryNumber: true,
      returnedAt: true,
      notReturned: true,
      catalogItem: { select: { id: true, brand: true, model: true } },
    },
  },
  signatures: {
    orderBy: { createdAt: 'desc' },
    select: {
      type: true,
      signed: true,
      signedAt: true,
      createdAt: true,
      tokenExpiresAt: true,
      isInPerson: true,
      pdfType: true,
      invalidatedAt: true,
    },
  },
} satisfies Prisma.BonSelect;
