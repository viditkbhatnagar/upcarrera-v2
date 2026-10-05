import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { ApplicationsController } from './applications.controller';
import { AcademicStudentsController } from './academic-students.controller';
import { CandidateStatusesController } from './candidate-statuses.controller';
import { StudentsService } from './students.service';
import { StudentProfileService } from './student-profile.service';

/**
 * Students + Applications module.
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 */
@Module({
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
