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
import { TeachersService } from './teachers.service';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { TeacherListDto, TeacherIdListDto, UserIdListDto } from './dto/list.dto';
import { ComputeSalaryDto } from './dto/compute-salary.dto';
import { CreateSalaryPaymentDto } from './dto/create-salary-payment.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff-facing teacher management. Protected by the global JwtAuthGuard.
 * Port of CI4 App\Controllers\App\{Teachers, Teacher_schedules, Teacher_salary}.
 * List endpoints use @Query() DTOs (with @Type coercion) rather than per-param
 * ParseIntPipe, which conflicts with the global transform ValidationPipe.
 */
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teachers fetched successfully!')
  findAll(@Query() q: TeacherListDto) {
    return this.teachers.findAll(q.page, q.limit, q.search_key);
  }

  @Get(':id')
  @ResponseMessage('Teacher fetched successfully!')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findOne(id);
  }

  /**
   * Compute a teacher's payable salary over an inclusive date range.
   * GET /teachers/:id/salary?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Returns { bands, demo, total } — zeros when the teacher has no rate or sessions.
   */
  @Get(':id/salary')
  @ResponseMessage('Teacher salary computed successfully!')
  computeSalary(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: ComputeSalaryDto,
  ) {
    return this.teachers.computeSalary(id, q.from, q.to);
  }

  @Post()
  @ResponseMessage('Teacher created successfully!')
  create(@Body() dto: CreateTeacherDto) {
    return this.teachers.create(dto);
  }

  @Patch(':id')
  @ResponseMessage('Teacher updated successfully!')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTeacherDto) {
    return this.teachers.update(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Teacher deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.remove(id);
  }
}

/** Teacher schedule sub-resource. */
@Controller('teacher-schedules')
export class TeacherSchedulesController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teacher schedules fetched successfully!')
  findAll(@Query() q: TeacherIdListDto) {
    return this.teachers.findSchedules(q.page, q.limit, q.teacher_id);
  }

  @Post()
  @ResponseMessage('Teacher schedule created successfully!')
  create(@Body() dto: CreateScheduleDto) {
    return this.teachers.createSchedule(dto);
  }
}

/** Teacher subject (course-link) sub-resource. */
@Controller('teacher-subjects')
export class TeacherSubjectsController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teacher subjects fetched successfully!')
  findAll(@Query() q: UserIdListDto) {
    return this.teachers.findSubjects(q.page, q.limit, q.user_id);
  }

  @Post()
  @ResponseMessage('Teacher subject created successfully!')
  create(@Body() dto: CreateSubjectDto) {
    return this.teachers.createSubject(dto);
  }
}

/** Teacher salary-rate sub-resource (read-only this phase). */
@Controller('teacher-salary-rates')
export class TeacherSalaryRatesController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teacher salary rates fetched successfully!')
  findAll(@Query() q: TeacherIdListDto) {
    return this.teachers.findSalaryRates(q.page, q.limit, q.teacher_id);
  }
}

/** Teacher change-request sub-resource (read-only this phase). */
@Controller('teacher-change-requests')
export class TeacherChangeRequestsController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teacher change requests fetched successfully!')
  findAll(@Query() q: TeacherIdListDto) {
    return this.teachers.findChangeRequests(q.page, q.limit, q.teacher_id);
  }
}

/**
 * Salary payout records (port of Teacher_salary::make_payment).
 * POST /salary-payments — paid_by is the authenticated user, not the body.
 */
@Controller('salary-payments')
export class SalaryPaymentsController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @ResponseMessage('Salary payment recorded successfully!')
  create(
    @Body() dto: CreateSalaryPaymentDto,
    @CurrentUser('id') paidBy: number,
  ) {
    return this.teachers.createSalaryPayment(dto, paidBy);
  }
}
