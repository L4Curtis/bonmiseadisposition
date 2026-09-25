'use strict';
/**
 * Voyage dans le temps d'un ensemble de bons — exécuté DANS le conteneur
 * backend (`docker compose exec -T backend node -`), avec le client Prisma et
 * le code compilé de l'application :
 *
 *   1. (option) purge des documents PDF produits pendant la fenêtre, s'ils
 *      sont régénérables à l'identique par l'application
 *      (POST /admin/pdf/regenerate-missing, appelé ensuite par l'amorçage) ;
 *   2. décalage de TOUTES les dates techniques des lignes du bon comprises
 *      dans la fenêtre [debut, fin] : colonnes horodatées de `bons` et de
 *      toute table portant une colonne `bon_id`, découvertes dans le schéma
 *      (le script suit donc les évolutions du schéma sans modification),
 *      sauf l'échéance des liens de signature, reculée en fin d'amorçage ;
 *   3. nouveau scellement des signatures du bon avec la fonction de
 *      l'application (le sceau couvre la date de signature : sans cela,
 *      l'application signalerait à juste titre une altération).
 *
 * Paramètres (JSON en base64 dans RECETTE_PARAMETRES) :
 *   { debut, fin|null, bons: [{ bonId, jours }], purger, typesAttendus|null }
 *   ou, en fin d'amorçage : { mode: 'echeances', echeances: [{ signatureId, jours }] }
 * Résultat sur la sortie standard : « RESULTAT {json} ».
 */
const { resolve } = require('node:path');

const racine = '/app';
require(require.resolve('reflect-metadata', { paths: [racine] }));
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [racine] }));
const { buildSealPayload } = require(resolve(racine, 'dist/signature/seal.js'));
const { EncryptionService } = require(resolve(racine, 'dist/config/encryption.service.js'));

const IDENTIFIANT_SQL = /^[a-z_][a-z0-9_]*$/;
const TYPES_REGENERABLES_PAR_SIGNATURE = {
  mise_disposition: 'signature_collab_mise_disposition',
  restitution: 'signature_collab_restitution',
  pv_cloture: 'cloture_equipements_manquants',
};

const parametres = JSON.parse(Buffer.from(process.env.RECETTE_PARAMETRES, 'base64').toString('utf8'));
const prisma = new PrismaClient();

function journal(message) {
  process.stderr.write(`${message}\n`);
}

/**
 * Types de PDF que regenerateMissingSnapshots (backend/src/pdf/
 * snapshot-regeneration.ts) sait reconstruire pour ce bon : même règle, y
 * compris la déduction chronologique pour un cachet IT sans pdfType.
 */
async function typesRegenerables(bonId) {
  const signatures = await prisma.signature.findMany({
    where: { bonId, signed: true },
    orderBy: { signedAt: 'asc' },
    select: { type: true, pdfType: true },
  });
  const types = new Set();
  let cachetsIt = 0;
  for (const s of signatures) {
    if (TYPES_REGENERABLES_PAR_SIGNATURE[s.type]) types.add(TYPES_REGENERABLES_PAR_SIGNATURE[s.type]);
    if (s.type !== 'it_cachet') continue;
    cachetsIt += 1;
    const phase = s.pdfType ?? (cachetsIt === 1 ? 'mise_disposition' : 'restitution');
    types.add(phase === 'restitution' ? 'signature_it_restitution' : 'signature_it_mise_disposition');
  }
  return types;
}

/** Aucun document « dû » ne doit manquer ailleurs : la régénération le créerait et masquerait l'état réel. */
async function verifierAucunManquant() {
  const bons = await prisma.bon.findMany({ select: { id: true, reference: true, pdfSnapshots: { select: { type: true } } } });
  const manquants = [];
  for (const bon of bons) {
    const presents = new Set(bon.pdfSnapshots.map((p) => p.type));
    for (const type of await typesRegenerables(bon.id)) {
      if (!presents.has(type)) manquants.push(`${bon.reference}:${type}`);
    }
  }
  if (manquants.length > 0) {
    throw new Error(`Documents déjà manquants avant la régénération (état à ne pas masquer) : ${manquants.join(', ')}`);
  }
}

/** Types de PDF produits pour ce bon pendant la fenêtre (chaque production ajoute une archive probante). */
async function typesProduits(bonId, debut, fin) {
  const archives = await prisma.proofArchive.findMany({
    where: { bonId, createdAt: { gte: debut, lte: fin } },
    select: { type: true },
  });
  return [...new Set(archives.map((a) => a.type))];
}

async function verifierRegenerables(bonId, touches) {
  const regenerables = await typesRegenerables(bonId);
  const refuses = touches.filter((t) => !regenerables.has(t));
  if (refuses.length > 0) {
    throw new Error(
      `Bon ${bonId} : ${refuses.join(', ')} ne peut pas être régénéré — cette étape du scénario doit rester à 0 jour.`,
    );
  }
}

async function purgerDocuments(bon, touches, debut, fin) {
  for (const type of touches) {
    await prisma.pdfSnapshot.deleteMany({ where: { bonId: bon.bonId, type } });
    await prisma.proofArchive.deleteMany({ where: { bonId: bon.bonId, type, createdAt: { gte: debut, lte: fin } } });
    await prisma.auditLog.deleteMany({
      where: {
        bonId: bon.bonId,
        action: 'pdf_snapshot_saved',
        createdAt: { gte: debut, lte: fin },
        details: { path: ['type'], equals: type },
      },
    });
  }
}

/**
 * Purge les PDF produits pendant la fenêtre, seulement s'il y en a : la
 * vérification globale ne s'impose que si l'on s'apprête à régénérer.
 */
async function purgerSiNecessaire(bons, debut, fin) {
  const aPurger = [];
  for (const bon of bons) {
    const touches = await typesProduits(bon.bonId, debut, fin);
    if (touches.length > 0) aPurger.push({ bon, touches });
  }
  if (aPurger.length === 0) return {};
  await verifierAucunManquant();
  for (const { bon, touches } of aPurger) await verifierRegenerables(bon.bonId, touches);
  const purges = {};
  for (const { bon, touches } of aPurger) {
    await purgerDocuments(bon, touches, debut, fin);
    purges[bon.bonId] = touches;
  }
  return purges;
}

/** Colonnes horodatées de `bons` et des tables rattachées à un bon (colonne bon_id). */
async function colonnesHorodatees() {
  const lignes = await prisma.$queryRaw`
    SELECT c.table_name::text AS "table", c.column_name::text AS "colonne"
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.data_type IN ('timestamp without time zone', 'timestamp with time zone')
      AND (c.table_name = 'bons' OR c.table_name IN (
        SELECT k.table_name FROM information_schema.columns k
        WHERE k.table_schema = 'public' AND k.column_name = 'bon_id'))
    ORDER BY 1, 2`;
  const parTable = new Map();
  for (const { table, colonne } of lignes) {
    if (!IDENTIFIANT_SQL.test(table) || !IDENTIFIANT_SQL.test(colonne)) throw new Error(`Identifiant inattendu : ${table}.${colonne}`);
    parTable.set(table, [...(parTable.get(table) ?? []), colonne]);
  }
  return parTable;
}

const DEBUT = `($1::timestamptz AT TIME ZONE 'UTC')`;
const FIN = `($2::timestamptz AT TIME ZONE 'UTC')`;
const DECALAGE = `($3::float8 * interval '1 day')`;

/**
 * L'échéance d'un lien de signature n'est PAS reculée avec le reste : un lien
 * créé dans une phase peut être signé dans une phase suivante, à l'heure
 * réelle ; reculé tout de suite, il serait déjà expiré. Son recul est
 * différé à la fin de l'amorçage (mode « echeances »).
 */
const COLONNES_DIFFEREES = { signatures: ['token_expires_at'] };

/** Requête de recul d'une table, ou null s'il n'y a rien à reculer (toutes ses dates sont différées). */
function requeteDecalage(table, colonnes) {
  const differees = COLONNES_DIFFEREES[table] ?? [];
  const affectations = colonnes
    .filter((c) => !differees.includes(c))
    .map((c) => `"${c}" = CASE WHEN "${c}" BETWEEN ${DEBUT} AND ${FIN} THEN "${c}" - ${DECALAGE} ELSE "${c}" END`);
  if (affectations.length === 0) return null;
  const cle = table === 'bons' ? 'id' : 'bon_id';
  return `UPDATE "${table}" SET ${affectations.join(', ')} WHERE "${cle}" = $4`;
}

/** Liens créés dans la fenêtre (hors liens invalidés, ramenés à l'epoch) : leur échéance sera reculée en fin d'amorçage. */
async function echeancesADifferer(bon, debut, fin) {
  const liens = await prisma.signature.findMany({
    where: { bonId: bon.bonId, createdAt: { gte: debut, lte: fin }, tokenExpiresAt: { gt: new Date(1000) } },
    select: { id: true },
  });
  return liens.map((l) => ({ signatureId: l.id, jours: bon.jours }));
}

async function decaler(bon, debut, fin, colonnes) {
  for (const [table, liste] of colonnes) {
    const requete = requeteDecalage(table, liste);
    if (requete) await prisma.$executeRawUnsafe(requete, debut.toISOString(), fin.toISOString(), bon.jours, bon.bonId);
  }
}

/**
 * Fin d'amorçage : recule enfin l'échéance des liens, du recul de leur date
 * de création. Un lien entre-temps invalidé (epoch) ne bouge pas ; un lien
 * jamais utilisé retrouve l'échéance qu'il aurait eue (S03 : expiré).
 */
async function appliquerEcheances(echeances) {
  for (const { signatureId, jours } of echeances) {
    await prisma.$executeRawUnsafe(
      `UPDATE "signatures" SET "token_expires_at" = "token_expires_at" - ($1::float8 * interval '1 day')
       WHERE "id" = $2 AND "token_expires_at" > to_timestamp(1)`,
      jours,
      signatureId,
    );
  }
  return echeances.length;
}

/**
 * Recalcule le sceau exactement comme l'application : sa propre fonction
 * buildSealPayload (dist/signature/seal.js), à laquelle on passe la ligne
 * entière — un champ ajouté un jour au sceau sous le nom de sa colonne Prisma
 * sera donc pris en compte sans modifier ce script — et sa propre clé
 * (EncryptionService, même ENCRYPTION_KEY que le backend).
 */
async function resceller(bonIds, chiffrement) {
  const signatures = await prisma.signature.findMany({ where: { bonId: { in: bonIds }, seal: { not: null } } });
  let nombre = 0;
  for (const s of signatures) {
    if (!s.signedAt) continue;
    const sceau = chiffrement.seal(buildSealPayload({ ...s, signatureId: s.id }));
    if (sceau !== s.seal) {
      await prisma.signature.update({ where: { id: s.id }, data: { seal: sceau } });
      nombre += 1;
    }
  }
  return nombre;
}

async function verifierTypesPresents(typesAttendus) {
  for (const [bonId, types] of Object.entries(typesAttendus)) {
    const presents = new Set((await prisma.pdfSnapshot.findMany({ where: { bonId }, select: { type: true } })).map((p) => p.type));
    const absents = types.filter((t) => !presents.has(t));
    if (absents.length > 0) throw new Error(`Bon ${bonId} : documents non régénérés (${absents.join(', ')})`);
  }
}

async function decalerFenetre() {
  const debut = new Date(parametres.debut);
  const fin = parametres.fin ? new Date(parametres.fin) : new Date();
  const chiffrement = new EncryptionService();
  chiffrement.onModuleInit();

  const purges = parametres.purger ? await purgerSiNecessaire(parametres.bons, debut, fin) : {};
  const echeances = [];
  for (const bon of parametres.bons) echeances.push(...(await echeancesADifferer(bon, debut, fin)));
  const colonnes = await colonnesHorodatees();
  for (const bon of parametres.bons) await decaler(bon, debut, fin, colonnes);
  const rescelles = await resceller(parametres.bons.map((b) => b.bonId), chiffrement);
  if (parametres.typesAttendus) await verifierTypesPresents(parametres.typesAttendus);
  journal(`${parametres.bons.length} bon(s) décalé(s), ${rescelles} signature(s) rescellée(s)`);
  return { purges, rescelles, echeances };
}

async function principal() {
  const resultat = parametres.mode === 'echeances'
    ? { echeances: await appliquerEcheances(parametres.echeances) }
    : await decalerFenetre();
  process.stdout.write(`RESULTAT ${JSON.stringify(resultat)}\n`);
}

principal()
  .catch((err) => {
    journal(err.stack || String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
