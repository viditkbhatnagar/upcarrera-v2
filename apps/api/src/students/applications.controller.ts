import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { StudentsService } from './students.service';
import { ListApplicationsDto } from './dto/list-applications.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff-only admission applications endpoints (protected by the global JwtAuthGuard).
 * Mirrors CI4 App/Application read endpoints. The convert() saga is phase 3.
 */
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @ResponseMessage('Applications fetched')
  list(@Query() query: ListApplicationsDto) {
    return this.students.listApplications(query);
  }

  @Get(':id')
  @ResponseMessage('Application fetched')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.students.getApplication(id);
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
