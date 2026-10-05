import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ConsultantsService } from './consultants.service';
import { CreateConsultantDto } from './dto/create-consultant.dto';
import { UpdateConsultantDto } from './dto/update-consultant.dto';
import { ListConsultantsDto } from './dto/list-consultants.dto';
import { ListAdmissionsDto } from './dto/list-admissions.dto';
import { SetUniversitiesDto } from './dto/set-universities.dto';
import {
  AssignTeamDto,
  CreateCounsellorGroupDto,
  UpdateCounsellorGroupDto,
} from './dto/counsellor-group.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff-facing consultant management. Protected by the global JwtAuthGuard.
 * Port of CI4 App\Controllers\App\Consultant. A consultant is a `users` row
 * with role_id = 6.
 *
 * ROUTE ORDER MATTERS: the literal paths (/performance, /admissions,
 * /admissions/:student_id) are declared BEFORE the GET /:id catch-all so Nest's
 * path matcher does not capture them as an :id. List endpoints use @Query() DTOs
 * (with @Type coercion) rather than per-param ParseIntPipe, which conflicts with
 * the global transform ValidationPipe.
 */
@Controller('consultants')
export class ConsultantsController {
  constructor(private readonly consultants: ConsultantsService) {}

  @Get()
  @ResponseMessage('Consultants')
  findAll(@Query() query: ListConsultantsDto) {
    return this.consultants.findAll(query);
  }

  // --- literal paths BEFORE :id --------------------------------------------

  @Get('performance')
  @ResponseMessage('Consultant performance')
  performanceAll(@Query() query: ListConsultantsDto) {
    return this.consultants.performanceAll(query);
  }

  @Get('admissions')
  @ResponseMessage('Admissions')
  admissions(@Query() query: ListAdmissionsDto) {
    return this.consultants.admissions(query);
  }

  @Get('groups')
  @ResponseMessage('Counsellor groups')
  groups() {
    return this.consultants.groups();
  }

  // Counsellor groups — the top of the Group -> Team -> Counsellor hierarchy.
  // Declared above GET /:id so 'groups' is never captured as an id.
  @Post('groups')
  @ResponseMessage('Counsellor group created')
  createGroup(
    @Body() dto: CreateCounsellorGroupDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.createGroup(dto, userId);
  }

  @Patch('groups/:id')
  @ResponseMessage('Counsellor group updated')
  updateGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCounsellorGroupDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.updateGroup(id, dto, userId);
  }

  @Delete('groups/:id')
  @ResponseMessage('Counsellor group deleted')
  removeGroup(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.removeGroup(id, userId);
  }

  /** Put a team under a group (or detach it with group_id: null). */
  @Patch('teams/:id/group')
  @ResponseMessage('Team group updated')
  assignTeamGroup(
    @Param('id', ParseIntPipe) id: number,
    @Body('group_id') groupId: number | null,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.assignTeamGroup(id, groupId ?? null, userId);
  }

  @Get('admissions/:student_id')
  @ResponseMessage('Admission')
  admissionDetail(
    @Param('student_id', ParseIntPipe) studentId: number,
  ) {
    return this.consultants.admissionDetail(studentId);
  }

  // --- :id routes -----------------------------------------------------------

  @Get(':id')
  @ResponseMessage('Consultant')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consultants.findOne(id);
  }

  /** Transfer a counsellor to another team (spec 2.1). */
  @Patch(':id/team')
  @ResponseMessage('Counsellor team updated')
  assignTeam(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTeamDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.assignTeam(id, dto, userId);
  }

  @Get(':id/performance')
  @ResponseMessage('Consultant performance')
  performanceOne(@Param('id', ParseIntPipe) id: number) {
    return this.consultants.performanceOne(id);
  }

  @Get(':id/universities')
  @ResponseMessage('Assigned universities')
  getUniversities(@Param('id', ParseIntPipe) id: number) {
    return this.consultants.getUniversities(id);
  }

  @Put(':id/universities')
  @ResponseMessage('Assigned universities updated successfully!')
  replaceUniversities(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetUniversitiesDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.replaceUniversities(id, dto.university_ids, userId);
  }

  @Delete(':id/universities/:university_id')
  @ResponseMessage('University removed successfully!')
  removeUniversity(
    @Param('id', ParseIntPipe) id: number,
    @Param('university_id', ParseIntPipe) universityId: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.removeUniversity(id, universityId, userId);
  }

  @Post()
  @ResponseMessage('Consultant added successfully!')
  create(
    @Body() dto: CreateConsultantDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.create(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Consultant updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConsultantDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.update(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Consultant deleted successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.remove(id, userId);
  }
}
