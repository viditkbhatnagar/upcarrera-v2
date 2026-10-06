import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DataHygieneService } from './data-hygiene.service';
import { CatalogSyncService } from './catalog-sync.service';

/**
 * Background maintenance jobs for the shared legacy DB (see DataHygieneService
 * and CatalogSyncService). Relies on ScheduleModule.forRoot() in AppModule.
 */
@Module({
  imports: [PrismaModule],
  providers: [DataHygieneService, CatalogSyncService],
  exports: [DataHygieneService, CatalogSyncService],
})
export class MaintenanceModule {}
