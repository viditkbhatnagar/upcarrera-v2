import {
  Body,
  Controller,
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

  @Patch(':id/read')
  @ResponseMessage('Notification marked read')
  markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.notifications.markRead(id, userId);
  }
}
