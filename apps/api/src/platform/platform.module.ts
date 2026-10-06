import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';

/**
 * Platform administration module: users admin, roles, permissions,
 * role-permissions, settings, notifications. Imported into app.module.ts.
 * PrismaService is injected from the @Global() PrismaModule; WorkflowCoreModule
 * supplies RecordAccessService so a role/status change flushes its access cache
 * (UserStateService comes from the @Global CommonModule).
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
