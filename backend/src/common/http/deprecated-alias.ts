/**
 * Alias dépréciés : un ancien chemin d'API reste servi, le temps qu'aucun
 * onglet ouvert sur l'ancienne version ne l'appelle plus, par EXACTEMENT le
 * même traitement que le nouveau (mêmes gardes, mêmes droits, même
 * validation, même réponse).
 *
 * On le déclare sur le NOUVEAU handler :
 *
 *   @Patch(':id/role')                              // UsersController → PATCH /users/:id/role
 *   @DeprecatedAlias('PATCH /admin/users/:id/role') // ancien chemin, sans /api
 *   changeRole(...) {}
 *
 * Au démarrage, `configureApp` relève ces déclarations dans tous les
 * contrôleurs et pose un middleware qui, avant le routage, réécrit l'ancien
 * chemin vers le nouveau (paramètres et requête recopiés, verbe changé si
 * besoin : `DELETE /bons/:id` → `POST /bons/:id/cancel`). La réponse porte
 * `Deprecation: true` et `Link: </api/nouveau>; rel="successor-version"`, et
 * les appels sont journalisés (avertissement « Ancien chemin d'API appelé »,
 * au plus un message par alias et par heure, avec le nombre d'appels) pour
 * savoir quand l'alias peut être retiré.
 *
 * Le middleware est posé AVANT la protection CSRF : celle-ci juge ainsi le
 * verbe réellement servi (un ancien GET réécrit en POST reste protégé).
 *
 * L'ancien chemin ne doit plus être déclaré par aucun contrôleur : le
 * relevé refuse de démarrer sinon (deux traitements pour un même chemin).
 */
import { RequestMethod, SetMetadata, Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { MetadataScanner } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';

export const DEPRECATED_ALIASES_KEY = 'api:deprecated-aliases';

const HTTP_VERBS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
type HttpVerb = (typeof HTTP_VERBS)[number];

/**
 * Déclare un ou plusieurs anciens chemins du handler, au format
 * « VERBE /chemin » (« GET /equipment/serial-history ») ou « /chemin » (même
 * verbe que le handler). Chemin sans le préfixe `/api`, paramètres `:nom`
 * identiques à ceux du nouveau chemin.
 */
export function DeprecatedAlias(...oldRoutes: string[]): MethodDecorator {
  return SetMetadata(DEPRECATED_ALIASES_KEY, oldRoutes);
}

/** Un alias prêt à servir. */
export interface DeprecatedAliasRoute {
  readonly method: HttpVerb;
  /** Ancien chemin complet, avec préfixe (« /api/equipment/serial-history »). */
  readonly path: string;
  readonly successorMethod: HttpVerb;
  /** Nouveau chemin complet, avec préfixe. */
  readonly successorPath: string;
  readonly handler: string;
}

interface DeclaredRoute {
  readonly method: HttpVerb;
  readonly path: string;
}

function joinPath(...segments: string[]): string {
  const joined = `/${segments.join('/')}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}

function firstPath(value: string | string[] | undefined): string {
  if (value === undefined) return '/';
  return Array.isArray(value) ? value[0] : value;
}

function paramNames(path: string): string[] {
  return path.split('/').filter((s) => s.startsWith(':')).map((s) => s.slice(1)).sort();
}

function parseOldRoute(declaration: string, defaultMethod: HttpVerb, prefix: string, handler: string): DeclaredRoute {
  const match = /^(?:([A-Z]+)\s+)?(\/\S*)$/.exec(declaration.trim());
  const verb = (match?.[1] ?? defaultMethod) as HttpVerb;
  if (!match || !HTTP_VERBS.includes(verb)) {
    throw new Error(`Alias déprécié « ${declaration} » mal formé sur ${handler} : « VERBE /chemin » attendu`);
  }
  return { method: verb, path: joinPath(prefix, match[2]) };
}

/** Routes réellement déclarées et alias, pour un contrôleur. */
function scanController(controller: Type, prefix: string): { routes: DeclaredRoute[]; aliases: DeprecatedAliasRoute[] } {
  const prototype = controller.prototype as Record<string, object>;
  const base = firstPath(Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined);
  const routes: DeclaredRoute[] = [];
  const aliases: DeprecatedAliasRoute[] = [];
  for (const name of new MetadataScanner().getAllMethodNames(prototype)) {
    const target = prototype[name];
    const routePaths = Reflect.getMetadata(PATH_METADATA, target) as string | string[] | undefined;
    if (routePaths === undefined) continue;
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, target) as RequestMethod] as HttpVerb;
    const allPaths = Array.isArray(routePaths) ? routePaths : [routePaths];
    routes.push(...allPaths.map((p) => ({ method, path: joinPath(prefix, base, p) })));
    const declarations = (Reflect.getMetadata(DEPRECATED_ALIASES_KEY, target) as string[] | undefined) ?? [];
    const successorPath = joinPath(prefix, base, allPaths[0]);
    const handler = `${controller.name}.${name}`;
    for (const declaration of declarations) {
      const old = parseOldRoute(declaration, method, prefix, handler);
      aliases.push({ method: old.method, path: old.path, successorMethod: method, successorPath, handler });
    }
  }
  return { routes, aliases };
}

function assertConsistent(alias: DeprecatedAliasRoute, routes: readonly DeclaredRoute[]): void {
  if (paramNames(alias.path).join(',') !== paramNames(alias.successorPath).join(',')) {
    throw new Error(
      `Alias déprécié ${alias.method} ${alias.path} (${alias.handler}) : ses paramètres doivent être ceux de ${alias.successorPath}`,
    );
  }
  if (routes.some((r) => r.method === alias.method && r.path === alias.path)) {
    throw new Error(
      `Alias déprécié ${alias.method} ${alias.path} (${alias.handler}) : ce chemin est encore déclaré par un contrôleur`,
    );
  }
}

/** Relève les alias de tous les contrôleurs et vérifie leur cohérence. */
export function collectDeprecatedAliases(controllers: readonly Type[], globalPrefix: string): DeprecatedAliasRoute[] {
  const scanned = controllers.map((controller) => scanController(controller, globalPrefix));
  const routes = scanned.flatMap((s) => s.routes);
  const aliases = scanned.flatMap((s) => s.aliases);
  aliases.forEach((alias) => assertConsistent(alias, routes));
  const keys = aliases.map((a) => `${a.method} ${a.path}`);
  const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
  if (duplicate) throw new Error(`Alias déprécié déclaré deux fois : ${duplicate}`);
  return aliases;
}

interface CompiledAlias extends DeprecatedAliasRoute {
  readonly matcher: RegExp;
  readonly names: readonly string[];
}

function compile(alias: DeprecatedAliasRoute): CompiledAlias {
  const names: string[] = [];
  const pattern = alias.path
    .split('/')
    .map((segment) => {
      if (!segment.startsWith(':')) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(segment.slice(1));
      return '([^/]+)';
    })
    .join('/');
  return { ...alias, matcher: new RegExp(`^${pattern}/?$`), names };
}

/** Nouveau chemin d'une requête qui vise un alias, `undefined` sinon. */
function resolveDeprecatedAlias(
  aliases: readonly CompiledAlias[],
  method: string,
  path: string,
): { alias: DeprecatedAliasRoute; successorPath: string } | undefined {
  for (const alias of aliases) {
    if (alias.method !== method) continue;
    const match = alias.matcher.exec(path);
    if (!match) continue;
    const values = new Map(alias.names.map((name, index) => [name, match[index + 1]]));
    const successorPath = alias.successorPath
      .split('/')
      .map((segment) => (segment.startsWith(':') ? values.get(segment.slice(1)) ?? segment : segment))
      .join('/');
    return { alias, successorPath };
  }
  return undefined;
}

export interface AliasLogger {
  warn(message: string): void;
}

export interface AliasLogOptions {
  /** Intervalle minimal entre deux messages pour un même alias (1 h par défaut). */
  readonly intervalMs?: number;
  /** Horloge, remplaçable en test. */
  readonly now?: () => number;
}

const DEFAULT_ALIAS_LOG_INTERVAL_MS = 60 * 60 * 1000;
const USER_AGENT_MAX_LENGTH = 200;

/** User-agent tel qu'il peut entrer au journal : sans caractère de contrôle
 *  (un retour à la ligne forgerait une fausse ligne de journal), tronqué. */
function printableUserAgent(value: string | undefined): string {
  if (!value) return 'inconnu';
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return clean.length > USER_AGENT_MAX_LENGTH ? `${clean.slice(0, USER_AGENT_MAX_LENGTH)}…` : clean || 'inconnu';
}

/**
 * Journal des appels aux alias, sans l'inonder : le premier appel d'un alias
 * est écrit tout de suite, les suivants sont comptés et résumés au plus une
 * fois par intervalle (« 42 appels depuis le précédent message »). Un écran
 * resté ouvert qui interroge un ancien chemin toutes les minutes produit
 * ainsi un message par heure, pas soixante.
 */
function throttledAliasLog(logger: AliasLogger, options: AliasLogOptions) {
  const intervalMs = options.intervalMs ?? DEFAULT_ALIAS_LOG_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const state = new Map<string, { lastLoggedAt: number; skipped: number }>();
  return (key: string, message: string): void => {
    const time = now();
    const previous = state.get(key);
    if (previous && time - previous.lastLoggedAt < intervalMs) {
      state.set(key, { ...previous, skipped: previous.skipped + 1 });
      return;
    }
    const suffix = previous && previous.skipped > 0 ? ` — ${previous.skipped + 1} appels depuis le précédent message` : '';
    state.set(key, { lastLoggedAt: time, skipped: 0 });
    logger.warn(message + suffix);
  };
}

/** Middleware Express qui sert les anciens chemins par le nouveau traitement. */
export function deprecatedAliasMiddleware(
  aliases: readonly DeprecatedAliasRoute[],
  logger: AliasLogger,
  logOptions: AliasLogOptions = {},
) {
  const compiled = aliases.map(compile);
  const log = throttledAliasLog(logger, logOptions);
  return (req: Request, res: Response, next: NextFunction): void => {
    const resolved = compiled.length > 0 ? resolveDeprecatedAlias(compiled, req.method, req.path) : undefined;
    if (!resolved) {
      next();
      return;
    }
    const { alias, successorPath } = resolved;
    const queryIndex = req.url.indexOf('?');
    res.setHeader('Deprecation', 'true');
    res.setHeader('Link', `<${successorPath}>; rel="successor-version"`);
    log(
      `${alias.method} ${alias.path}`,
      `Ancien chemin d'API appelé : ${req.method} ${req.path} → ${alias.successorMethod} ${successorPath} ` +
        `(user-agent : ${printableUserAgent(req.headers['user-agent'])})`,
    );
    req.url = successorPath + (queryIndex >= 0 ? req.url.slice(queryIndex) : '');
    req.method = alias.successorMethod;
    next();
  };
}
