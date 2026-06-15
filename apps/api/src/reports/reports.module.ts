import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

/**
 * Reporting surface (lead/student/income/followup reports with CSV export).
 *
 * PrismaService is provided by the @Global() PrismaModule (see app.module.ts),
 * so it does not need to be re-declared here — mirrors LeadsModule.
 *
 * NOTE: integration must register ReportsModule in app.module.ts's imports.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
