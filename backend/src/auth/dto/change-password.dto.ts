import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * Politique de mot de passe conforme aux recommandations ANSSI/NIST 2026 :
 * - Minimum 12 caractères
 * - Au moins 1 majuscule
 * - Au moins 1 minuscule
 * - Au moins 1 chiffre
 * - Au moins 1 caractère spécial (@$!%*?&_#^+=\-.)
 * - Maximum 128 caractères
 */
export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString({ message: 'Le nouveau mot de passe est requis' })
  @MinLength(12, { message: 'Le mot de passe doit contenir au moins 12 caractères' })
  @MaxLength(128, { message: 'Le mot de passe ne doit pas dépasser 128 caractères' })
  @Matches(/[A-Z]/, { message: 'Le mot de passe doit contenir au moins une majuscule' })
  @Matches(/[a-z]/, { message: 'Le mot de passe doit contenir au moins une minuscule' })
  @Matches(/[0-9]/, { message: 'Le mot de passe doit contenir au moins un chiffre' })
  @Matches(/[@$!%*?&_#^+=\-.]/, { message: 'Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&_#^+=-.)'})
  newPassword: string;
}
