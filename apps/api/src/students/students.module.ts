import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { ApplicationsController } from './applications.controller';
import { AcademicStudentsController } from './academic-students.controller';
import { StudentsService } from './students.service';

/**
 * Students + Applications module.
 * PrismaService is provided by the @Global() PrismaModule, so no import is needed.
 */
@Module({
  controllers: [
    StudentsController,
    ApplicationsController,
    AcademicStudentsController,
  ],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
