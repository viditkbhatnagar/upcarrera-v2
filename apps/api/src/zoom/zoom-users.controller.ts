import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ZoomService } from '../integrations/zoom.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { InviteZoomUserDto } from './dto/invite-zoom-user.dto';

/**
 * Zoom user management proxy. Ports App\Controllers\App\Zoom_users (which used
 * App\Libraries\Zoom) onto the native ZoomService REST methods.
 *
 * Served under /api/zoom (global prefix in main.ts). Behind the global
 * JwtAuthGuard like every other staff route. When Zoom S2S OAuth credentials
 * are absent, ZoomService throws ServiceUnavailableException (HTTP 503,
 * 'Zoom not configured') — acceptable per the integration's env-gated design.
 *
 * Literal sub-paths (/users/pending) are declared before the parametrised
 * DELETE /users/:userId so route matching stays unambiguous.
 */
@Controller('zoom')
export class ZoomUsersController {
  constructor(private readonly zoom: ZoomService) {}

  /** Active Zoom users (Zoom_users::index -> Zoom::listUsers). */
  @Get('users')
  @ResponseMessage('Zoom users fetched successfully!')
  async listUsers() {
    const items = await this.zoom.listUsers('active');
    return { items, total: items.length };
  }

  /** Pending-invite Zoom users (Zoom_users::pending -> Zoom::listPendingUsers). */
  @Get('users/pending')
  @ResponseMessage('Pending Zoom users fetched successfully!')
  async listPendingUsers() {
    const items = await this.zoom.listUsers('pending');
    return { items, total: items.length };
  }

  /** Invite a new Zoom user (Zoom_users::add -> Zoom::addUser). */
  @Post('users')
  @ResponseMessage('Invited to Zoom successfully!')
  inviteUser(@Body() dto: InviteZoomUserDto) {
    return this.zoom.addUser(dto.email, dto.firstName, dto.lastName);
  }

  /** Remove a Zoom user (Zoom_users::delete_user -> Zoom::deleteUser). */
  @Delete('users/:userId')
  @ResponseMessage('User removed successfully!')
  async removeUser(@Param('userId') userId: string) {
    await this.zoom.deleteUser(userId);
    return { userId };
  }
}
