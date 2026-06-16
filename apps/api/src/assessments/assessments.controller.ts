import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListAssessmentsDto } from './dto/list-assessments.dto';
import { CreateAssessmentDto } from './dto/create-assessment.dto';
import { UpdateAssessmentDto } from './dto/update-assessment.dto';
import { CreateHomeworkDto } from './dto/create-homework.dto';
import { UpdateHomeworkDto } from './dto/update-homework.dto';
import { AssessmentReportQueryDto } from './dto/report-query.dto';

/**
 * Assessment + homework HTTP surface, plus their two aggregate reports. Every
 * route is staff-only, protected by the global JwtAuthGuard (no @Public). The
 * {status,message,data} envelope is added automatically by ResponseInterceptor.
 *
 * Ports App/Controllers/App/{Assessment,Homework,Assessment_report,
 * Home_work_report}.php.
 */

// assessment -> /assessments
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  @ResponseMessage('Assessments')
  list(@Query() query: ListAssessmentsDto) {
    return this.assessments.listAssessments(query);
  }

  @Get(':id')
  @ResponseMessage('Assessment')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.assessments.getAssessment(id);
  }

  @Post()
  @ResponseMessage('Assessment Added Successfully!')
  create(
    @Body() dto: CreateAssessmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.assessments.createAssessment(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Assessment Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssessmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.assessments.updateAssessment(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Assessment Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.assessments.deleteAssessment(id, userId);
  }
}

// homework -> /homework
@Controller('homework')
export class HomeworkController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get()
  @ResponseMessage('Homework')
  list(@Query() query: ListAssessmentsDto) {
    return this.assessments.listHomework(query);
  }

  @Get(':id')
  @ResponseMessage('Homework')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.assessments.getHomework(id);
  }

  @Post()
  @ResponseMessage('Homework Added Successfully!')
  create(@Body() dto: CreateHomeworkDto, @CurrentUser('id') userId: number) {
    return this.assessments.createHomework(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Homework Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHomeworkDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.assessments.updateHomework(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Homework Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.assessments.deleteHomework(id, userId);
  }
}

/**
 * Aggregate assessment / homework reports.
 *
 * Mounted under `/reports` but with DISTINCT literal sub-paths (`assessments`,
 * `homework`) that do not collide with the existing ReportsController routes
 * (`leads`, `leads/by-country`, `students`, `income`, `followups`). NestJS
 * happily merges two controllers on the same path prefix as long as the full
 * routes differ.
 */
@Controller('reports')
export class AssessmentReportsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Get('assessments')
  @ResponseMessage('Assessment report')
  assessments_report(@Query() query: AssessmentReportQueryDto) {
    return this.assessments.assessmentReport(query);
  }

  @Get('homework')
  @ResponseMessage('Homework report')
  homework_report(@Query() query: AssessmentReportQueryDto) {
    return this.assessments.homeworkReport(query);
  }
}
