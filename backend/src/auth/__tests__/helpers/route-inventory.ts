/**
 * Inventaire des routes HTTP de l'application, lu dans les métadonnées Nest
 * (modules → contrôleurs → méthodes) sans instancier aucun service : ni base
 * de données, ni variable d'environnement, ni effet de bord.
 *
 * On part du module racine et on suit ses `imports` (modules statiques,
 * dynamiques et `forwardRef`) : une route n'apparaît donc ici que si son
 * contrôleur est réellement enregistré dans l'application.
 */
import { DynamicModule, ForwardReference, RequestMethod, Type } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, MODULE_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../decorators/public.decorator';
import { accessDeclarationFault } from '../../guards/access-declaration.guard';

/** Préfixe global posé par main.ts (`app.setGlobalPrefix('api')`). */
export const GLOBAL_PREFIX = 'api';

export interface RouteAccess {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
  readonly isPublic: boolean;
  readonly roles: readonly string[];
  readonly guards: readonly string[];
  /** Verdict du filet d'exécution (AccessDeclarationGuard) : `null` si la route passe. */
  readonly fault: string | null;
}

type ModuleEntry = Type | DynamicModule | ForwardReference;

function isForwardReference(entry: object): entry is ForwardReference {
  return 'forwardRef' in entry;
}

function isDynamicModule(entry: object): entry is DynamicModule {
  return 'module' in entry;
}

function metadataList<T>(key: string, target: object): T[] {
  return (Reflect.getMetadata(key, target) as T[] | undefined) ?? [];
}

/** Parcourt le graphe de modules et renvoie chaque contrôleur une seule fois. */
export function collectControllers(root: Type): Type[] {
  const visited = new Set<unknown>();
  const controllers = new Set<Type>();

  const visit = (entry: ModuleEntry | undefined): void => {
    if (!entry || visited.has(entry)) return;
    visited.add(entry);
    if (typeof entry === 'object' && 'then' in entry) {
      // Un module asynchrone ignoré ferait disparaître ses routes sans bruit.
      throw new Error('Module asynchrone non pris en charge par l’inventaire des routes');
    }
    if (typeof entry === 'object' && isForwardReference(entry)) {
      visit(entry.forwardRef() as ModuleEntry);
      return;
    }
    const dynamic = typeof entry === 'object' && isDynamicModule(entry) ? entry : undefined;
    const moduleClass = dynamic ? dynamic.module : (entry as Type);

    for (const controller of [
      ...metadataList<Type>(MODULE_METADATA.CONTROLLERS, moduleClass),
      ...(dynamic?.controllers ?? []),
    ]) {
      controllers.add(controller);
    }
    for (const imported of [
      ...metadataList<ModuleEntry>(MODULE_METADATA.IMPORTS, moduleClass),
      ...((dynamic?.imports ?? []) as ModuleEntry[]),
    ]) {
      visit(imported);
    }
  };

  visit(root);
  return [...controllers];
}

function toArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return ['/'];
  return Array.isArray(value) ? value : [value];
}

function joinPath(...segments: string[]): string {
  const joined = `/${segments.join('/')}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function guardName(guard: unknown): string {
  if (typeof guard === 'function') return guard.name;
  return (guard as { constructor: { name: string } }).constructor.name;
}

/** Toutes les routes d'un contrôleur, avec leur accès effectif. */
export function describeControllerRoutes(controller: Type, reflector = new Reflector()): RouteAccess[] {
  const prototype = controller.prototype as Record<string, (...args: unknown[]) => unknown>;
  const classGuards = metadataList<unknown>(GUARDS_METADATA, controller).map(guardName);
  const basePaths = toArray(Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined);

  return new MetadataScanner().getAllMethodNames(prototype).flatMap((name) => {
    const handler = prototype[name];
    const routePaths = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
    if (routePaths === undefined) return [];
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod];
    const targets = [handler, controller];
    const roles = reflector.getAllAndOverride<string[] | undefined>(ROLES_KEY, targets) ?? [];
    const isPublic = reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, targets) === true;
    const guards = [...classGuards, ...metadataList<unknown>(GUARDS_METADATA, handler).map(guardName)];
    const fault = accessDeclarationFault(reflector, handler, controller);

    return basePaths.flatMap((base) =>
      toArray(routePaths).map((routePath) => ({
        method,
        path: joinPath(GLOBAL_PREFIX, base, routePath),
        handler: `${controller.name}.${name}`,
        isPublic,
        roles,
        guards,
        fault,
      })),
    );
  });
}

const METHOD_ORDER = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Inventaire complet, trié par chemin puis par verbe (ordre stable pour l'instantané). */
export function inventoryRoutes(root: Type): RouteAccess[] {
  const reflector = new Reflector();
  return collectControllers(root)
    .flatMap((controller) => describeControllerRoutes(controller, reflector))
    .sort((a, b) => a.path.localeCompare(b.path, 'en') || METHOD_ORDER.indexOf(a.method) - METHOD_ORDER.indexOf(b.method));
}
