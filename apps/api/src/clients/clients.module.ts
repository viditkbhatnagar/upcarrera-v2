import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

/**
 * Clients surface (port of CI4 App\Controllers\App\Clients). PrismaService is
 * provided by the @Global() PrismaModule (see app.module.ts), so it is not
 * re-declared here — mirrors ConsultantsModule / LeadsModule.
 */
@Module({
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
