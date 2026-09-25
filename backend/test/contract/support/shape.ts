/**
 * Vérification structurelle d'une réponse JSON, liée au type déclaré dans
 * src/contracts/.
 *
 * `object<T>({...})` exige, À LA COMPILATION, une entrée par clé de T (ni plus,
 * ni moins) et, pour chaque clé, un vérificateur du type exact : une clé
 * facultative doit passer par `optional()`, une clé nullable par `nullable()`.
 * À l'EXÉCUTION, la réponse doit avoir exactement ces clés, avec ces types.
 * Changer un contrat sans changer son test ne compile donc pas, et changer la
 * réponse de l'API sans changer le contrat fait échouer le test : forme
 * déclarée et forme vérifiée ne peuvent plus diverger (cause du bug 650508f).
 */
import { expect } from 'vitest';
import type { IsoDateTime, JsonValue } from '../../../src/contracts/common';

/** Partie d'une forme lisible à l'exécution, commune à toutes les formes. */
interface ShapeBase {
  readonly label: string;
  /** Vrai pour une clé qui peut manquer dans l'objet (voir `optional`). */
  readonly optional?: boolean;
  readonly check: (value: unknown, path: string) => readonly string[];
}

export interface Shape<T> extends ShapeBase {
  /** Porteur du type, jamais lu à l'exécution : rend `Shape` invariant en T,
   *  si bien que `Shape<string>` n'est pas accepté là où `Shape<string | null>`
   *  est attendu, et inversement. */
  readonly _type?: (value: T) => T;
}

type Fields<T> = { [K in keyof T]-?: Shape<T[K]> };
type ShapeType<S> = S extends Shape<infer T> ? T : never;

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'un tableau';
  if (typeof value === 'string') return `la chaîne ${JSON.stringify(value.slice(0, 40))}`;
  if (typeof value === 'object') return 'un objet';
  return `${typeof value} ${String(value)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function primitive<T>(label: string, test: (value: unknown) => boolean): Shape<T> {
  return {
    label,
    check: (value, path) => (test(value) ? [] : [`${path} : ${label} attendu, reçu ${describe(value)}`]),
  };
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const str: Shape<string> = primitive('une chaîne', (v) => typeof v === 'string');
export const num: Shape<number> = primitive('un nombre', (v) => typeof v === 'number' && Number.isFinite(v));
export const int: Shape<number> = primitive('un entier', (v) => typeof v === 'number' && Number.isInteger(v));
export const bool: Shape<boolean> = primitive('un booléen', (v) => typeof v === 'boolean');
export const uuid: Shape<string> = primitive('un identifiant UUID', (v) => typeof v === 'string' && UUID.test(v));
export const isoDate: Shape<IsoDateTime> = primitive(
  'une date ISO 8601',
  (v) => typeof v === 'string' && ISO_DATE_TIME.test(v),
);
export const json: Shape<JsonValue> = primitive('une valeur JSON', (v) => v !== undefined);

/** La valeur `null` elle-même (variante d'une union où la clé vaut toujours null). */
export const nullValue: Shape<null> = primitive('null', (v) => v === null);

/** Une valeur parmi une liste fermée (énumération). */
export function literal<const V extends string | number | boolean>(...values: readonly V[]): Shape<V> {
  const label = `une des valeurs ${values.map((v) => JSON.stringify(v)).join(', ')}`;
  return primitive(label, (v) => values.includes(v as V));
}

export function nullable<T>(inner: Shape<T>): Shape<T | null> {
  return {
    label: `${inner.label} ou null`,
    check: (value, path) => (value === null ? [] : inner.check(value, path)),
  };
}

/** Clé qui peut manquer dans l'objet ; si elle est présente, elle suit `inner`. */
export function optional<T>(inner: Shape<T>): Shape<T | undefined> {
  return { label: `${inner.label} (facultatif)`, optional: true, check: inner.check };
}

/** Clé déclarée `clé?: never` dans le contrat : elle ne doit jamais être
 *  renvoyée dans cette variante (sert à distinguer les branches d'une union). */
export const absent: Shape<undefined> = {
  label: 'aucune valeur',
  optional: true,
  check: (value, path) => [`${path} : clé inattendue dans cette variante, reçu ${describe(value)}`],
};

export function arrayOf<T>(item: Shape<T>, options: { minLength?: number } = {}): Shape<T[]> {
  const minLength = options.minLength ?? 0;
  return {
    label: `un tableau de ${item.label}`,
    check: (value, path) => {
      if (!Array.isArray(value)) return [`${path} : tableau attendu, reçu ${describe(value)}`];
      const tooShort = value.length < minLength
        ? [`${path} : au moins ${minLength} élément(s) attendu(s) par le jeu de données, reçu ${value.length}`]
        : [];
      return [...tooShort, ...value.flatMap((entry, index) => item.check(entry, `${path}[${index}]`))];
    },
  };
}

/** Dictionnaire à clés libres (réglages d'une rubrique de configuration…). */
export function record<V>(inner: Shape<V>): Shape<Record<string, V>> {
  return {
    label: `un dictionnaire de ${inner.label}`,
    check: (value, path) => {
      if (!isPlainObject(value)) return [`${path} : objet attendu, reçu ${describe(value)}`];
      return Object.entries(value).flatMap(([key, entry]) => inner.check(entry, `${path}.${key}`));
    },
  };
}

/** Objet aux clés exactes de T : clé manquante ou clé inattendue = erreur. */
export function object<T>(fields: Fields<T>): Shape<T> {
  const entries = Object.entries(fields) as [string, Shape<unknown>][];
  const known = new Set(entries.map(([key]) => key));
  return {
    label: 'un objet',
    check: (value, path) => {
      if (!isPlainObject(value)) return [`${path} : objet attendu, reçu ${describe(value)}`];
      const unexpected = Object.keys(value)
        .filter((key) => !known.has(key))
        .map((key) => `${path}.${key} : clé renvoyée par l'API mais absente du contrat`);
      const checked = entries.flatMap(([key, shape]) => {
        if (!(key in value)) return shape.optional ? [] : [`${path}.${key} : clé du contrat absente de la réponse`];
        return shape.check(value[key], `${path}.${key}`);
      });
      return [...unexpected, ...checked];
    },
  };
}

/** Réponse qui prend l'une de plusieurs formes (branches d'un même service). */
export function oneOf<const S extends readonly ShapeBase[]>(...shapes: S): Shape<ShapeType<S[number]>> {
  return {
    label: shapes.map((s) => s.label).join(' | '),
    check: (value, path) => {
      const attempts = shapes.map((shape) => shape.check(value, path));
      if (attempts.some((errors) => errors.length === 0)) return [];
      return attempts.flatMap((errors, index) => errors.map((e) => `[forme ${index + 1}] ${e}`));
    },
  };
}

/** Liste des écarts entre `value` et la forme attendue (vide si conforme). */
export function shapeErrors<T>(value: unknown, shape: Shape<T>): readonly string[] {
  return shape.check(value, 'réponse');
}

/** Assertion Vitest : la valeur suit exactement la forme ; l'échec liste
 *  chaque clé en écart, avec son chemin. */
export function expectShape<T>(value: unknown, shape: Shape<T>): asserts value is T {
  expect(shapeErrors(value, shape)).toEqual([]);
}
