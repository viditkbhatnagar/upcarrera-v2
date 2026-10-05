import { Module } from '@nestjs/common';
import { ConsultantsController } from './consultants.controller';
import { ConsultantTargetsController } from './consultant-targets.controller';
import { ConsultantsService } from './consultants.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';

/**
 * Consultants surface (port of CI4 App\Controllers\App\{Consultant,
 * Consultant_target}). PrismaService is provided by the @Global() PrismaModule
 * (see app.module.ts), so it is not re-declared here — mirrors LeadsModule.
 * WorkflowCoreModule supplies RecordAccessService for performance-route scoping.
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [ConsultantsController, ConsultantTargetsController],
  providers: [ConsultantsService],
})
export class ConsultantsModule {}
