import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataHygieneService } from './data-hygiene.service';

/**
 * Background maintenance jobs for the shared legacy DB (see DataHygieneService).
 * Relies on ScheduleModule.forRoot() being registered in AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [DataHygieneService],
  exports: [DataHygieneService],
})
export class MaintenanceModule {}
