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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDemoSessionDto } from './dto/create-demo-session.dto';
import { UpdateDemoSessionDto } from './dto/update-demo-session.dto';
import { ShareDemoSessionDto } from './dto/share-demo-session.dto';
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

  // Literal sub-path POST — declared before the `:id` routes so /:id/share is
  // not captured by a bare `:id` handler.
  @Post(':id/share')
  @ResponseMessage('Demo session link shared successfully!')
  share(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ShareDemoSessionDto,
  ) {
    return this.sessions.shareDemoSession(id, dto);
  }

  @Patch(':id')
  @ResponseMessage('Demo session updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDemoSessionDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sessions.updateDemoSession(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Demo session deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sessions.removeDemoSession(id);
  }
}
