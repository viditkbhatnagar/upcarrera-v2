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
import { NotificationsService } from './notifications.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Notifications send + manage. Protected by the global JwtAuthGuard (no
 * @Public). Routes live under distinct /notifications sub-paths so they never
 * collide with the existing GET /notifications in the platform module.
 *
 * Ports the write side of App/Controllers/App/Notifications.php and the
 * per-user read filter from App/Helpers/notifications_helper.php.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Post('send')
  @ResponseMessage('Notification sent')
  send(@Body() dto: SendNotificationDto, @CurrentUser('id') userId: number) {
    return this.notifications.send(dto, userId);
  }

  @Get('mine')
  @ResponseMessage('Notifications fetched')
  findMine(
    @Query() query: ListNotificationsDto,
    @CurrentUser('id') userId: number,
    @CurrentUser('role_id') roleId: number | null,
  ) {
    return this.notifications.findMine(query, userId, roleId);
  }

  // ROUTE ORDER: the literal-suffix route ':id/read' is declared BEFORE the bare
  // ':id' below. They sit at different path depths so Express never confuses
  // them, but keeping the more specific one first makes the ordering explicit
  // and matches the rest of the codebase's literal-before-param convention.
  @Patch(':id/read')
  @ResponseMessage('Notification marked read')
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.notifications.markRead(id, userId);
  }

  /**
   * Update a notification's editable fields (title/description/role_id/user_id).
   * Ports CI4 Notifications::edit(). Partial: only supplied fields are written.
   */
  @Patch(':id')
  @ResponseMessage('Notification updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNotificationDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.notifications.update(id, dto, userId);
  }

  /** Soft-delete a notification. Ports CI4 Notifications::delete(). */
  @Delete(':id')
  @ResponseMessage('Notification deleted')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.notifications.remove(id, userId);
  }
}
