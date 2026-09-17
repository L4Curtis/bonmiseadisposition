import { BadRequestException } from '@nestjs/common';

/**
 * Politique de robustesse du mot de passe local. Fonction pure extraite de
 * AuthService.validatePasswordStrength — lève une BadRequestException (jamais
 * une Error brute) pour rester cohérente avec les autres validations
 * utilisateur du contrôleur.
 */
export function validatePasswordStrength(password: string): void {
  if (password.length > 128) {
    throw new BadRequestException('Le mot de passe ne doit pas dépasser 128 caractères');
  }
  if (password.length < 12) {
    throw new BadRequestException('Le mot de passe doit contenir au moins 12 caractères');
  }
  if (!/[A-Z]/.test(password)) {
    throw new BadRequestException('Le mot de passe doit contenir au moins une lettre majuscule');
  }
  if (!/[a-z]/.test(password)) {
    throw new BadRequestException('Le mot de passe doit contenir au moins une lettre minuscule');
  }
  if (!/[0-9]/.test(password)) {
    throw new BadRequestException('Le mot de passe doit contenir au moins un chiffre');
  }
  if (!/[@$!%*?&_#^+=\-.]/.test(password)) {
    throw new BadRequestException('Le mot de passe doit contenir au moins un caractère spécial (@$!%*?&_#^+=−.)');
  }
}
