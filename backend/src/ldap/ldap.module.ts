import { Module } from '@nestjs/common';
import { LdapService } from './ldap.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  // NotificationModule : LdapService envoie l'alerte « départ avec matériel »
  // (lot D1) via NotificationService.sendDepartureAlert en fin de synchro.
  imports: [NotificationModule],
  providers: [LdapService],
  exports: [LdapService],
})
export class LdapModule {}
