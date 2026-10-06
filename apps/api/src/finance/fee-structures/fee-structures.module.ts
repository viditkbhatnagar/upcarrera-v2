import { Module } from '@nestjs/common';
import { WorkflowCoreModule } from '../../workflow/workflow-core.module';
import { FeeStructuresController } from './fee-structures.controller';
import { FeeStructuresService } from './fee-structures.service';

/**
 * WS2 Fee Structure master. PrismaModule is @Global, so only WorkflowCoreModule
 * (for the shared AuditService) needs importing. FeeStructuresService is
 * exported so AP04 can call resolveActive() for the application registration-fee
 * wrapper.
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [FeeStructuresController],
  providers: [FeeStructuresService],
  exports: [FeeStructuresService],
})
export class FeeStructuresModule {}
