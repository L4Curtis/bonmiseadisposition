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
 * Ce test charge les fichiers dans l'ordre défavorable, avec un registre de
 * modules isolé, et vérifie que les métadonnées de constructeur ne contiennent
 * aucun `undefined`.
 */
import 'reflect-metadata';

describe('Import order signature.service → bons.service', () => {
  it('BonsService constructor metadata has no undefined parameter when signature.service is loaded first', () => {
    jest.isolateModules(() => {
      // Ordre défavorable : signature.service en premier.
      require('../signature/signature.service');
      const { BonsService } = require('../bons/bons.service');
      const paramTypes: unknown[] = Reflect.getMetadata('design:paramtypes', BonsService) ?? [];
      expect(paramTypes.length).toBeGreaterThan(0);
      const undefinedIndexes = paramTypes
        .map((t, i) => (t === undefined ? i : -1))
        .filter((i) => i >= 0);
      expect(undefinedIndexes).toEqual([]);
    });
  });

  it('SignatureService constructor metadata has no undefined parameter when bons.service is loaded first', () => {
    jest.isolateModules(() => {
      require('../bons/bons.service');
      const { SignatureService } = require('../signature/signature.service');
      const paramTypes: unknown[] = Reflect.getMetadata('design:paramtypes', SignatureService) ?? [];
      expect(paramTypes.length).toBeGreaterThan(0);
      const undefinedIndexes = paramTypes
        .map((t, i) => (t === undefined ? i : -1))
        .filter((i) => i >= 0);
      expect(undefinedIndexes).toEqual([]);
    });
  });
});
