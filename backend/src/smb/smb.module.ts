import { Module } from '@nestjs/common';
import { SmbService } from './smb.service';
import { ConfigModule } from '../config/config.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [SmbService],
  exports: [SmbService],
})
export class SmbModule {}
