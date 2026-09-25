'use strict';
/**
 * Référentiels du banc : filiales (avec logo et cachet), catalogue, packs.
 * Données de référence figées ; leur création passe par l'API (voir
 * amorcage/etapes/referentiels.cjs).
 */

const FILIALES = Object.freeze([
  Object.freeze({ cle: 'NORD', nom: 'Bâtir Nord', adresse: '12 rue des Artisans, 59000 Lille', siret: '81234567800011', couleur: [178, 34, 52] }),
  Object.freeze({ cle: 'SUD', nom: 'Rénov Sud', adresse: '4 quai du Port, 13002 Marseille', siret: '82345678900022', couleur: [0, 102, 153] }),
  Object.freeze({ cle: 'EST', nom: 'Services Est', adresse: '8 place Kléber, 67000 Strasbourg', siret: '83456789000033', couleur: [46, 125, 50] }),
]);

/** Filiale fermée : désactivée après création, sans logo ni bon. */
const FILIALE_INACTIVE = Object.freeze({ cle: 'OUEST', nom: 'Ancienne agence Ouest', adresse: '1 rue du Port, 44000 Nantes', siret: '84567890100044' });

/**
 * Catalogue : toutes les catégories de l'application. `prefixe` sert aux
 * numéros de série fabriqués (DL5450-0007…) ; `inventorie` : l'article porte
 * un numéro d'inventaire (les petits accessoires n'en ont pas).
 */
const ARTICLES = Object.freeze([
  { cle: 'lat5450', categorie: 'pc_portable', marque: 'Dell', modele: 'Latitude 5450', description: 'Portable 14 pouces, Core Ultra 5, 16 Go, SSD 512 Go', prefixe: 'DL5450', inventorie: true },
  { cle: 't14', categorie: 'pc_portable', marque: 'Lenovo', modele: 'ThinkPad T14 Gen 5', description: 'Portable 14 pouces, Ryzen 7 PRO, 32 Go', prefixe: 'PF5T14', inventorie: true },
  { cle: 'mba13', categorie: 'pc_portable', marque: 'Apple', modele: 'MacBook Air 13 M3', description: 'Portable 13 pouces, 16 Go, SSD 512 Go', prefixe: 'C02M3A', inventorie: true },
  { cle: 'elitemini', categorie: 'pc_fixe', marque: 'HP', modele: 'Elite Mini 800 G9', description: 'Mini PC de bureau, Core i5, 16 Go', prefixe: 'HP800M', inventorie: true },
  { cle: 'p2425h', categorie: 'ecran', marque: 'Dell', modele: 'P2425H', description: 'Écran 24 pouces Full HD, USB-C', prefixe: 'DLP24H', inventorie: true },
  { cle: 'lg27', categorie: 'ecran', marque: 'LG', modele: '27UP850-W', description: 'Écran 27 pouces 4K, USB-C 96 W', prefixe: 'LG27UP', inventorie: true },
  { cle: 'mxmaster', categorie: 'souris', marque: 'Logitech', modele: 'MX Master 3S', description: 'Souris sans fil ergonomique', prefixe: 'LGMX3S', inventorie: false },
  { cle: 'ms116', categorie: 'souris', marque: 'Dell', modele: 'MS116', description: 'Souris filaire USB', prefixe: 'DLMS16', inventorie: false },
  { cle: 'mxkeys', categorie: 'clavier', marque: 'Logitech', modele: 'MX Keys S', description: 'Clavier sans fil AZERTY rétroéclairé', prefixe: 'LGMXKS', inventorie: false },
  { cle: 'jabra', categorie: 'casque', marque: 'Jabra', modele: 'Evolve2 55', description: 'Casque Bluetooth à réduction de bruit', prefixe: 'JBE255', inventorie: false },
  { cle: 'a55', categorie: 'telephone', marque: 'Samsung', modele: 'Galaxy A55', description: 'Smartphone 128 Go, double SIM', prefixe: 'R58A55', inventorie: true },
  { cle: 'iphone15', categorie: 'telephone', marque: 'Apple', modele: 'iPhone 15', description: 'Smartphone 128 Go', prefixe: 'F2LI15', inventorie: true },
  { cle: 'targus', categorie: 'housse', marque: 'Targus', modele: 'Cypress 14', description: 'Sacoche pour portable 14 pouces', prefixe: 'TGCY14', inventorie: false },
  { cle: 'wd19s', categorie: 'dock', marque: 'Dell', modele: 'WD19S', description: 'Station d\'accueil USB-C 130 W', prefixe: 'DLWD19', inventorie: true },
  { cle: 'usbc', categorie: 'cable', marque: 'Belkin', modele: 'USB-C vers HDMI 2 m', description: 'Câble adaptateur 4K 60 Hz', prefixe: 'BKCHDM', inventorie: false },
  { cle: 'yubikey', categorie: 'autre', marque: 'Yubico', modele: 'YubiKey 5 NFC', description: 'Clé de sécurité (double authentification)', prefixe: 'YK5NFC', inventorie: false },
].map((a) => Object.freeze(a)));

/** Article retiré du catalogue (désactivé) : visible comme tel, inutilisable dans un nouveau bon. */
const ARTICLE_RETIRE = Object.freeze({ categorie: 'pc_portable', marque: 'HP', modele: 'ProBook 450 G7', description: 'Ancien modèle, retiré du catalogue' });

const PACKS = Object.freeze([
  Object.freeze({ cle: 'nomade', nom: 'Pack poste nomade', description: 'Portable, station d\'accueil, souris, sacoche et casque', articles: ['lat5450', 'wd19s', 'mxmaster', 'targus', 'jabra'] }),
  Object.freeze({ cle: 'chantier', nom: 'Pack chef de chantier', description: 'Portable renforcé, smartphone, sacoche et clé de sécurité', articles: ['t14', 'a55', 'targus', 'yubikey'] }),
]);

/**
 * Numéros de série et d'inventaire fabriqués : un compteur par article, un
 * compteur global d'inventaire. Déterministes (même ordre d'appel, mêmes
 * numéros d'un amorçage à l'autre).
 */
function fabriqueDeNumeros() {
  const compteurs = new Map();
  let inventaire = 0;
  return (cle) => {
    const article = ARTICLES.find((a) => a.cle === cle);
    if (!article) throw new Error(`Article inconnu : ${cle}`);
    const rang = (compteurs.get(cle) ?? 0) + 1;
    compteurs.set(cle, rang);
    const serie = `${article.prefixe}-${String(rang).padStart(4, '0')}`;
    if (!article.inventorie) return { cle, serie };
    inventaire += 1;
    return { cle, serie, inventaire: `INV-${String(inventaire).padStart(5, '0')}` };
  };
}

module.exports = { FILIALES, FILIALE_INACTIVE, ARTICLES, ARTICLE_RETIRE, PACKS, fabriqueDeNumeros };
