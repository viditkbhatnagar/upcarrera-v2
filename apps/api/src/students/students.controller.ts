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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { UpdateCredentialsDto } from './dto/update-credentials.dto';
import { UpsertFinanceDto } from './dto/finance.dto';
import { ListFinanceDto } from './dto/list-finance.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { AcademicGradesDto } from './dto/academic-grades.dto';
import { UpdateQualificationsDto } from './dto/update-qualifications.dto';
import { CreateEnrolmentDto } from './dto/create-enrolment.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { AccessUser } from '../workflow/record-access.service';

/**
 * Staff-only student records endpoints (protected by the global JwtAuthGuard).
 * Mirrors CI4 App/Students.
 *
 * ROUTE ORDER: every literal sub-path (/finance, /finance-summary, /documents/:id)
 * is declared BEFORE the catch-all /:id route so Nest matches the literal first.
 */
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Students fetched')
  list(@Query() query: ListStudentsDto) {
    return this.students.listStudents(query);
  }

  // --- literal sub-paths (MUST precede /:id) ---

  // Live KPI-card counters for the students list. Declared before /:id so 'stats'
  // is never parsed as a student id.
  @Get('stats')
  @ResponseMessage('Student stats fetched')
  stats() {
    return this.students.studentStats();
  }

  @Get('finance')
  @ResponseMessage('Student finance fetched')
  finance(@Query() query: ListFinanceDto) {
    return this.students.listFinance(query);
  }

  @Get('finance-summary')
  @ResponseMessage('Student finance summary fetched')
  financeSummary() {
    return this.students.financeSummary();
  }

  // Shares the student_document table with the application-document route
  // (PATCH/DELETE /applications/documents/:id). The :id here is the DOCUMENT id,
  // so the per-row ApplicationAccessGuard cannot be used; the service resolves the
  // owning application and runs the SAME record-access check (403 out of scope /
  // 404 missing). The permission slug mirrors the application twin.
  @Patch('documents/:id')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Student document updated')
  updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateDocument(id, dto, user);
  }

  @Delete('documents/:id')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Student document deleted')
  deleteDocument(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.deleteDocument(id, user);
  }

  // Literal `enrolments/:id` declared BEFORE the catch-all `:id` so 'enrolments'
  // is never parsed as a student id.
  @Delete('enrolments/:id')
  @ResponseMessage('Enrolment deleted')
  deleteEnrolment(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.deleteEnrolment(id, userId);
  }

  // --- /:id and its sub-resources ---

  // Returns the student row decorated with its joined user/course/university/
  // consultant fields plus a finance summary (invoice + payment roll-up). The
  // response keeps every original `students` column and `id`, so the additive
  // fields don't break existing consumers.
  //
  // ACCEPTED FOLLOW-UP (not fixed in this document-integrity pass): GET /students/:id,
  // GET /students/:id/timeline and GET /students/:id/qualifications are permission-
  // gated but carry NO per-record access scope — unlike /students/:id/documents, which
  // was scoped because it exposes stored file paths. These expose metadata (labels,
  // names, dates) but NO file paths, so they are the same record-access class yet
  // outside this fix's document-path scope. Worth a later dedicated pass to scope them
  // through RecordAccessService like the document routes.
  @Get(':id')
  @ResponseMessage('Student fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentDetail(id);
  }

  @Post()
  @ResponseMessage('Student created')
  create(@Body() dto: CreateStudentDto) {
    return this.students.createStudent(dto);
  }

  @Patch(':id')
  @ResponseMessage('Student updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStudentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.updateStudent(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Student deleted')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.students.deleteStudent(id);
  }

  @Patch(':id/dropout')
  @ResponseMessage('Student marked as dropout')
  dropout(@Param('id', ParseIntPipe) id: number) {
    return this.students.dropoutStudent(id);
  }

  @Patch(':id/credentials')
  @ResponseMessage('Credentials updated')
  credentials(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCredentialsDto,
  ) {
    return this.students.updateCredentials(id, dto);
  }

  @Get(':id/enrolled-courses')
  @ResponseMessage('Enrolled courses fetched')
  enrolledCourses(@Param('id', ParseIntPipe) id: number) {
    return this.students.getEnrolledCourses(id);
  }

  @Post(':id/enrolments')
  @ResponseMessage('Enrolment created')
  createEnrolment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateEnrolmentDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.createEnrolment(id, dto, userId);
  }

  @Post(':id/finance')
  @ResponseMessage('Finance details added')
  createFinance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertFinanceDto,
  ) {
    return this.students.createFinance(id, dto);
  }

  @Patch(':id/finance')
  @ResponseMessage('Finance details updated')
  updateFinance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertFinanceDto,
  ) {
    return this.students.updateFinance(id, dto);
  }

  @Get(':id/academic-grades')
  @ResponseMessage('Academic grades fetched')
  getAcademicGrades(@Param('id', ParseIntPipe) id: number) {
    return this.students.getAcademicGrades(id);
  }

  @Patch(':id/academic-grades')
  @ResponseMessage('Academic grades updated')
  updateAcademicGrades(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AcademicGradesDto,
  ) {
    return this.students.updateAcademicGrades(id, dto);
  }

  @Get(':id/courses')
  @ResponseMessage('Student courses fetched')
  courses(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentCourses(id);
  }

  // Returns student_document rows INCLUDING their stored file paths, so it carries
  // the SAME slug + record-access scoping as the other document reads: the service
  // resolves the student's linked application and runs assertCanView (or the student
  // record-access rule when the student has no linked application). Without this, any
  // student PK leaked every owner's document file paths — the feed that made the
  // (now subdir-restricted) GET /files/serve hole exploitable.
  @Get(':id/documents')
  @RequirePermission('crm:applications.view')
  @ResponseMessage('Student documents fetched')
  documents(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.getStudentDocuments(id, user);
  }

  // What happened to the student, newest first, from their real records
  // (application, conversion, payments, invoices, documents, enrolments).
  @Get(':id/timeline')
  @ResponseMessage('Student timeline fetched')
  timeline(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentTimeline(id);
  }

  @Get(':id/qualifications')
  @ResponseMessage('Student qualifications fetched')
  qualifications(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentQualifications(id);
  }

  @Patch(':id/qualifications')
  @ResponseMessage('Student qualifications updated')
  updateQualifications(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQualificationsDto,
  ) {
    return this.students.updateStudentQualifications(id, dto);
  }

  @Delete(':id/qualifications/:qual')
  @ResponseMessage('Student qualification cleared')
  clearQualification(
    @Param('id', ParseIntPipe) id: number,
    @Param('qual') qual: string,
  ) {
    return this.students.clearStudentQualification(id, qual);
  }
}
