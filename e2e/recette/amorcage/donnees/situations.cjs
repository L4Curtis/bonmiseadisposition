'use strict';
/**
 * Les situations nommées du banc : un bon par situation métier, créés en
 * premier et dans cet ordre, d'où des références stables d'un amorçage à
 * l'autre (S01 → BON-<année>-0001, S02 → …-0002, etc.). GUIDE-TESTEUR.md les
 * reprend une à une ; l'amorçage vérifie à la fin que chaque bon a la
 * référence et le statut annoncés.
 *
 * Chaque situation se déroule en étapes rattachées aux phases de l'amorçage
 * (voir etapes/phases.cjs). `jours` : combien de jours dans le passé l'étape
 * a eu lieu — les dates sont ensuite reculées d'autant. Une étape qui produit
 * un document que l'application ne sait pas régénérer (PV encore à signer,
 * clôture sans signature, avenant) reste à 0 jour.
 */
const A = require('../lib/actions.cjs');
const { expirerLienEnAttente } = require('../lib/hors-api.cjs');

function situations(numero) {
  const s = (cle, situation, statut, bon, etapes, attendu = {}) => Object.freeze({ cle, situation, statut, bon: { ...bon, notes: `Recette ${cle} : ${situation}.` }, etapes, attendu });
  const series = (bonArticles, cles) => cles.map((c) => bonArticles.find((a) => a.cle === c).serie);

  const s06 = [numero('t14'), numero('wd19s'), numero('lg27')];
  const s07 = [numero('lat5450'), numero('a55')];
  const s08 = [numero('lat5450'), numero('p2425h'), numero('mxmaster')];
  const s15 = [numero('t14'), numero('a55')];
  const s17 = [numero('lat5450'), numero('lg27'), numero('jabra')];
  const s18 = [numero('t14'), numero('a55'), numero('jabra')];

  return [
    s('S01', 'Brouillon préparé à partir d\'un pack, numéros de série à saisir', 'draft',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: -3, pack: 'nomade' },
      { remise: { jours: 1, faire: async () => {} } }),

    s('S02', 'Remise à signer, envoyée aujourd\'hui (lien valide)', 'sent_mise_dispo',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 0, articles: [numero('t14'), numero('mxmaster')] },
      { remise: { jours: 0, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech2') } }),

    s('S03', 'Remise à signer en retard (envoyée il y a 10 jours, lien expiré)', 'sent_mise_dispo',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 10, articles: [numero('lat5450'), numero('p2425h')] },
      { remise: { jours: 10, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') } }),

    s('S04', 'En cours, remise signée à distance par la collaboratrice', 'active',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 32, articles: [numero('mba13'), numero('jabra'), numero('usbc')] },
      {
        remise: { jours: 32, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 31, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'mise_disposition') },
      }),

    s('S05', 'Restitution à signer (demandée il y a 2 jours)', 'sent_restitution',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 45, articles: [numero('elitemini'), numero('lg27'), numero('mxkeys')] },
      {
        remise: { jours: 45, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'hugo') },
        restitution: { jours: 2, faire: async (ctx, bon) => A.demanderRestitution(ctx, bon, 'tech2', await A.seriesDuBon(ctx, bon.id)) },
      }),

    s('S06', 'Restitution partielle signée, deux équipements encore chez la collaboratrice', 'partially_returned',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 95, articles: s06 },
      {
        remise: { jours: 95, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 94, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'mise_disposition') },
        restitution: { jours: 21, faire: (ctx, bon) => A.demanderRestitution(ctx, bon, 'tech1', series(s06, ['wd19s'])) },
        'signature-restitution': { jours: 20, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'restitution') },
      }),

    s('S07', 'PV de non-restitution à signer par le collaborateur', 'partially_returned',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 60, articles: s07 },
      {
        remise: { jours: 60, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'hugo') },
        'signature-restitution': {
          jours: 0,
          faire: async (ctx, bon) => {
            await A.declarerNonRestitue(ctx, bon, 'tech2', series(s07, ['a55']), 'Téléphone perdu sur le chantier, déclaration de perte faite par le collaborateur.');
            await A.demanderRestitution(ctx, bon, 'tech2', series(s07, ['lat5450']));
            await A.signerADistance(ctx, bon, 'hugo', 'restitution');
          },
        },
      }),

    s('S08', 'PV de non-restitution dont le lien a expiré', 'partially_returned',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 70, articles: s08 },
      {
        remise: { jours: 70, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 69, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'mise_disposition') },
        'signature-restitution': {
          jours: 0,
          faire: async (ctx, bon) => {
            await A.declarerNonRestitue(ctx, bon, 'tech1', series(s08, ['mxmaster']), 'Souris oubliée dans un train, jamais retrouvée.');
            await A.demanderRestitution(ctx, bon, 'tech1', series(s08, ['lat5450', 'p2425h']));
            await A.signerADistance(ctx, bon, 'lea', 'restitution');
          },
        },
        cloture: { jours: 0, faire: (ctx, bon) => expirerLienEnAttente(ctx, bon, 'pv_cloture') },
      }),

    s('S09', 'Contesté par le collaborateur (contestation ouverte hier)', 'contested',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 20, articles: [numero('iphone15'), numero('targus')] },
      {
        remise: { jours: 20, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'hugo') },
        restitution: { jours: 1, faire: (ctx, bon) => A.contester(ctx, bon, 'hugo', 'mise_disposition', 'La sacoche Targus indiquée sur le bon ne m\'a jamais été remise.') },
      },
      { contestation: { document: 'mise_disposition', issue: null } }),

    s('S10', 'Clôturé normalement (restitution signée au guichet)', 'archived',
      { par: 'tech2', collaborateur: 'sophie', filiale: 'SUD', remiseIlYA: 130, articles: [numero('lat5450'), numero('wd19s'), numero('mxmaster')] },
      {
        remise: { jours: 130, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'sophie') },
        restitution: { jours: 100, faire: (ctx, bon) => A.restitutionPresentielle(ctx, bon, 'tech2', 'sophie') },
      }),

    s('S11', 'Clôturé sans signature (compagnon reparti avant de signer la restitution)', 'archived',
      { par: 'tech2', collaborateur: 'ahmed', filiale: 'SUD', remiseIlYA: 40, articles: [numero('a55'), numero('targus')] },
      {
        remise: { jours: 40, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'ahmed') },
        cloture: {
          jours: 0,
          faire: async (ctx, bon) => {
            await A.restitutionPresentielle(ctx, bon, 'tech2', 'ahmed', { signer: false });
            await A.cloturerSansSignature(ctx, bon, 'tech2', 'Le collaborateur est reparti sur chantier avant de signer ; matériel contrôlé et remis en stock.');
          },
        },
      },
      { documents: ['cloture_sans_signature'] }),

    s('S12', 'Collaborateur parti (compte désactivé) qui détient encore du matériel', 'active',
      { par: 'tech1', collaborateur: 'paul', filiale: 'NORD', remiseIlYA: 200, articles: [numero('lat5450'), numero('a55'), numero('targus')] },
      {
        remise: { jours: 200, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 199, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'paul', 'mise_disposition') },
      }),

    s('S13', 'Collaboratrice mutée de Sud à Est : son bon reste sur la filiale Sud', 'active',
      { par: 'tech2', collaborateur: 'sophie', filiale: 'SUD', remiseIlYA: 75, articles: [numero('mba13'), numero('lg27')] },
      {
        remise: { jours: 75, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech2') },
        'signature-remise': { jours: 74, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'sophie', 'mise_disposition') },
      }),

    s('S14', 'Annulé après envoi (email d\'annulation parti)', 'cancelled',
      { par: 'tech1', collaborateur: 'camille', filiale: 'NORD', remiseIlYA: 6, articles: [numero('p2425h'), numero('ms116')] },
      {
        remise: { jours: 6, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 5, faire: (ctx, bon) => A.annuler(ctx, bon, 'tech1', 'Embauche annulée : la collaboratrice ne rejoint finalement pas le service.') },
      }),

    s('S15', 'Clôturé avec PV signé, puis équipement retrouvé (avenant)', 'archived',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 150, articles: s15 },
      {
        remise: { jours: 150, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'hugo') },
        restitution: {
          jours: 140,
          faire: async (ctx, bon) => {
            await A.declarerNonRestitue(ctx, bon, 'tech2', series(s15, ['a55']), 'Téléphone introuvable au moment du retour.');
            await A.restitutionPresentielle(ctx, bon, 'tech2', 'hugo');
            await A.signerADistance(ctx, bon, 'hugo', 'pv_cloture');
          },
        },
        cloture: { jours: 0, faire: (ctx, bon) => A.marquerRetrouve(ctx, bon, 'tech2', series(s15, ['a55'])) },
      }),

    s('S16', 'En cours, date de restitution prévue dépassée de 5 jours', 'active',
      { par: 'tech1', collaborateur: 'nicolas', filiale: 'NORD', remiseIlYA: 60, restitutionPrevue: -5, articles: [numero('t14'), numero('p2425h'), numero('mxkeys')] },
      { remise: { jours: 60, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech1', 'nicolas') } }),

    s('S17', 'Restitution partielle demandée, pas encore signée', 'partially_returned',
      { par: 'tech2', collaborateur: 'manon', filiale: 'SUD', remiseIlYA: 80, articles: s17 },
      {
        remise: { jours: 80, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'manon') },
        restitution: { jours: 1, faire: (ctx, bon) => A.demanderRestitution(ctx, bon, 'tech2', series(s17, ['lg27'])) },
      }),

    s('S18', 'Perte déclarée, les autres équipements sont encore chez le collaborateur', 'partially_returned',
      { par: 'tech2', collaborateur: 'lucas', filiale: 'SUD', remiseIlYA: 100, articles: s18 },
      {
        remise: { jours: 100, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'lucas') },
        cloture: { jours: 0, faire: (ctx, bon) => A.declarerNonRestitue(ctx, bon, 'tech2', series(s18, ['jabra']), 'Casque cassé sur chantier et jeté par le collaborateur.') },
      }),

    s('S19', 'Brouillon d\'un collaborateur à l\'adresse invalide (envoi par email impossible)', 'draft',
      { par: 'tech1', collaborateur: 'karim', filiale: 'NORD', remiseIlYA: -1, articles: [numero('lat5450'), numero('mxmaster')] },
      { remise: { jours: 2, faire: async () => {} } }),

    s('S20', 'En cours : remise constatée sans signature', 'active',
      { par: 'tech2', collaborateur: 'mathis', filiale: 'EST', remiseIlYA: 12, articles: [numero('a55'), numero('targus')] },
      {
        remise: { jours: 12, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'mathis', { signer: false }) },
        cloture: { jours: 0, faire: (ctx, bon) => A.constaterRemiseSansSignature(ctx, bon, 'tech2', 'Remise faite sur le chantier de Colmar ; le collaborateur n\'a pas pu signer (tablette hors service).') },
      },
      { documents: ['remise_sans_signature'] }),

    s('S21', 'Contestation de la remise ouverte depuis 12 jours, jamais prise en charge (en retard)', 'contested',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 40, articles: [numero('lg27'), numero('usbc')] },
      {
        remise: { jours: 40, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 39, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'mise_disposition') },
        restitution: { jours: 12, faire: (ctx, bon) => A.contester(ctx, bon, 'lea', 'mise_disposition', 'Le numéro de série de l\'écran ne correspond pas à celui de l\'étiquette.') },
      },
      { contestation: { document: 'mise_disposition', issue: null }, contestationEnRetard: true }),

    s('S22', 'En cours, collaborateur à l\'adresse invalide (remise signée au guichet)', 'active',
      { par: 'tech1', collaborateur: 'karim', filiale: 'NORD', remiseIlYA: 25, articles: [numero('iphone15')] },
      { remise: { jours: 25, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech1', 'karim') } }),

    // ── Situations de la vague 2 ─────────────────────────────────────────
    s('S23', 'Remise envoyée puis modifiée : lien invalidé, nouvelle signature IT et nouvel envoi à faire', 'sent_mise_dispo',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 4, articles: [numero('elitemini'), numero('p2425h'), numero('ms116')] },
      {
        remise: { jours: 4, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech2') },
        'signature-remise': { jours: 3, faire: (ctx, bon) => A.modifierBon(ctx, bon, 'tech2', { dateRestitution: A.dateDecalee(90) }) },
      },
      { lienInvalide: { type: 'mise_disposition', motif: 'modified' } }),

    s('S24', 'Contestation Fondée sur une remise : un bon remplaçant attend en brouillon', 'active',
      { par: 'tech2', collaborateur: 'hugo', filiale: 'EST', remiseIlYA: 30, articles: [numero('t14'), numero('wd19s'), numero('lg27')] },
      {
        remise: { jours: 30, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech2', 'hugo') },
        restitution: { jours: 3, faire: (ctx, bon) => A.contester(ctx, bon, 'hugo', 'mise_disposition', 'On m\'a remis un écran Dell 24 pouces, pas l\'écran LG 27 pouces inscrit sur le bon.') },
        cloture: {
          jours: 0,
          faire: async (ctx, bon) => {
            const { replacementBon } = await A.trancherContestation(ctx, bon, 'tech2', 'founded', 'Vous avez raison : un bon corrigé va vous être envoyé à signer.');
            if (!replacementBon) throw new Error('Contestation Fondée sur une remise sans bon remplaçant');
          },
        },
      },
      { contestation: { document: 'mise_disposition', issue: 'founded' }, remplacant: true }),

    s('S25', 'Contestation Fondée sur une restitution : le bon est rouvert pour correction', 'sent_restitution',
      { par: 'tech1', collaborateur: 'lea', filiale: 'NORD', remiseIlYA: 50, articles: [numero('lat5450'), numero('mxmaster'), numero('jabra')] },
      {
        remise: { jours: 50, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech1') },
        'signature-remise': { jours: 49, faire: (ctx, bon) => A.signerADistance(ctx, bon, 'lea', 'mise_disposition') },
        restitution: { jours: 6, faire: async (ctx, bon) => A.demanderRestitution(ctx, bon, 'tech1', await A.seriesDuBon(ctx, bon.id)) },
        'signature-restitution': { jours: 5, faire: (ctx, bon) => A.contester(ctx, bon, 'lea', 'restitution', 'Je n\'ai jamais rendu le casque : je l\'ai encore, il m\'a été laissé pour le télétravail.') },
        cloture: {
          jours: 0,
          faire: async (ctx, bon) => {
            const { reopenedDocument } = await A.trancherContestation(ctx, bon, 'tech1', 'founded', 'Vous avez raison : la restitution va être corrigée puis vous sera renvoyée à signer.');
            if (reopenedDocument !== 'restitution') throw new Error(`Restitution Fondée : document rouvert « ${reopenedDocument} »`);
          },
        },
      },
      { contestation: { document: 'restitution', issue: 'founded' }, lienInvalide: { type: 'restitution', motif: 'contested' } }),

    s('S26', 'Lien de remise expiré : la collaboratrice a demandé un nouveau lien', 'sent_mise_dispo',
      { par: 'tech2', collaborateur: 'sophie', filiale: 'SUD', remiseIlYA: 12, articles: [numero('iphone15'), numero('usbc')] },
      {
        remise: { jours: 12, faire: (ctx, bon) => A.envoyer(ctx, bon, 'tech2') },
        cloture: {
          jours: 0,
          faire: async (ctx, bon) => {
            await expirerLienEnAttente(ctx, bon, 'mise_disposition');
            await A.demanderNouveauLien(ctx, bon, 'sophie');
          },
        },
      },
      { lienRedemande: true }),

    s('S27', 'Clôturé ; civilité (Madame) retenue sur le compte : un nouveau bon la propose d\'office', 'archived',
      { par: 'tech1', collaborateur: 'emilie', filiale: 'NORD', remiseIlYA: 90, articles: [numero('mba13'), numero('usbc')] },
      {
        remise: { jours: 90, faire: (ctx, bon) => A.remisePresentielle(ctx, bon, 'tech1', 'emilie') },
        restitution: { jours: 60, faire: (ctx, bon) => A.restitutionPresentielle(ctx, bon, 'tech1', 'emilie') },
      },
      { civilite: { collaborateur: 'emilie', valeur: 'mme' } }),
  ];
}

module.exports = { situations };
