import type { LinkSignatureType, PortalBon, PortalSignature } from '@/contracts/bons';

/**
 * Classement du portail par CE QUE LA PERSONNE DOIT FAIRE (R-057), et non par
 * la validité du lien :
 *  - « À signer » : chaque document qui attend sa signature, lien valide,
 *    expiré ou au guichet ;
 *  - « En cours » : les bons où elle détient encore du matériel (ou dont la
 *    restitution n'est pas finie), sans rien à signer ;
 *  - « Contestés » : les bons en contestation ;
 *  - « Historique » : les bons clôturés.
 * « Mes équipements » liste, à part, chaque équipement encore chez elle.
 */

/** Un document à signer, prêt à afficher. */
export interface DocumentToSign {
  bon: PortalBon;
  type: LinkSignatureType;
  /** Jeton du lien signable, `null` si le lien a expiré ou se signe au guichet. */
  token: string | null;
  /** Jeton du dernier lien, même expiré, pour « Demander un nouveau lien » ;
   *  `null` si le serveur ne le fournit pas. */
  requestToken: string | null;
  /** Depuis quand le document attend : début de l'attente, sinon date du lien. */
  since: string | null;
  inPerson: boolean;
  expired: boolean;
}

/** Un équipement encore chez le collaborateur. */
export interface HeldEquipment {
  id: string;
  bon: PortalBon;
  label: string;
  category: string | null;
  serialNumber: string | null;
  inventoryNumber: string | null;
  /** Chez lui depuis : date de mise à disposition du bon. */
  since: string;
  /** Matériel reçu dont la remise attend encore sa signature (« Remise à
   *  signer ») : il est bien chez la personne, mais c'est à confirmer. */
  awaitingSignature: boolean;
  /** Lien pour signer cette remise tout de suite, `null` si le lien a expiré
   *  ou si la remise se signe au guichet. */
  signToken: string | null;
}

export interface PortalGroups {
  toSign: DocumentToSign[];
  current: PortalBon[];
  contested: PortalBon[];
  history: PortalBon[];
  held: HeldEquipment[];
}

/** Statuts où le matériel du bon est (au moins en partie) chez la personne.
 *  « Remise à signer » en fait partie : le matériel est remis avant que la
 *  personne ne signe, elle doit le retrouver dans « Chez vous ». */
const HOLDING_STATUSES = new Set(['sent_mise_dispo', 'active', 'sent_restitution', 'partially_returned', 'contested']);

/** Un lien ramené à l'origine des temps a été remplacé (convention du serveur). */
function isReplacedLink(signature: PortalSignature): boolean {
  return !!signature.invalidatedReason || new Date(signature.tokenExpiresAt).getTime() <= 1000;
}

/** Le document `type` attend-il une signature ? Oui si sa demande la plus
 *  récente n'est ni signée ni remplacée (une restitution partielle signée
 *  puis redemandée compte ; un vieux lien remplacé, non). */
function awaitsSignature(signatures: readonly PortalSignature[], type: LinkSignatureType): boolean {
  const latest = [...signatures]
    .filter((s) => s.type === type)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return !!latest && !latest.signed && !isReplacedLink(latest);
}

/** Document en attente : celui que calcule le serveur (`pendingSignature`),
 *  sinon déduit du statut (et, en restitution en cours, des signatures ; le
 *  PV passe avant une restitution partielle, comme le sous-état). */
function pendingType(bon: PortalBon): LinkSignatureType | null {
  if (bon.status === 'contested' || bon.status === 'archived' || bon.status === 'cancelled') return null;
  if (bon.pendingSignature !== undefined) return bon.pendingSignature?.type ?? null;
  if (bon.status === 'sent_mise_dispo') return 'mise_disposition';
  if (bon.status === 'sent_restitution') return 'restitution';
  if (bon.status !== 'partially_returned') return null;
  if (awaitsSignature(bon.signatures, 'pv_cloture')) return 'pv_cloture';
  return awaitsSignature(bon.signatures, 'restitution') ? 'restitution' : null;
}

/** Lien encore signable : jeton transmis, ni expiré ni remplacé. */
function isSignableLink(signature: PortalSignature | undefined): boolean {
  if (!signature?.token || isReplacedLink(signature)) return false;
  return new Date(signature.tokenExpiresAt).getTime() > Date.now();
}

function documentToSign(bon: PortalBon, type: LinkSignatureType): DocumentToSign {
  const signature = [...bon.signatures]
    .filter((s) => s.type === type && !s.signed)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const token = signature?.token ?? null;
  const inPerson = bon.pendingSignature?.inPerson ?? !!signature?.inPersonPending;
  // Le serveur transmet aussi le jeton du dernier lien EXPIRÉ (pour « Demander
  // un nouveau lien ») : un jeton présent ne prouve donc pas un lien valide.
  const expired = bon.pendingSignature?.expired ?? (!inPerson && !isSignableLink(signature));
  const since = bon.awaitingSince ?? signature?.createdAt ?? null;
  return { bon, type, token: expired ? null : token, requestToken: inPerson ? null : token, inPerson, expired, since };
}

/** Équipement encore chez la personne : état calculé par le serveur, sinon
 *  ni rendu ni déclaré non restitué. */
function isHeld(eq: PortalBon['equipments'][number]): boolean {
  if (eq.returnState !== undefined) return eq.returnState === 'out';
  return !eq.returnedAt && !eq.notReturned;
}

function equipmentLabel(eq: PortalBon['equipments'][number]): string {
  if (eq.catalogItem) return `${eq.catalogItem.brand} ${eq.catalogItem.model}`;
  return eq.customLabel || 'Équipement';
}

function heldEquipments(bon: PortalBon): HeldEquipment[] {
  if (!HOLDING_STATUSES.has(bon.status)) return [];
  const awaitingSignature = bon.status === 'sent_mise_dispo';
  const handover = awaitingSignature ? documentToSign(bon, 'mise_disposition') : null;
  const signToken = handover && !handover.inPerson ? handover.token : null;
  return [...bon.equipments]
    .sort((a, b) => a.order - b.order)
    .filter(isHeld)
    .map((eq) => ({
      id: eq.id,
      bon,
      label: equipmentLabel(eq),
      category: eq.catalogItem?.category ?? null,
      serialNumber: eq.serialNumber,
      inventoryNumber: eq.inventoryNumber,
      since: bon.dateMiseDisposition,
      awaitingSignature,
      signToken,
    }));
}

/** Bons dont le remplaçant (contestation « Fondée ») figure déjà dans le
 *  portail avec du matériel chez la personne : le remplaçant reprend les
 *  mêmes équipements, l'original ne doit pas les montrer une seconde fois.
 *  Un remplaçant encore en préparation n'est pas dans le portail : l'original
 *  garde alors ses équipements. */
function supersededBonIds(bons: readonly PortalBon[]): ReadonlySet<string> {
  const holding = new Set(bons.filter((b) => HOLDING_STATUSES.has(b.status)).map((b) => b.id));
  return new Set(bons.filter((b) => b.replacedBy && holding.has(b.replacedBy.id)).map((b) => b.id));
}

export function classifyPortal(bons: readonly PortalBon[]): PortalGroups {
  const toSign: DocumentToSign[] = [];
  const current: PortalBon[] = [];
  const contested: PortalBon[] = [];
  const history: PortalBon[] = [];
  for (const bon of bons) {
    const type = pendingType(bon);
    if (bon.status === 'contested') contested.push(bon);
    else if (type) toSign.push(documentToSign(bon, type));
    else if (bon.status === 'archived' || bon.status === 'cancelled') history.push(bon);
    else current.push(bon);
  }
  const superseded = supersededBonIds(bons);
  const held = bons.filter((b) => !superseded.has(b.id)).flatMap(heldEquipments);
  return { toSign, current, contested, history, held };
}
