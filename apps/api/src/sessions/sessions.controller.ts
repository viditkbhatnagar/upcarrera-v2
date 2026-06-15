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
import { SessionsService } from './sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';

/**
 * Staff-only endpoints for live class sessions. Protected by the global
 * JwtAuthGuard (no @Public). Mirrors CI4 App\Controllers\App\Sessions.
 */
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ResponseMessage('Sessions fetched successfully!')
  list(@Query() query: ListSessionsDto) {
    return this.sessions.listSessions(query);
  }

  @Get(':id')
  @ResponseMessage('Session fetched successfully!')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.sessions.getSession(id);
  }

  @Get(':id/attendance')
  @ResponseMessage('Session attendance fetched successfully!')
  attendance(@Param('id', ParseIntPipe) id: number) {
    return this.sessions.getSessionAttendance(id);
  }

  @Post()
  @ResponseMessage('Session added successfully!')
  create(@Body() dto: CreateSessionDto) {
    return this.sessions.createSession(dto);
  }

  @Patch(':id')
  @ResponseMessage('Session updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessions.updateSession(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Session deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sessions.removeSession(id);
  }
}
