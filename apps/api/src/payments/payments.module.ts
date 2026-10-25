import { Module } from '@nestjs/common';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/** Counsellor Payments (read-only). PrismaService comes from the @Global PrismaModule. */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
