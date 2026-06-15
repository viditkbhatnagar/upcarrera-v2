import { Module } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { DemoSessionsController } from './demo-sessions.controller';
import { SessionRequestsController } from './session-requests.controller';
import { SessionsService } from './sessions.service';

/**
 * Sessions domain: live class sessions, demo sessions and extra-session
 * requests (+ attendance read). PrismaService is provided globally by the
 * @Global() PrismaModule, so no import is needed here.
 */
@Module({
  controllers: [
    SessionsController,
    DemoSessionsController,
    SessionRequestsController,
  ],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
