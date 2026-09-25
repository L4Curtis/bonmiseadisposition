'use strict';
/**
 * Déroulé des scénarios en cinq phases communes, puis « voyage dans le
 * temps » à la fin de chaque phase.
 *
 * Pourquoi des phases communes : chaque action passe par l'API réelle, donc
 * à l'heure réelle. Pour obtenir un historique étalé sur six mois, on
 * recule ensuite les dates de ce que chaque bon a fait pendant la phase, du
 * nombre de jours voulu par son scénario. En regroupant les actions par
 * phase, toutes les lignes créées pendant une phase appartiennent à une même
 * fenêtre de temps connue, et chaque bon garde une chronologie cohérente
 * (remise, puis signature, puis restitution…).
 *
 * Après chaque décalage, les documents PDF produits pendant la phase sont
 * régénérés par l'application elle-même (ils impriment les dates des
 * signatures) et les signatures sont rescellées (voir conteneur/decaler-temps.cjs).
 * Un bon qui agit dans une phase est donc décalé AVANT les phases suivantes :
 * les documents qu'elles produisent lisent des dates déjà reculées.
 */
const path = require('node:path');
const { creerBon, regenererPdfManquants } = require('../lib/actions.cjs');
const { attendreCalme } = require('../lib/mailpit.cjs');
const { heureBase, scriptBackend } = require('../lib/docker.cjs');

const PHASES = Object.freeze(['remise', 'signature-remise', 'restitution', 'signature-restitution', 'cloture']);
const SCRIPT_DECALAGE = path.resolve(__dirname, '..', 'conteneur', 'decaler-temps.cjs');
/** En deçà (2,4 h), le recul risquerait de chevaucher la fenêtre de la phase elle-même. */
const RECUL_MINIMAL_JOURS = 0.1;

/** Vérifie la forme des scénarios avant de toucher à quoi que ce soit. */
function valider(scenarios) {
  const cles = new Set();
  for (const s of scenarios) {
    if (cles.has(s.cle)) throw new Error(`Scénario en double : ${s.cle}`);
    cles.add(s.cle);
    const inconnues = Object.keys(s.etapes).filter((p) => !PHASES.includes(p));
    if (inconnues.length > 0) throw new Error(`${s.cle} : phase(s) inconnue(s) ${inconnues.join(', ')}`);
    let precedent = Infinity;
    for (const phase of PHASES.filter((p) => s.etapes[p])) {
      const { jours } = s.etapes[phase];
      if (!(jours === 0 || jours >= RECUL_MINIMAL_JOURS)) throw new Error(`${s.cle}/${phase} : recul invalide (${jours} j)`);
      if (jours > precedent) throw new Error(`${s.cle}/${phase} : une étape ne peut pas précéder la précédente (${jours} j > ${precedent} j)`);
      precedent = jours;
    }
  }
}

/** Recul applicable à un bon pour une phase : celui de sa dernière étape jouée jusque-là. */
function recul(scenario, phaseCourante) {
  let jours = 0;
  for (const phase of PHASES.slice(0, PHASES.indexOf(phaseCourante) + 1)) {
    if (scenario.etapes[phase]) jours = scenario.etapes[phase].jours;
  }
  return jours;
}

/**
 * Recule les lignes de la fenêtre [debut, fin] des bons du plan, fait
 * régénérer par l'application les PDF concernés, puis recule aussi ces
 * nouveaux documents.
 */
async function voyagerDansLeTemps(ctx, debut, fin, plan) {
  if (plan.length === 0) return [];
  const { purges, echeances } = scriptBackend(SCRIPT_DECALAGE, { debut, fin, bons: plan, purger: true, typesAttendus: null });
  const regeneres = plan.filter((p) => purges[p.bonId]);
  if (regeneres.length === 0) return echeances;
  const attendus = Object.values(purges).reduce((n, types) => n + types.length, 0);
  const bilan = await regenererPdfManquants(ctx);
  if (bilan.failed > 0 || bilan.regenerated !== attendus) {
    throw new Error(`Régénération des PDF : ${bilan.regenerated}/${attendus} régénéré(s), ${bilan.failed} échec(s)`);
  }
  scriptBackend(SCRIPT_DECALAGE, { debut: fin, fin: null, bons: regeneres, purger: false, typesAttendus: purges });
  return echeances;
}

async function jouerPhase(ctx, scenarios, phase) {
  for (const s of scenarios) {
    const etape = s.etapes[phase];
    if (!etape) continue;
    try {
      if (!ctx.bons.has(s.cle)) ctx.bons.set(s.cle, await creerBon(ctx, s.bon));
      await etape.faire(ctx, ctx.bons.get(s.cle));
    } catch (err) {
      throw new Error(`${s.cle} (${s.situation}), phase « ${phase} » : ${err.message}`);
    }
  }
}

/**
 * Joue toutes les phases. `finDePhase(phase)` permet d'ajouter les
 * événements hors API d'une phase (départ, mutation) avant le décalage.
 */
async function executerPhases(ctx, scenarios, { journal, finDePhase }) {
  valider(scenarios);
  const echeances = [];
  for (const phase of PHASES) {
    const debutChrono = Date.now();
    const debut = heureBase();
    await jouerPhase(ctx, scenarios, phase);
    if (finDePhase) await finDePhase(phase);
    await attendreCalme();
    const fin = heureBase();
    const plan = scenarios
      .filter((s) => ctx.bons.has(s.cle))
      .map((s) => ({ bonId: ctx.bons.get(s.cle).id, jours: recul(s, phase) }))
      .filter((p) => p.jours > 0);
    echeances.push(...(await voyagerDansLeTemps(ctx, debut, fin, plan)));
    journal(`  phase « ${phase} » : ${Math.round((Date.now() - debutChrono) / 1000)} s`);
  }
  // Les liens n'ont plus à servir : leur échéance rejoint enfin leur date de création.
  if (echeances.length > 0) scriptBackend(SCRIPT_DECALAGE, { mode: 'echeances', echeances });
}

module.exports = { PHASES, executerPhases, valider };
