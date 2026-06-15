import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { IntegrationsModule } from '../integrations/integrations.module';

/**
 * Notifications send + manage. PrismaService is injected from the @Global()
 * PrismaModule. IntegrationsModule is imported so EmailService (exported there)
 * is available for opt-in transactional emails on POST /notifications/send.
 *
 * Must be registered in app.module.ts (integration step does that).
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
