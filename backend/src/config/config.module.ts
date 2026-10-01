import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { EncryptionService } from './encryption.service';
import { ConfigRegistryService } from './config-registry.service';

/** Configuration : lecture brute (`AppConfigService`), lecture typée selon le
 *  registre (`ConfigRegistryService`), chiffrement des secrets. Global. */
@Global()
@Module({
  providers: [AppConfigService, EncryptionService, ConfigRegistryService],
  exports: [AppConfigService, EncryptionService, ConfigRegistryService],
})
export class ConfigModule {}
