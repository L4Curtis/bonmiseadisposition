'use strict';
/**
 * Bons « de volume » : quelques dizaines de bons ordinaires, étalés sur six
 * mois, pour que les listes, la pagination, l'inventaire et le tableau de
 * bord aient de la matière. Tirage pseudo-aléatoire à graine fixe : le même
 * jeu à chaque amorçage.
 */
const A = require('../lib/actions.cjs');
const { aleatoire } = require('../lib/png.cjs');
const { PERSONNES } = require('./personnes.cjs');

const GRAINE = 20260924;
/** Collaborateurs capables de se connecter pour signer à distance. */
const SIGNENT_A_DISTANCE_ARCHIVES = ['lea', 'hugo', 'sophie', 'paul'];
const SIGNENT_A_DISTANCE_EN_COURS = ['lea', 'hugo'];
const FIGURANTS = PERSONNES.filter((p) => p.role === 'collaborator' && (p.compte === 'annuaire' || p.cle === 'mathis')).map((p) => p.cle);
const FIGURANTS_AVEC_EMAIL = PERSONNES.filter((p) => p.role === 'collaborator' && p.compte === 'annuaire').map((p) => p.cle);
const FILIALE = Object.fromEntries(PERSONNES.map((p) => [p.cle, p.filiale]));
const POSTES = new Set(['lat5450', 't14', 'mba13', 'elitemini']);
const PROFILS = [
  ['lat5450', 'wd19s', 'mxmaster', 'targus'],
  ['t14', 'targus'],
  ['mba13', 'usbc'],
  ['elitemini', 'p2425h', 'mxkeys', 'ms116'],
  ['a55'],
  ['iphone15'],
  ['lg27', 'usbc'],
  ['jabra'],
  ['t14', 'a55', 'yubikey'],
  ['lat5450', 'jabra'],
];

function volume(numero) {
  const hasard = aleatoire(GRAINE);
  const entier = (min, max) => min + Math.floor(hasard() * (max - min + 1));
  const choisir = (liste) => liste[Math.floor(hasard() * liste.length)];
  const technicien = (filiale) => {
    const habituel = filiale === 'NORD' ? 'tech1' : 'tech2';
    const autre = habituel === 'tech1' ? 'tech2' : 'tech1';
    return hasard() < 0.75 ? habituel : autre;
  };
  const series = (articles) => articles.map((a) => a.serie);
  const rien = async () => {};

  const scenarios = [];
  const postesRendus = [];
  const ajouter = (statut, libelle, bon, etapes) => {
    const cle = `V${String(scenarios.length + 1).padStart(2, '0')}`;
    scenarios.push(Object.freeze({ cle, situation: `Volume : ${libelle}`, statut, bon, etapes }));
  };
  const socle = (qui, remiseIlYA, articles, extra = {}) => {
    const filiale = FILIALE[qui];
    return { par: technicien(filiale), collaborateur: qui, filiale, remiseIlYA, articles, ...extra };
  };

  // ── 18 bons clôturés normalement (prêts de 10 jours à 4 mois) ────────────
  for (let i = 0; i < 18; i++) {
    const qui = hasard() < 0.35 ? choisir(SIGNENT_A_DISTANCE_ARCHIVES) : choisir(FIGURANTS);
    const d1 = entier(35, 180);
    const d2 = d1 - entier(10, Math.min(d1 - 4, 120));
    const articles = choisir(PROFILS).map(numero);
    const prevue = i % 2 === 0 ? { restitutionPrevue: -d2 + entier(-3, 5) } : {};
    const bon = socle(qui, d1, articles, prevue);
    const rendPar = technicien(bon.filiale);
    postesRendus.push(...articles.filter((a) => POSTES.has(a.cle)));
    const etapes = SIGNENT_A_DISTANCE_ARCHIVES.includes(qui)
      ? {
          remise: { jours: d1, faire: (ctx, b) => A.envoyer(ctx, b, bon.par) },
          'signature-remise': { jours: d1 - 1, faire: (ctx, b) => A.signerADistance(ctx, b, qui, 'mise_disposition') },
          restitution: { jours: d2, faire: (ctx, b) => A.demanderRestitution(ctx, b, rendPar, series(articles)) },
          'signature-restitution': { jours: d2 - 1, faire: (ctx, b) => A.signerADistance(ctx, b, qui, 'restitution') },
        }
      : {
          remise: { jours: d1, faire: (ctx, b) => A.remisePresentielle(ctx, b, bon.par, qui) },
          restitution: { jours: d2, faire: (ctx, b) => A.restitutionPresentielle(ctx, b, rendPar, qui) },
        };
    ajouter('archived', 'clôturé', bon, etapes);
  }

  // ── 12 bons en cours (dont 2 dont la date de restitution est dépassée) ───
  for (let i = 0; i < 12; i++) {
    const qui = hasard() < 0.3 ? choisir(SIGNENT_A_DISTANCE_EN_COURS) : choisir(FIGURANTS);
    const d1 = entier(4, 170);
    const prevue = i < 3 ? { restitutionPrevue: entier(10, 90) } : i < 5 ? { restitutionPrevue: -Math.min(entier(2, 20), d1 - 1) } : {};
    const bon = socle(qui, d1, choisir(PROFILS).map(numero), prevue);
    const etapes = SIGNENT_A_DISTANCE_EN_COURS.includes(qui)
      ? {
          remise: { jours: d1, faire: (ctx, b) => A.envoyer(ctx, b, bon.par) },
          'signature-remise': { jours: d1 - 0.5, faire: (ctx, b) => A.signerADistance(ctx, b, qui, 'mise_disposition') },
        }
      : { remise: { jours: d1, faire: (ctx, b) => A.remisePresentielle(ctx, b, bon.par, qui) } };
    ajouter('active', 'en cours', bon, etapes);
  }

  // ── 3 remises à signer (aujourd'hui, 3 jours, 9 jours : en retard) ───────
  for (const d of [0, 3, 9]) {
    const bon = socle(choisir(FIGURANTS_AVEC_EMAIL), d, choisir(PROFILS).map(numero));
    ajouter('sent_mise_dispo', 'remise à signer', bon, { remise: { jours: d, faire: (ctx, b) => A.envoyer(ctx, b, bon.par) } });
  }

  // ── 2 restitutions à signer (demandées il y a 3 et 11 jours) ────────────
  for (const d2 of [3, 11]) {
    const d1 = entier(50, 90);
    const articles = choisir(PROFILS).map(numero);
    const bon = socle(choisir(FIGURANTS_AVEC_EMAIL), d1, articles);
    ajouter('sent_restitution', 'restitution à signer', bon, {
      remise: { jours: d1, faire: (ctx, b) => A.remisePresentielle(ctx, b, bon.par, bon.collaborateur) },
      restitution: { jours: d2, faire: (ctx, b) => A.demanderRestitution(ctx, b, bon.par, series(articles)) },
    });
  }

  // ── 3 bons annulés (deux brouillons abandonnés, un envoi annulé) ─────────
  for (let i = 0; i < 2; i++) {
    const d = entier(10, 60);
    const bon = socle(choisir(FIGURANTS), d, choisir(PROFILS).map(numero));
    ajouter('cancelled', 'annulé', bon, {
      remise: { jours: d, faire: rien },
      'signature-remise': { jours: d - 0.2, faire: (ctx, b) => A.annuler(ctx, b, bon.par) },
    });
  }
  {
    const d = entier(15, 40);
    const bon = socle(choisir(FIGURANTS_AVEC_EMAIL), d, choisir(PROFILS).map(numero));
    ajouter('cancelled', 'annulé après envoi', bon, {
      remise: { jours: d, faire: (ctx, b) => A.envoyer(ctx, b, bon.par) },
      'signature-remise': { jours: d - 1, faire: (ctx, b) => A.annuler(ctx, b, bon.par) },
    });
  }

  // ── 4 brouillons, dont 2 qui reprêtent un poste déjà rendu ───────────────
  for (let i = 0; i < 2; i++) {
    const bon = socle(choisir(FIGURANTS), -entier(1, 7), choisir(PROFILS).map(numero));
    ajouter('draft', 'brouillon', bon, { remise: { jours: entier(1, 4), faire: rien } });
  }
  for (const poste of [postesRendus[0], postesRendus[1]]) {
    const bon = socle(choisir(FIGURANTS), -entier(2, 5), [poste]);
    ajouter('draft', 'brouillon (poste déjà rendu, reprêté)', bon, { cloture: { jours: 0, faire: rien } });
  }

  return scenarios;
}

module.exports = { volume };
