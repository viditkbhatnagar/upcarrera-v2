import { Module } from '@nestjs/common';
import { TeachersService } from './teachers.service';
import {
  TeachersController,
  TeacherSchedulesController,
  TeacherSubjectsController,
  TeacherSalaryRatesController,
  TeacherChangeRequestsController,
  SalaryPaymentsController,
} from './teachers.controller';

@Module({
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
