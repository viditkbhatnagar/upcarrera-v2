import { Module } from '@nestjs/common';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';

/**
 * Clients surface (port of CI4 App\Controllers\App\Clients). PrismaService is
 * provided by the @Global() PrismaModule (see app.module.ts), so it is not
 * re-declared here — mirrors ConsultantsModule / LeadsModule.
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
