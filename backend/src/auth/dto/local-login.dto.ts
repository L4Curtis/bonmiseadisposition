import { IsString, IsEmail } from 'class-validator';

export class LocalLoginDto {
  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @IsString()
  password: string;
}
