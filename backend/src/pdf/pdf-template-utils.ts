import { PdfTemplateConfig } from './pdf-template-types';

// ─── Deep merge utility ──────────────────────────────────────────────────────

/** Deep-merge a partial config over a base config. Only known keys are merged. */
export function deepMergeConfig(
  base: PdfTemplateConfig,
  override: Partial<Record<string, unknown>>,
): PdfTemplateConfig {
  const result = structuredClone(base);

  const sections = ['colors', 'fonts', 'margins', 'header', 'infoBoxes', 'table', 'signatures', 'footer'] as const;
  for (const section of sections) {
    const overrideSection = override[section];
    if (overrideSection && typeof overrideSection === 'object' && !Array.isArray(overrideSection)) {
      const baseSection = result[section] as unknown as Record<string, unknown>;
      const src = overrideSection as Record<string, unknown>;
      for (const key of Object.keys(baseSection)) {
        if (key in src && src[key] !== undefined) {
          baseSection[key] = src[key];
        }
      }
    }
  }

  return result;
}

// ─── Variable substitution ───────────────────────────────────────────────────

/** Replace {{VARIABLE}} placeholders in a text string. */
export function substituteVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? '');
}
