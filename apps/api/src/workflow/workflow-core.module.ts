import { Module } from '@nestjs/common';
import { RoleRegistryService } from './role-registry.service';
import { AuditService } from './audit.service';
import { RecordAccessService } from './record-access.service';
import { StageEngineService } from './stage-engine.service';
import { ApplicationAccessGuard } from './application-access.guard';

/**
 * The record-access + stage-engine foundation (buildOrder 3-4). It depends only
 * on the @Global PrismaModule, so both StudentsModule (which locks down the
 * existing application routes and runs the conversion) and WorkflowModule (the
 * new workflow endpoints) can import it with no circular dependency.
 */
@Module({
  providers: [
    RoleRegistryService,
    AuditService,
    RecordAccessService,
    StageEngineService,
    ApplicationAccessGuard,
  ],
  exports: [
    RoleRegistryService,
    AuditService,
    RecordAccessService,
    StageEngineService,
    ApplicationAccessGuard,
  ],
})
export class WorkflowCoreModule {}
