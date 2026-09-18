import { BadRequestException } from '@nestjs/common';

/**
 * Trim défensif côté service (en plus du `@Transform` + `@IsNotEmpty()` posés
 * sur les DTO) : la couche HTTP (ValidationPipe) ne protège que les requêtes
 * passant par le contrôleur — cette fonction est la source de vérité pour
 * quiconque appelle `EquipmentService` directement (tests unitaires compris),
 * et garantit qu'aucune chaîne uniquement composée d'espaces ne peut jamais
 * être persistée. Rejette avec un message français exploitable côté UI.
 */
export function trimRequired(value: string, fieldLabel: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new BadRequestException(`${fieldLabel} ne peut pas être vide.`);
  }
  return trimmed;
}

/**
 * Variante pour un champ réellement facultatif (description) : `undefined`
 * traverse sans modification (le champ n'est simplement pas modifié) ; une
 * valeur fournie est trimée, et si elle devient vide, elle est ramenée à
 * `undefined` plutôt que rejetée. Le formulaire catalogue du frontend envoie
 * systématiquement `description: ''` quand le champ est laissé vide (jamais
 * une clé absente) : rejeter une chaîne vide romprait la création/
 * modification d'un article sans description — le cas le plus courant.
 */
export function trimOptionalOrUndefined(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
