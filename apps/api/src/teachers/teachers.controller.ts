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
import {
  AssignStudentDto,
  EnrolCourseDto,
  ResetPasswordDto,
  UpdateZoomEmailDto,
} from './dto/reset-password.dto';
import {
  CreateSalaryRateDto,
  UpdateSalaryRateDto,
} from './dto/salary-rate.dto';
import { MonthFilterDto, RequiredMonthDto } from './dto/month-filter.dto';
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
    return this.teachers.findAll(
      q.page,
      q.limit,
      q.search_key,
      q.course_id,
      q.subject_id,
    );
  }

  // ROUTE ORDER: all literal `:id/<sub-path>` routes below live one segment
  // DEEPER than the bare `:id` route, so they never collide with it. They are
  // grouped here for readability; their depth (not source order) keeps them
  // unambiguous against `@Get(':id')` / `@Patch(':id')` / `@Delete(':id')`.

  @Get(':id/students')
  @ResponseMessage('Teacher students fetched successfully!')
  findStudents(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findStudents(id);
  }

  @Get(':id/schedules')
  @ResponseMessage('Teacher schedules fetched successfully!')
  findScheduleEvents(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findScheduleEvents(id);
  }

  @Get(':id/enrolled-courses')
  @ResponseMessage('Teacher enrolled courses fetched successfully!')
  findEnrolledCourses(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findEnrolledCourses(id);
  }

  @Post(':id/enrolled-courses')
  @ResponseMessage('Course assigned successfully!')
  addEnrolledCourse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnrolCourseDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.addEnrolledCourse(id, dto, actorId);
  }

  @Delete(':id/enrolled-courses/:courseId')
  @ResponseMessage('Course unassigned successfully!')
  removeEnrolledCourse(
    @Param('id', ParseIntPipe) id: number,
    @Param('courseId', ParseIntPipe) courseId: number,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.removeEnrolledCourse(id, courseId, actorId);
  }

  @Get(':id/assigned-students')
  @ResponseMessage('Assigned students fetched successfully!')
  findAssignedStudents(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.findAssignedStudents(id);
  }

  @Post(':id/assigned-students')
  @ResponseMessage('Student assigned successfully!')
  assignStudent(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignStudentDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.assignStudent(id, dto, actorId);
  }

  @Delete(':id/assigned-students/:assignmentId')
  @ResponseMessage('Student unassigned successfully!')
  removeAssignedStudent(
    @Param('id', ParseIntPipe) id: number,
    @Param('assignmentId', ParseIntPipe) assignmentId: number,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.removeAssignedStudent(id, assignmentId, actorId);
  }

  @Get(':id/salary-payments')
  @ResponseMessage('Teacher salary payments fetched successfully!')
  findSalaryPayments(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: MonthFilterDto,
  ) {
    return this.teachers.findSalaryPayments(id, q.month);
  }

  @Get(':id/salary-summary')
  @ResponseMessage('Teacher salary summary computed successfully!')
  salarySummary(
    @Param('id', ParseIntPipe) id: number,
    @Query() q: RequiredMonthDto,
  ) {
    return this.teachers.salarySummary(id, q.month);
  }

  /**
   * Update a teacher's username + password. Exposed at two paths (same impl):
   * PATCH /teachers/:id/password and PATCH /teachers/:id/reset-password.
   */
  @Patch(':id/password')
  @ResponseMessage('Password updated successfully!')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.teachers.resetPassword(id, dto);
  }

  @Patch(':id/reset-password')
  @ResponseMessage('Password updated successfully!')
  resetPasswordAlias(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.teachers.resetPassword(id, dto);
  }

  @Patch(':id/zoom-email')
  @ResponseMessage('Zoom email updated successfully!')
  updateZoomEmail(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateZoomEmailDto,
  ) {
    return this.teachers.updateZoomEmail(id, dto);
  }

  @Patch(':id/device')
  @ResponseMessage('Device cleared successfully!')
  clearDevice(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.clearDevice(id);
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

  @Delete(':id')
  @ResponseMessage('Teacher subject deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.teachers.removeSubject(id);
  }
}

/** Teacher salary-rate sub-resource (list + create/update). */
@Controller('teacher-salary-rates')
export class TeacherSalaryRatesController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @ResponseMessage('Teacher salary rates fetched successfully!')
  findAll(@Query() q: TeacherIdListDto) {
    return this.teachers.findSalaryRates(q.page, q.limit, q.teacher_id);
  }

  @Post()
  @ResponseMessage('Teacher salary rate created successfully!')
  create(
    @Body() dto: CreateSalaryRateDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.createSalaryRate(dto, actorId);
  }

  @Patch(':id')
  @ResponseMessage('Teacher salary rate updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryRateDto,
    @CurrentUser('id') actorId: number,
  ) {
    return this.teachers.updateSalaryRate(id, dto, actorId);
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
