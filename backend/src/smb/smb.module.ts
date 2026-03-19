import { Module } from '@nestjs/common';
import { SmbService } from './smb.service';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [ConfigModule],
  providers: [SmbService],
  exports: [SmbService],
})
export class SmbModule {}
