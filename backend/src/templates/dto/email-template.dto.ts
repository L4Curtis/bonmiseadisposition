import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { MAX_TEMPLATE_HTML_LENGTH } from '../template-catalog';
import type { TemplateImportItem } from '../import-validation';

/** Lignes d'un fichier d'import, telles que reçues : une ligne illisible
 *  (pas un objet) devient une ligne vide, que l'import compte comme ignorée. */
export function toImportItems(rows: readonly unknown[]): TemplateImportItem[] {
  return rows.map((row) => {
    const item = typeof row === 'object' && row !== null ? (row as Record<string, unknown>) : {};
    return {
      id: typeof item.id === 'string' ? item.id : '',
      html: typeof item.html === 'string' ? item.html : '',
    };
  });
}

/** PATCH /email-templates/:id — nouveau HTML du modèle. */
export class UpdateEmailTemplateDto {
  @IsString({ message: 'Le contenu du modèle doit être du texte HTML' })
  @IsNotEmpty({ message: 'Le contenu du modèle est requis' })
  @MaxLength(MAX_TEMPLATE_HTML_LENGTH, { message: 'Le contenu du modèle est trop long' })
  html!: string;
}

/** POST /email-templates/:id/test et /:id/test-bon — destinataire du test, et bon réel éventuel. */
export class EmailTemplateTestDto {
  @IsString({ message: 'Une adresse email valide est requise' })
  @MaxLength(320, { message: 'Une adresse email valide est requise' })
  email!: string;

  @IsOptional()
  @IsUUID('all', { message: 'Un bon valide est requis' })
  bonId?: string;
}
