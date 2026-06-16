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
import { InstitutionsService } from './institutions.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { ListInstitutionsDto } from './dto/list-institutions.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Institutions (users with role_id=5) CRUD. Protected by the global
 * JwtAuthGuard (no @Public). The {status,message,data} envelope is added
 * automatically by ResponseInterceptor — handlers just return data.
 * Port of CI4 App/Controllers/App/Institutions.
 */
@Controller('institutions')
export class InstitutionsController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get()
  @ResponseMessage('Institutions fetched')
  list(@Query() query: ListInstitutionsDto) {
    return this.institutions.listInstitutions(query);
  }

  @Get(':id')
  @ResponseMessage('Institution fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.institutions.getInstitution(id);
  }

  @Post()
  @ResponseMessage('Institutions Added Successfully!')
  create(
    @Body() dto: CreateInstitutionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.institutions.createInstitution(dto, userId);
  }

  // Declared before PATCH `:id` so the literal `password` segment wins routing.
  @Patch(':id/password')
  @ResponseMessage('Password Updated Successfully!')
  resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.institutions.resetPassword(id, dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Institutions Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInstitutionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.institutions.updateInstitution(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Institutions Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.institutions.deleteInstitution(id, userId);
  }
}

/**
 * Standalone @Controller('users') exposing the small read GET /users/:id/university.
 * Distinct path — does not collide with the existing GET users/:id (platform) or
 * PATCH users/:id/password (sales). Lives here because it reads the university
 * associated with a user, which this module owns.
 */
@Controller('users')
export class UserUniversityController {
  constructor(private readonly institutions: InstitutionsService) {}

  @Get(':id/university')
  @ResponseMessage('University fetched')
  university(@Param('id', ParseIntPipe) id: number) {
    return this.institutions.getUserUniversity(id);
  }
}
