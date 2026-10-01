import { IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /admin/config/test/smtp : adresse à qui envoyer un vrai email de test (facultatif). */
export class SmtpTestDto {
  @IsOptional()
  @IsString({ message: 'testEmail doit être une adresse email' })
  @MaxLength(320, { message: 'testEmail : 320 caractères au plus' })
  testEmail?: string;
}
