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
  UseGuards,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { ApplicationCourseFeeDto } from './dto/application-course-fee.dto';
import { ApplicationAcademicDto } from './dto/application-academic.dto';
import { UpdateQualificationsDto } from './dto/update-qualifications.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { CheckDuplicateApplicationDto } from './dto/check-duplicate-application.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ApplicationAccessGuard } from '../workflow/application-access.guard';
import type { AccessUser } from '../workflow/record-access.service';

/**
 * Staff-only admission applications endpoints. Every route now carries a
 * crm: permission (PermissionsGuard) and, for :id routes, the row-level
 * ApplicationAccessGuard (404 missing / 403 out of scope). The workflow actions
 * (accept, payments, sa-review, hold ...) live in the WorkflowModule controllers.
 *
 * ROUTE ORDER: the literal /check-duplicate and /documents/:id routes are
 * declared BEFORE /:id so Nest matches the literal segment first.
 */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermission('crm:applications.index')
  @ResponseMessage('Applications fetched')
  list(@Query() query: ListApplicationsDto, @CurrentUser() user: AccessUser) {
    return this.students.listApplications(query, user);
  }

  @Post()
  @RequirePermission('crm:applications.create')
  @ResponseMessage('Application Added Successfully!')
  create(@Body() dto: CreateApplicationDto, @CurrentUser('id') userId: number) {
    return this.students.createApplication(dto, userId);
  }

  // --- literal sub-paths (MUST precede /:id) ---

  @Get('check-duplicate')
  @RequirePermission('crm:applications.index')
  @ResponseMessage('Duplicate check complete')
  checkDuplicate(@Query() query: CheckDuplicateApplicationDto) {
    return this.students.findDuplicateApplications(query);
  }

  @Patch('documents/:id')
  @RequirePermission('crm:applications.edit')
  @ResponseMessage('Application document updated')
  updateDocument(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateApplicationDocument(id, dto, user);
  }

  // --- /:id and its sub-resources ---

  @Get(':id')
  @RequirePermission('crm:applications.view')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application fetched')
  get(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessUser) {
    return this.students.getApplicationDetail(id, user);
  }

  @Get(':id/activity')
  @RequirePermission('crm:applications.view')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application activity fetched')
  activity(@Param('id', ParseIntPipe) id: number) {
    return this.students.getApplicationActivity(id);
  }

  @Patch(':id')
  @RequirePermission('crm:applications.edit')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateApplicationDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateApplication(id, dto, user);
  }

  @Patch(':id/course-fee')
  @RequirePermission('crm:applications.admin')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application Course Fee Updated Successfully!')
  courseFee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationCourseFeeDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateApplicationCourseFee(id, dto, user);
  }

  @Patch(':id/academic')
  @RequirePermission('crm:applications.edit')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application UPDATED Successfully!')
  academic(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApplicationAcademicDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateApplicationAcademic(id, dto, user);
  }

  @Patch(':id/qualifications')
  @RequirePermission('crm:applications.edit')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Student Qualification Updated Successfully!')
  qualifications(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateQualificationsDto,
    @CurrentUser() user: AccessUser,
  ) {
    return this.students.updateApplicationQualifications(id, dto, user);
  }

  @Delete(':id')
  @RequirePermission('crm:applications.admin')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application Deleted Successfully!')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessUser) {
    return this.students.deleteApplication(id, user);
  }

  @Post(':id/convert')
  @RequirePermission('crm:applications.admin')
  @UseGuards(ApplicationAccessGuard)
  @ResponseMessage('Application converted to student')
  convert(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AccessUser) {
    return this.students.convertApplication(id, user);
  }
}
