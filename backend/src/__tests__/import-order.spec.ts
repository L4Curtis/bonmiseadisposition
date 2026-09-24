/**
 * Régression : cycle d'import CommonJS entre signature.service et bons.service.
 *
 * En production (dist/), l'ordre de chargement des fichiers dépend de l'ordre
 * des imports d'AppModule. Si signature.service.js est chargé AVANT
 * bons.service.js, le require circulaire fait que SignatureService vaut
 * `undefined` au moment où le décorateur de BonsService enregistre ses
 * paramètres de constructeur → « Nest can't resolve dependencies of the
 * BonsService (PrismaService, ?, …) » au démarrage.
 *
 * Ce test charge les fichiers dans l'ordre défavorable, dans un processus Node
 * neuf et avec la chaîne de compilation de la production (voir
 * test/helpers/production-load-report.cjs), et vérifie que les métadonnées de
 * constructeur ne contiennent aucun `undefined`.
 */
import * as path from 'path';
import { loadLikeProduction } from '../../test/helpers/production-load-report';

const SIGNATURE_SERVICE = path.resolve(__dirname, '../signature/signature.service.ts');
const BONS_SERVICE = path.resolve(__dirname, '../bons/bons.service.ts');
// Chaque cas transpile et charge une bonne partie de l'application dans un
// processus neuf : délai propre, au-delà du délai global de la suite.
const LOAD_TIMEOUT_MS = 120_000;

describe('Import order signature.service → bons.service', () => {
  it('BonsService constructor metadata has no undefined parameter when signature.service is loaded first', () => {
    // Ordre défavorable : signature.service en premier.
    const report = loadLikeProduction([SIGNATURE_SERVICE, BONS_SERVICE]);
    const bonsService = report[BONS_SERVICE].BonsService;
    expect(bonsService).toBeDefined();
    expect(bonsService.paramCount).toBeGreaterThan(0);
    expect(bonsService.undefinedIndexes).toEqual([]);
  }, LOAD_TIMEOUT_MS);

  it('SignatureService constructor metadata has no undefined parameter when bons.service is loaded first', () => {
    const report = loadLikeProduction([BONS_SERVICE, SIGNATURE_SERVICE]);
    const signatureService = report[SIGNATURE_SERVICE].SignatureService;
    expect(signatureService).toBeDefined();
    expect(signatureService.paramCount).toBeGreaterThan(0);
    expect(signatureService.undefinedIndexes).toEqual([]);
  }, LOAD_TIMEOUT_MS);
});
