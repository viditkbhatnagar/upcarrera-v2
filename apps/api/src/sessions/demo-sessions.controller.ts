import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';
import { ListDemoSessionsDto } from './dto/list-demo-sessions.dto';

/**
 * Staff-only endpoints for demo sessions. Protected by the global JwtAuthGuard
 * (no @Public). Mirrors CI4 App\Controllers\App\Demo_sessions.
 */
@Controller('demo-sessions')
export class DemoSessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ResponseMessage('Demo sessions fetched successfully!')
  list(@Query() query: ListDemoSessionsDto) {
    return this.sessions.listDemoSessions(query);
  }

  @Post()
  @ResponseMessage('Demo session added successfully!')
  create(@Body() dto: CreateDemoSessionDto) {
    return this.sessions.createDemoSession(dto);
  }
}
