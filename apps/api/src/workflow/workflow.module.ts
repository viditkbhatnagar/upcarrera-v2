import { Module } from '@nestjs/common';
import { WorkflowCoreModule } from './workflow-core.module';
import { StudentsModule } from '../students/students.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { FilesModule } from '../files/files.module';
import { ApplicationWorkflowService } from './application-workflow.service';
import { ApplicationPaymentsService } from './application-payments.service';
import { SaReviewService } from './sa-review.service';
import { ApplicationWorkflowController } from './application-workflow.controller';
import { ApplicationPaymentsController } from './application-payments.controller';
import { MeAccessController } from './me-access.controller';

/**
 * The Phase 1 application workflow endpoints (buildOrder 4-7): stage actions,
 * registration fee, Student Affairs review, and /auth/me/access.
 *
 * Imports StudentsModule for the shared conversion saga (runConversion), the
 * record-access/stage-engine core, IntegrationsModule for transactional email,
 * and FilesModule for StorageService (payment proofs). No cycle: WorkflowCoreModule
 * depends only on Prisma, and StudentsModule imports WorkflowCoreModule, not this.
 */
@Module({
  imports: [WorkflowCoreModule, StudentsModule, IntegrationsModule, FilesModule],
  controllers: [
    ApplicationWorkflowController,
    ApplicationPaymentsController,
    MeAccessController,
  ],
  providers: [ApplicationWorkflowService, ApplicationPaymentsService, SaReviewService],
})
export class WorkflowModule {}
