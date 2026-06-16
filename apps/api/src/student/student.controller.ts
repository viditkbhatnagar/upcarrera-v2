import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { StudentService } from './student.service';
import { ListStudentSessionsDto } from './dto/list-sessions.dto';
import { ListFeedDto } from './dto/feed.dto';
import { UpdateStudentProfileDto } from './dto/update-profile.dto';
import { SwitchCourseDto } from './dto/switch-course.dto';
import { SubmitWorkDto } from './dto/submit-work.dto';
import { SessionFeedbackDto } from './dto/session-feedback.dto';
import { PerformanceQueryDto } from './dto/performance.dto';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Logged-in student's mobile-API surface (port of CI4 Api/Student/* and App/User/*).
 *
 * Behind the global JwtAuthGuard. EVERY endpoint is scoped to the authenticated
 * student via @CurrentUser('id') — the student's own user id.
 *
 * Route ordering note: static path segments are declared before their param
 * siblings (e.g. `plans/initiate-payment` before `plans/:id`,
 * `live-classes` before `live-classes/:id`) so the static route wins.
 */
@Controller('student')
export class StudentController {
  constructor(private readonly student: StudentService) {}

  // ---- Dashboard / existing read endpoints -------------------------------

  // GET /student/home
  @Get('home')
  @ResponseMessage('Student home fetched')
  home(@CurrentUser('id') userId: number) {
    return this.student.getHome(userId);
  }

  // GET /student/courses
  @Get('courses')
  @ResponseMessage('Student courses fetched')
  courses(@CurrentUser('id') userId: number) {
    return this.student.getCourses(userId);
  }

  // GET /student/sessions
  @Get('sessions')
  @ResponseMessage('Student sessions fetched')
  sessions(
    @CurrentUser('id') userId: number,
    @Query() query: ListStudentSessionsDto,
  ) {
    return this.student.getSessions(userId, query);
  }

  // GET /student/invoices
  @Get('invoices')
  @ResponseMessage('Student invoices fetched')
  invoices(@CurrentUser('id') userId: number) {
    return this.student.getInvoices(userId);
  }

  // GET /student/assessments
  @Get('assessments')
  @ResponseMessage('Student assessments fetched')
  assessments(@CurrentUser('id') userId: number) {
    return this.student.getAssessments(userId);
  }

  // ---- Profile -----------------------------------------------------------

  // GET /student/profile
  @Get('profile')
  @ResponseMessage('Student profile fetched')
  profile(@CurrentUser('id') userId: number) {
    return this.student.getProfile(userId);
  }

  // PATCH /student/profile
  @Patch('profile')
  @ResponseMessage('Student profile updated')
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateStudentProfileDto,
  ) {
    return this.student.updateProfile(userId, dto);
  }

  // ---- Enrolled courses / switch -----------------------------------------

  // GET /student/enrolled-courses
  @Get('enrolled-courses')
  @ResponseMessage('Enrolled courses fetched')
  enrolledCourses(@CurrentUser('id') userId: number) {
    return this.student.getEnrolledCourses(userId);
  }

  // POST /student/switch-course
  @Post('switch-course')
  @ResponseMessage('Primary course switched')
  switchCourse(
    @CurrentUser('id') userId: number,
    @Body() dto: SwitchCourseDto,
  ) {
    return this.student.switchCourse(userId, dto);
  }

  // ---- Feed --------------------------------------------------------------

  // GET /student/feed
  @Get('feed')
  @ResponseMessage('Student feed fetched')
  feed(@Query() query: ListFeedDto) {
    return this.student.getFeed(query);
  }

  // ---- Live classes (static before param) --------------------------------

  // GET /student/live-classes
  @Get('live-classes')
  @ResponseMessage('Live classes fetched')
  liveClasses(@CurrentUser('id') userId: number) {
    return this.student.getLiveClasses(userId);
  }

  // GET /student/live-classes/:id
  @Get('live-classes/:id')
  @ResponseMessage('Live class fetched')
  liveClass(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.student.getLiveClass(userId, id);
  }

  // ---- Materials ---------------------------------------------------------

  // GET /student/courses/:id/materials
  @Get('courses/:id/materials')
  @ResponseMessage('Course materials fetched')
  courseMaterials(@Param('id', ParseIntPipe) id: number) {
    return this.student.getCourseMaterials(id);
  }

  // GET /student/subjects/:id/materials
  @Get('subjects/:id/materials')
  @ResponseMessage('Subject materials fetched')
  subjectMaterials(@Param('id', ParseIntPipe) id: number) {
    return this.student.getSubjectMaterials(id);
  }

  // GET /student/materials/:id
  @Get('materials/:id')
  @ResponseMessage('Material fetched')
  material(@Param('id', ParseIntPipe) id: number) {
    return this.student.getMaterial(id);
  }

  // ---- Plans & payment (static before param) -----------------------------

  // GET /student/courses/:id/plans
  @Get('courses/:id/plans')
  @ResponseMessage('Course plans fetched')
  coursePlans(@Param('id', ParseIntPipe) id: number) {
    return this.student.getCoursePlans(id);
  }

  // POST /student/plans/initiate-payment (static — declared before plans/:id)
  @Post('plans/initiate-payment')
  @ResponseMessage('Payment initiated')
  initiatePayment(
    @CurrentUser('id') userId: number,
    @Body() dto: InitiatePaymentDto,
  ) {
    return this.student.initiatePlanPayment(userId, dto);
  }

  // GET /student/plans/:id
  @Get('plans/:id')
  @ResponseMessage('Plan fetched')
  plan(@Param('id', ParseIntPipe) id: number) {
    return this.student.getPlan(id);
  }

  // ---- Progress ----------------------------------------------------------

  // GET /student/progress
  @Get('progress')
  @ResponseMessage('Student progress fetched')
  progress(@CurrentUser('id') userId: number) {
    return this.student.getProgress(userId);
  }

  // ---- Subjects ----------------------------------------------------------

  // GET /student/subjects/:id  (subjects/:id/materials declared above wins for that path)
  @Get('subjects/:id')
  @ResponseMessage('Subject fetched')
  subject(@Param('id', ParseIntPipe) id: number) {
    return this.student.getSubject(id);
  }

  // ---- Homework ----------------------------------------------------------

  // GET /student/homework
  @Get('homework')
  @ResponseMessage('Student homework fetched')
  homework(@CurrentUser('id') userId: number) {
    return this.student.getHomework(userId);
  }

  // POST /student/homework/:id/submit
  @Post('homework/:id/submit')
  @ResponseMessage('Homework submitted')
  submitHomework(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitWorkDto,
  ) {
    return this.student.submitHomework(userId, id, dto);
  }

  // POST /student/assessments/:id/submit
  @Post('assessments/:id/submit')
  @ResponseMessage('Assessment submitted')
  submitAssessment(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitWorkDto,
  ) {
    return this.student.submitAssessment(userId, id, dto);
  }

  // ---- Session feedback --------------------------------------------------

  // POST /student/sessions/:id/feedback  (:id = session_attendance row id)
  @Post('sessions/:id/feedback')
  @ResponseMessage('Session feedback submitted')
  sessionFeedback(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SessionFeedbackDto,
  ) {
    return this.student.submitSessionFeedback(userId, id, dto);
  }

  // ---- Performance -------------------------------------------------------

  // GET /student/performance?course_id=
  @Get('performance')
  @ResponseMessage('Student performance fetched')
  performance(
    @CurrentUser('id') userId: number,
    @Query() query: PerformanceQueryDto,
  ) {
    return this.student.getPerformance(userId, query);
  }
}
