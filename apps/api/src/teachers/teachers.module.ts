import { Module } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import { WorkflowCoreModule } from '../workflow/workflow-core.module';
import {
  TeachersController,
  TeacherSchedulesController,
  TeacherSubjectsController,
  TeacherSalaryRatesController,
  TeacherChangeRequestsController,
  SalaryPaymentsController,
} from './teachers.controller';

@Module({
  imports: [WorkflowCoreModule],
  controllers: [
    TeachersController,
    TeacherSchedulesController,
    TeacherSubjectsController,
    TeacherSalaryRatesController,
    TeacherChangeRequestsController,
    SalaryPaymentsController,
  ],
  providers: [TeachersService],
  exports: [TeachersService],
})
export class TeachersModule {}
