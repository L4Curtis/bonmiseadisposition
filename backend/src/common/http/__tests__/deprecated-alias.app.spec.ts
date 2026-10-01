/**
 * Alias dépréciés de TOUTE l'application, relevés comme au démarrage : la
 * liste est comparée à `__snapshots__/deprecated-aliases.md`, versionné, pour
 * que l'ajout ou le retrait d'un alias se voie en revue. Après un changement
 * voulu : `npx vitest run src/common/http/__tests__/deprecated-alias.app.spec.ts -u`
 *
 * Un alias incohérent (paramètres différents, ancien chemin encore déclaré)
 * fait échouer ce test, comme il empêcherait le serveur de démarrer.
 */
import { AppModule } from '../../../app.module';
import { collectControllers } from '../../../auth/__tests__/helpers/route-inventory';
import { API_PREFIX } from '../../../bootstrap/configure-app';
import { collectDeprecatedAliases } from '../deprecated-alias';

describe('Alias dépréciés de l’application', () => {
  const aliases = collectDeprecatedAliases(collectControllers(AppModule), API_PREFIX);

  it('sont cohérents et listés dans l’instantané versionné', async () => {
    const lines = aliases
      .map((a) => `| ${a.method} ${a.path} | ${a.successorMethod} ${a.successorPath} | ${a.handler} |`)
      .sort((a, b) => a.localeCompare(b, 'en'));
    const table = [
      '# Alias dépréciés',
      '',
      'Généré par `backend/src/common/http/__tests__/deprecated-alias.app.spec.ts` : ne pas modifier à la main.',
      'Chaque ancien chemin est servi par le nouveau handler, avec `Deprecation: true` et `Link`.',
      '',
      '| Ancien chemin | Nouveau chemin | Méthode |',
      '|---|---|---|',
      ...lines,
      '',
    ].join('\n');
    await expect(table).toMatchFileSnapshot('__snapshots__/deprecated-aliases.md');
  });

  it('servent l’ancien chemin de l’historique d’un équipement (démonstration du mécanisme)', () => {
    expect(aliases).toContainEqual(
      expect.objectContaining({
        method: 'GET',
        path: '/api/equipment/serial-history',
        successorPath: '/api/equipment/history',
      }),
    );
  });
});
