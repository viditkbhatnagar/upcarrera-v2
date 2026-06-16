import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ZoomUsersController } from './zoom-users.controller';
import { ZoomSessionsController } from './zoom-sessions.controller';
import { ZoomSessionsService } from './zoom-sessions.service';

/**
 * Zoom domain: user-management proxy (/api/zoom/users) and session-scoped
 * launch/start endpoints (/api/sessions/:id/zoom-launch | zoom-start).
 *
 * Imports IntegrationsModule to inject the shared ZoomService (S2S OAuth + REST
 * user methods + Meeting SDK signature). PrismaService comes from the @Global()
 * PrismaModule, so it is not re-declared here — mirrors SessionsModule.
 *
 * Ports the legacy App\Controllers\App\Zoom_users and App\Controllers\Zoom.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [ZoomUsersController, ZoomSessionsController],
  providers: [ZoomSessionsService],
  exports: [ZoomSessionsService],
})
export class ZoomModule {}
