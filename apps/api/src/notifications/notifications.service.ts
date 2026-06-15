import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { SendNotificationDto } from './dto/send-notification.dto';
import { ListNotificationsDto } from './dto/list-notifications.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const BROADCAST_USER_ID = 0;

/**
 * Notifications send + manage.
 *
 * Ports the write side of CI4 App/Controllers/App/Notifications.php and the
 * read filter from App/Helpers/notifications_helper.php::get_notifications():
 * a notification reaches a user when its `user_id` is the user, or 0
 * (broadcast), or its `role_id` matches the user's role.
 *
 * Schema note: the `notifications` model has NO `is_read` column (only
 * created_at/updated_at/deleted_at + *_by audit columns). "Mark read" is
 * therefore implemented as a soft-delete (set deleted_at/deleted_by), which
 * mirrors the legacy remove() the UI used to dismiss a notification and keeps
 * the row out of the unread feed. See markRead() / TODO below.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  /**
   * Create a notification row. If `email` is true and the target user has an
   * email address, also fire a transactional email — but never let an email
   * failure (unconfigured Brevo, network error, broadcast with no single
   * recipient) block the row creation.
   */
  async send(dto: SendNotificationDto, userId: number) {
    const now = new Date();

    const created = await this.prisma.notifications.create({
      data: {
        title: dto.title,
        description: dto.message,
        role_id: dto.role_id ?? null,
        user_id: dto.user_id ?? BROADCAST_USER_ID,
        created_by: userId,
        created_at: now,
      },
    });

    if (dto.email) {
      await this.tryEmail(dto, created.user_id);
    }

    return created;
  }

  /**
   * Best-effort transactional email to the target user. A broadcast
   * (user_id = 0) has no single recipient, so it is skipped. Any failure is
   * logged and swallowed so the notification row still stands.
   */
  private async tryEmail(
    dto: SendNotificationDto,
    targetUserId: number | null,
  ): Promise<void> {
    try {
      if (!targetUserId || targetUserId === BROADCAST_USER_ID) {
        this.logger.debug('Email skipped: broadcast has no single recipient');
        return;
      }

      const user = await this.prisma.users.findFirst({
        where: { id: targetUserId, deleted_at: null },
        select: { name: true, email: true },
      });

      if (!user?.email) {
        this.logger.debug(`Email skipped: user ${targetUserId} has no email`);
        return;
      }

      await this.email.sendEmail({
        to: user.email,
        name: user.name ?? 'User',
        subject: dto.title,
        html: `<p>${dto.message}</p>`,
      });
    } catch (err) {
      // Brevo unconfigured throws ServiceUnavailableException — that, and any
      // transport error, must not fail the request. Row is already created.
      this.logger.warn(
        `Notification email not sent: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Notifications visible to the current user, newest first, paginated.
   * Matches the legacy helper: user_id = me OR user_id = 0 (broadcast) OR
   * role_id = my role. Soft-deleted rows are excluded.
   */
  async findMine(
    query: ListNotificationsDto,
    userId: number,
    roleId: number | null | undefined,
  ) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const orConditions: Array<Record<string, number>> = [
      { user_id: userId },
      { user_id: BROADCAST_USER_ID },
    ];
    if (roleId !== null && roleId !== undefined) {
      orConditions.push({ role_id: roleId });
    }

    const where = {
      deleted_at: null,
      OR: orConditions,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notifications.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.notifications.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Mark a notification read. The schema has no is_read flag, so this performs
   * a soft-delete (deleted_at/deleted_by) to dismiss it from the feed.
   *
   * TODO: when a dedicated `is_read tinyint` / `read_at datetime` column is
   * added to the notifications table, switch this to set that flag instead of
   * soft-deleting, so dismissed-vs-read can be distinguished.
   */
  async markRead(id: number, userId: number) {
    const existing = await this.prisma.notifications.findFirst({
      where: { id, deleted_at: null },
    });
    if (!existing) {
      throw new NotFoundException('Notification not found!');
    }

    return this.prisma.notifications.update({
      where: { id },
      data: {
        deleted_at: new Date(),
        deleted_by: userId,
      },
    });
  }
}
