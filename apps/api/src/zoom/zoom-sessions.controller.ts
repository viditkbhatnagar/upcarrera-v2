import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ZoomSessionsService } from './zoom-sessions.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/**
 * Session-scoped Zoom launch/start endpoints. Ports App\Controllers\Zoom::index
 * (join) and ::start (host) onto the existing sessions + live_settings tables.
 *
 * Served under /api/sessions (global prefix). Both routes are 3-segment
 * (/sessions/:id/zoom-launch, /sessions/:id/zoom-start) so they do NOT collide
 * with the SessionsModule's 2-segment /sessions/:id — different depth, no
 * duplicate-route risk. Behind the global JwtAuthGuard like the rest.
 */
@Controller('sessions')
export class ZoomSessionsController {
  constructor(private readonly zoomSessions: ZoomSessionsService) {}

  /** Join-page data: session row + Zoom meeting id/password. */
  @Get(':id/zoom-launch')
  @ResponseMessage('Zoom launch details fetched successfully!')
  launch(@Param('id', ParseIntPipe) id: number) {
    return this.zoomSessions.getLaunch(id);
  }

  /** Host start: SDK config + session data + host Meeting SDK signature. */
  @Get(':id/zoom-start')
  @ResponseMessage('Zoom start details fetched successfully!')
  start(@Param('id', ParseIntPipe) id: number) {
    return this.zoomSessions.getStart(id);
  }
}
