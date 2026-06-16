import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { EnrollmentPdfService } from './enrollment-pdf.service';

/**
 * Reporting surface (lead/student/income/followup + enrollment reports, with
 * CSV export and streamed enrollment PDFs).
 *
 * PrismaService is provided by the @Global() PrismaModule (see app.module.ts),
 * so it does not need to be re-declared here — mirrors LeadsModule.
 * EnrollmentPdfService depends on ReportsService for its row/tally loaders.
 *
 * NOTE: integration must register ReportsModule in app.module.ts's imports.
 */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, EnrollmentPdfService],
})
export class ReportsModule {}
