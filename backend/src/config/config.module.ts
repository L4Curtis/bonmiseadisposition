import { Global, Module } from '@nestjs/common';
import { AppConfigService } from './config.service';
import { EncryptionService } from './encryption.service';

@Global()
@Module({
  providers: [AppConfigService, EncryptionService],
  exports: [AppConfigService, EncryptionService],
})
export class ConfigModule {}
