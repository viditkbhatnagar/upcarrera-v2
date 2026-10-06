import { Module } from '@nestjs/common';
import { RoleRegistryService } from './role-registry.service';
import { AuditService } from './audit.service';
import { RecordAccessService } from './record-access.service';
import { StageEngineService } from './stage-engine.service';
import { ApplicationAccessGuard } from './application-access.guard';
import { ProgramReferenceService } from '../applicant/program-reference.service';

/**
 * The record-access + stage-engine foundation (buildOrder 3-4). It depends only
 * on the @Global PrismaModule, so both StudentsModule (which locks down the
 * existing application routes and runs the conversion) and WorkflowModule (the
 * new workflow endpoints) can import it with no circular dependency.
 *
 * ProgramReferenceService (program + counsellor label resolution) also lives here
 * so BOTH the applicant emails and the workflow reject/mismatch emails resolve the
 * same university/course/intake/counsellor labels from one place. It depends only
 * on Prisma, so hosting it in this leaf module introduces no cycle.
 */
@Module({
  providers: [
    RoleRegistryService,
    AuditService,
    RecordAccessService,
    StageEngineService,
    ApplicationAccessGuard,
    ProgramReferenceService,
  ],
  exports: [
    RoleRegistryService,
    AuditService,
    RecordAccessService,
    StageEngineService,
    ApplicationAccessGuard,
    ProgramReferenceService,
  ],
})
export class WorkflowCoreModule {}
