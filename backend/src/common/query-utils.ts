/** Parse a positive integer query param with fallback and optional cap —
 *  NaN / 0 / negative values silently fall back instead of reaching Prisma
 *  (where `take: NaN` surfaces as an HTTP 500). */
export function parsePositiveInt(value: string | undefined, fallback: number, max?: number): number {
  const n = value === undefined ? NaN : parseInt(value, 10);
  const v = Number.isFinite(n) && n > 0 ? n : fallback;
  return max !== undefined ? Math.min(v, max) : v;
}
