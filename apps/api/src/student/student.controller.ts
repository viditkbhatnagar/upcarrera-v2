import { Controller, Get, Query } from '@nestjs/common';
import { StudentService } from './student.service';
import { ListStudentSessionsDto } from './dto/list-sessions.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Logged-in student's mobile-API surface (port of CI4 Api/Student/*).
 *
 * Behind the global JwtAuthGuard. EVERY endpoint is scoped to the authenticated
 * student via @CurrentUser('id') — the student's own user id. Read-only this phase.
 */
@Controller('student')
export class StudentController {
  constructor(private readonly student: StudentService) {}

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
}
