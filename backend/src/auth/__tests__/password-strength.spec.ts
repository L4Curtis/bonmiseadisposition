import { BadRequestException } from '@nestjs/common';
import { validatePasswordStrength } from '../password-strength';

describe('validatePasswordStrength (pure)', () => {
  it('should accept a strong password', () => {
    expect(() => validatePasswordStrength('MyStr0ng_Pass!')).not.toThrow();
  });

  it('should reject a password shorter than 12 characters', () => {
    expect(() => validatePasswordStrength('Short1!')).toThrow(BadRequestException);
  });

  it('should reject a password longer than 128 characters', () => {
    expect(() => validatePasswordStrength('A1!' + 'a'.repeat(128))).toThrow(BadRequestException);
  });

  it('should reject a password without an uppercase letter', () => {
    expect(() => validatePasswordStrength('nouppercase1!x')).toThrow(BadRequestException);
  });

  it('should reject a password without a lowercase letter', () => {
    expect(() => validatePasswordStrength('NOLOWERCASE1!X')).toThrow(BadRequestException);
  });

  it('should reject a password without a digit', () => {
    expect(() => validatePasswordStrength('NoDigitHere!!xx')).toThrow(BadRequestException);
  });

  it('should reject a password without a special character', () => {
    expect(() => validatePasswordStrength('NoSpecial12345')).toThrow(BadRequestException);
  });

  it('should accept the boundary length of exactly 12 characters', () => {
    expect(() => validatePasswordStrength('Aa1!Aa1!Aa1!')).not.toThrow();
  });
});
