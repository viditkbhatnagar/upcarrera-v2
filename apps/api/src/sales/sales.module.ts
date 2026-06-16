import { Module } from '@nestjs/common';
import { SalesTeamsController } from './sales-teams.controller';
import { TelecallersController } from './telecallers.controller';
import { UsersPasswordController } from './users-password.controller';
import { SalesService } from './sales.service';

/**
 * Sales surface: sales teams, telecallers (users role_id=2), and the
 * user password/username reset. PrismaService is provided by the @Global()
 * PrismaModule (see app.module.ts), so it is not re-declared here.
 * Ports CI4 App\Controllers\App\{Sales, Telecallers}.
 */
@Module({
  controllers: [
    SalesTeamsController,
    TelecallersController,
    UsersPasswordController,
  ],
  providers: [SalesService],
})
export class SalesModule {}
