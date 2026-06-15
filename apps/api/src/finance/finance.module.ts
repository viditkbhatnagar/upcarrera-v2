import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { RazorpayProvider } from './razorpay.provider';
import { PdfService } from './pdf.service';

// PrismaModule is @Global(), so PrismaService is injectable here without re-importing.
@Module({
  controllers: [FinanceController],
  providers: [FinanceService, RazorpayProvider, PdfService],
  exports: [FinanceService],
})
export class FinanceModule {}
