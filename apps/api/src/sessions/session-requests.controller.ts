import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ListSessionRequestsDto } from './dto/list-session-requests.dto';
import { UpdateSessionRequestDto } from './dto/update-session-request.dto';

/**
 * Staff-only endpoints for extra-session requests. Protected by the global
 * JwtAuthGuard (no @Public). Mirrors CI4 App\Controllers\App\Session_request.
 */
@Controller('session-requests')
export class SessionRequestsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  @ResponseMessage('Session requests fetched successfully!')
  list(@Query() query: ListSessionRequestsDto) {
    return this.sessions.listSessionRequests(query);
  }

  // Literal sub-path PATCH — declared before the bare `:id` PATCH so
  // /:id/approve is not captured by /:id.
  @Patch(':id/approve')
  @ResponseMessage('Session request approved successfully!')
  approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.sessions.approveSessionRequest(id, userId);
  }

  @Patch(':id')
  @ResponseMessage('Session request updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSessionRequestDto,
  ) {
    return this.sessions.updateSessionRequest(id, dto);
  }

  @Delete(':id')
  @ResponseMessage('Session request deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sessions.removeSessionRequest(id);
  }
}
