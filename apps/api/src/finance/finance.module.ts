import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FinanceController } from './finance.controller';
import { FinanceReportController } from './finance-report.controller';
import { FeeManagementController } from './fee-management.controller';
import { UniversityCommissionController } from './university-commission.controller';
import { StudentCommissionController } from './student-commission.controller';
import { FinanceService } from './finance.service';
import { RazorpayProvider } from './razorpay.provider';
import { PdfService } from './pdf.service';

// PrismaModule is @Global(), so PrismaService is injectable here without re-importing.
// IntegrationsModule is imported so EmailService (exported there) can be injected
// by FinanceService for the invoice due-reminder cron.
@Module({
  imports: [IntegrationsModule],
  controllers: [
    FinanceController,
    FinanceReportController,
    FeeManagementController,
    UniversityCommissionController,
    StudentCommissionController,
  ],
  providers: [FinanceService, RazorpayProvider, PdfService],
  exports: [FinanceService],
})
export class FinanceModule {}
