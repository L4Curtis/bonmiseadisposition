/**
 * Doublure de test pour `@nestjs/common/utils/load-package.util.js`.
 *
 * Depuis NestJS 12, ce fichier est un module ESM pur, et la branche de
 * secours synchrone de `loadPackageSync` utilise `createRequire(import.meta
 * .url)`. `import.meta` est un jeton syntaxiquement invalide en dehors d'un
 * vrai module ES : même transpilé vers CommonJS par ts-jest, il ne peut pas
 * être « abaissé » automatiquement, et jest-runtime — qui exécute tout en
 * CommonJS, contrairement à Node 22 qui sait faire require(esm) — échoue au
 * chargement du fichier avant même d'exécuter la moindre ligne.
 *
 * En production, `node dist/main.js` charge le vrai fichier ESM de
 * @nestjs/common via le require(esm) de Node 22 : cette doublure ne
 * concerne que l'environnement Jest (voir jest.config.js, moduleNameMapper).
 * On reproduit fidèlement le comportement d'origine (cache par nom de
 * paquet, message explicite puis arrêt du process si le paquet est
 * manquant) avec un require() CommonJS classique à la place de
 * createRequire(import.meta.url).
 */

type PackageModule = unknown;
type SyncLoader = () => PackageModule;
type AsyncLoader = () => Promise<PackageModule>;

const packageCache = new Map<string, PackageModule>();

function missingDependencyMessage(packageName: string, reason: string): string {
  return `The "${packageName}" package is missing. Please, make sure to install it to use ${reason}.`;
}

export async function loadPackage(
  packageName: string,
  context: string,
  loaderFn?: AsyncLoader,
): Promise<PackageModule> {
  const cached = packageCache.get(packageName);
  if (cached) return cached;

  try {
    const pkg = loaderFn ? await loaderFn() : await import(packageName);
    packageCache.set(packageName, pkg);
    return pkg;
  } catch {
    process.stderr.write(`${missingDependencyMessage(packageName, context)}\n`);
    process.exit(1);
  }
}

export function loadPackageSync(
  packageName: string,
  context: string,
  loaderFn?: SyncLoader,
): PackageModule {
  const cached = packageCache.get(packageName);
  if (cached) return cached;

  try {
    const pkg = loaderFn ? loaderFn() : require(packageName);
    packageCache.set(packageName, pkg);
    return pkg;
  } catch {
    process.stderr.write(`${missingDependencyMessage(packageName, context)}\n`);
    process.exit(1);
  }
}

export function loadPackageCached(packageName: string, context?: string): PackageModule {
  const cached = packageCache.get(packageName);
  if (cached) return cached;

  if (context) {
    // Le paquet n'a pas été préchargé (typiquement parce qu'il n'est pas
    // installé). On retombe sur un chargement synchrone pour que l'appelant
    // obtienne le message « package manquant » plutôt qu'une erreur interne.
    return loadPackageSync(packageName, context);
  }

  throw new Error(
    `Package "${packageName}" has not been loaded yet. ` +
      `Ensure loadPackage("${packageName}", ...) has been awaited before calling loadPackageCached.`,
  );
}

export async function tryLoadPackage(
  packageName: string,
  loaderFn?: AsyncLoader,
): Promise<PackageModule | null> {
  const cached = packageCache.get(packageName);
  if (cached) return cached;

  try {
    const pkg = loaderFn ? await loaderFn() : await import(packageName);
    packageCache.set(packageName, pkg);
    return pkg;
  } catch {
    return null;
  }
}
