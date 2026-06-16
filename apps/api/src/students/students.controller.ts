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

  @Patch('documents/:id')
  @ResponseMessage('Student document updated')
  updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.students.updateDocument(id, dto);
  }

  @Delete('documents/:id')
  @ResponseMessage('Student document deleted')
  deleteDocument(@Param('id', ParseIntPipe) id: number) {
    return this.students.deleteDocument(id);
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
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateStudentDto) {
    return this.students.updateStudent(id, dto);
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

  @Get(':id/documents')
  @ResponseMessage('Student documents fetched')
  documents(@Param('id', ParseIntPipe) id: number) {
    return this.students.getStudentDocuments(id);
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
