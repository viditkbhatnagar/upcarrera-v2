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
import { ListApplicationsDto } from './dto/list-applications.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationCourseFeeDto } from './dto/application-course-fee.dto';
import { ApplicationAcademicDto } from './dto/application-academic.dto';
import { UpdateQualificationsDto } from './dto/update-qualifications.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff-only admission applications endpoints (protected by the global JwtAuthGuard).
 * Mirrors CI4 App/Application.
 *
 * ROUTE ORDER: the literal /documents/:id route is declared BEFORE /:id so Nest
 * matches the literal segment first.
 */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Applications fetched')
  list(@Query() query: ListApplicationsDto) {
    return this.students.listApplications(query);
  }

  @Post()
  @ResponseMessage('Application Added Successfully!')
  create(
    @Body() dto: CreateApplicationDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.createApplication(dto, userId);
  }

  // --- literal sub-path (MUST precede /:id) ---

  @Patch('documents/:id')
  @ResponseMessage('Application document updated')
  updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.students.updateApplicationDocument(id, dto);
  }

  // --- /:id and its sub-resources ---

  @Get(':id')
  @ResponseMessage('Application fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.students.getApplication(id);
  }

  @Get(':id/activity')
  @ResponseMessage('Application activity fetched')
  activity(@Param('id', ParseIntPipe) id: number) {
    return this.students.getApplicationActivity(id);
  }

  @Patch(':id')
  @ResponseMessage('Application updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.updateApplication(id, dto, userId);
  }

  @Patch(':id/course-fee')
  @ResponseMessage('Application Course Fee Updated Successfully!')
  courseFee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationCourseFeeDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.updateApplicationCourseFee(id, dto, userId);
  }

  @Patch(':id/academic')
  @ResponseMessage('Application UPDATED Successfully!')
  academic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationAcademicDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.updateApplicationAcademic(id, dto, userId);
  }

  @Patch(':id/qualifications')
  @ResponseMessage('Student Qualification Updated Successfully!')
  qualifications(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQualificationsDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.updateApplicationQualifications(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Application Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.students.deleteApplication(id);
  }

  @Post(':id/convert')
  @ResponseMessage('Application converted to student')
  convert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.students.convertApplication(id, userId);
  }
}
