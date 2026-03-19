import { IsString, IsEmail } from 'class-validator';

export class LocalLoginDto {
  @IsEmail({ require_tld: false }, { message: 'Email invalide' })
  email: string;

  @IsString()
  password: string;
}
