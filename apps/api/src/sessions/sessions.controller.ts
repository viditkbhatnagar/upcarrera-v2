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
import { ZoomService } from '../integrations/zoom.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { ListSessionsDto } from './dto/list-sessions.dto';
import { BulkSessionsDto } from './dto/bulk-sessions.dto';
import { RescheduleSessionDto } from './dto/reschedule-session.dto';
import { MeetingSdkJwtQueryDto } from '../zoom/dto/meeting-sdk-jwt.dto';

// Zoom Meeting SDK roles: 0 = attendee (default), 1 = host.
const SDK_ROLE_ATTENDEE = 0;

/**
 * Staff-only endpoints for live class sessions. Protected by the global
 * JwtAuthGuard (no @Public). Mirrors CI4 App\Controllers\App\Sessions.
 */
@Controller('sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly zoom: ZoomService,
  ) {}

  @Get()
  @ResponseMessage('Sessions fetched successfully!')
  list(@Query() query: ListSessionsDto) {
    return this.sessions.listSessions(query);
  }

  /**
   * Generate a Zoom Meeting SDK JWT for a meeting number. Port of
   * App\Controllers\Api\Student\Sessions::generate_jwt_token() — natively signed
   * via ZoomService (no external proxy).
   *
   * ROUTE ORDER: this literal `zoom-jwt` segment is declared BEFORE `@Get(':id')`
   * so it is never captured by the param route (and SessionsController is
   * registered ahead of ZoomModule, so the literal must live here to win). When
   * the Meeting SDK env credentials are absent, ZoomService throws
   * ServiceUnavailableException (HTTP 503, 'Zoom not configured') — acceptable
   * per the integration's env-gated design.
   */
  @Get('zoom-jwt')
  @ResponseMessage('Zoom JWT generated successfully!')
  zoomJwt(@Query() query: MeetingSdkJwtQueryDto) {
    const role = query.role ?? SDK_ROLE_ATTENDEE;
    const signature = this.zoom.getMeetingSdkSignature(
      query.meeting_number,
      role,
    );
    return {
      signature,
      meeting_number: query.meeting_number,
      role,
      // SDK key is public-by-design (the secret is never returned).
      sdk_key: process.env.ZOOM_SDK_KEY ?? null,
    };
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

  // Literal sub-path POST — declared before the bare @Post() (and ahead of the
  // `:id` routes) so /sessions/bulk is never captured by /sessions/:id.
  @Post('bulk')
  @ResponseMessage('Sessions added successfully!')
  bulk(@Body() dto: BulkSessionsDto, @CurrentUser('id') userId: number) {
    return this.sessions.bulkCreateSessions(dto, userId);
  }

  @Post()
  @ResponseMessage('Session added successfully!')
  create(@Body() dto: CreateSessionDto) {
    return this.sessions.createSession(dto);
  }

  // ---- reschedule + attendance --------------------------------------------
  // All 3-segment `:id/...` literals — unambiguous against the 2-segment
  // `:id` GET/PATCH/DELETE handlers below (different depth).

  /**
   * Reschedule a session's date/time. NOTE: the thin v2 `sessions` table has no
   * schedule columns yet, so the service bumps updated_at and echoes the
   * requested schedule back (persisted:false). See rescheduleSession's
   * TODO(prod-table).
   */
  @Patch(':id/reschedule')
  @ResponseMessage('Session rescheduled successfully!')
  reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RescheduleSessionDto,
  ) {
    return this.sessions.rescheduleSession(id, dto);
  }

  /** Student attendance check-in (inserts a session_attendance row). */
  @Post(':id/attendance/checkin')
  @ResponseMessage('Attendance check-in recorded successfully!')
  attendanceCheckin(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') studentId: number,
  ) {
    return this.sessions.checkinAttendance(id, studentId);
  }

  /** Student attendance check-out (sets end_time on the student's row). */
  @Patch(':id/attendance/checkout')
  @ResponseMessage('Attendance check-out recorded successfully!')
  attendanceCheckout(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') studentId: number,
  ) {
    return this.sessions.checkoutAttendance(id, studentId);
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
