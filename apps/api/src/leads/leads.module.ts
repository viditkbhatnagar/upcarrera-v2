import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadSourcesController } from './lead-sources.controller';
import { LeadStatusesController } from './lead-statuses.controller';
import { LeadsService } from './leads.service';

@Module({
  // PrismaService is provided by the @Global() PrismaModule (see app.module.ts),
  // so it does not need to be re-declared here — mirrors AuthModule.
  controllers: [
    LeadsController,
    LeadSourcesController,
    LeadStatusesController,
  ],
  providers: [LeadsService],
})
export class LeadsModule {}
