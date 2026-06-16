import { Module } from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import {
  AssessmentsController,
  HomeworkController,
  AssessmentReportsController,
} from './assessments.controller';

/**
 * Assessments module: assessment CRUD (/assessments), homework CRUD (/homework)
 * and their two aggregate reports (/reports/assessments, /reports/homework).
 *
 * PrismaService is provided by the @Global() PrismaModule, so no import is
 * needed. AssessmentReportsController shares the `/reports` prefix with the
 * existing ReportsController but uses distinct literal sub-paths (no collision).
 */
@Module({
  controllers: [
    AssessmentsController,
    HomeworkController,
    AssessmentReportsController,
  ],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
