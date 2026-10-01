import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserAccountsService } from './user-accounts.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, UserAccountsService],
  exports: [UsersService],
})
export class UsersModule {}
