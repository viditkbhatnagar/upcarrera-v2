import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { ApplicationsController } from './applications.controller';
import { AcademicStudentsController } from './academic-students.controller';
import { CandidateStatusesController } from './candidate-statuses.controller';
import { StudentsService } from './students.service';
import { StudentProfileService } from './student-profile.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';

/**
 * Students + Applications module.
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 * WorkflowCoreModule supplies the record-access, audit and stage-engine services
 * the application routes and the conversion saga now use.
 */
@Module({
  imports: [WorkflowCoreModule],
  controllers: [
    StudentsController,
    ApplicationsController,
    AcademicStudentsController,
    CandidateStatusesController,
  ],
  providers: [StudentsService, StudentProfileService],
  exports: [StudentsService],
})
export class StudentsModule {}
