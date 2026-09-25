import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AccessDeclarationGuard } from './guards/access-declaration.guard';
import { FilialeStampRedactionInterceptor } from './interceptors/filiale-stamp-redaction.interceptor';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // Secret configured dynamically in AuthService
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // Global : une route sans déclaration d'accès complète (@Public, ou
    // @Roles derrière JwtAuthGuard puis RolesGuard) est refusée, même si son
    // contrôleur n'a déclaré aucune garde (voir le garde).
    { provide: APP_GUARD, useClass: AccessDeclarationGuard },
    // Global : aucune réponse destinée à un collaborateur ou à la direction ne
    // contient le chemin du cachet d'une filiale (voir l'intercepteur).
    { provide: APP_INTERCEPTOR, useClass: FilialeStampRedactionInterceptor },
  ],
  exports: [AuthService],
})
export class AuthModule {}
