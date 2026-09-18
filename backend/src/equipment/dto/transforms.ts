import { TransformFnParams } from 'class-transformer';

/**
 * Trim d'une chaîne fournie par le client, appliqué AVANT la validation
 * (`class-validator`) grâce à `transform: true` sur le `ValidationPipe`
 * global — une valeur uniquement composée d'espaces échoue donc bien sur
 * `@IsNotEmpty()` plutôt que d'être acceptée telle quelle. Les valeurs non
 * string (undefined, null…) sont laissées inchangées : `@IsOptional()` reste
 * responsable de les court-circuiter.
 */
export function trimTransform({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/**
 * Variante pour les champs réellement facultatifs (description) : trim, puis
 * une chaîne devenue vide est ramenée à `undefined` plutôt que rejetée par
 * `@IsNotEmpty()`. Nécessaire car le formulaire catalogue du frontend envoie
 * systématiquement `description: ''` quand le champ est laissé vide (jamais
 * une clé absente) — un `@IsNotEmpty()` classique romprait la création/
 * modification d'un article sans description, cas le plus courant. `brand`,
 * `model` et le nom de pack restent volontairement stricts via
 * `trimTransform` + `@IsNotEmpty()` : ce sont des champs obligatoires.
 */
export function trimToUndefinedTransform({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
