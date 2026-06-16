import { Module } from '@nestjs/common';
import { IntegrationsModule } from '../integrations/integrations.module';
import { SessionsController } from './sessions.controller';
import { DemoSessionsController } from './demo-sessions.controller';
import { SessionRequestsController } from './session-requests.controller';
import { TeacherSchedulesLookupController } from './teacher-schedules-lookup.controller';
import { SessionReportsController } from './session-reports.controller';
import { SessionsService } from './sessions.service';

/**
 * Sessions domain: live class sessions, demo sessions and extra-session
 * requests (+ attendance read), bulk scheduling, teacher-schedule lookups and
 * the teacher session attendance report. PrismaService is provided globally by
 * the @Global() PrismaModule. IntegrationsModule is imported so EmailService
 * (exported there) can be injected by SessionsService for demo-session sharing.
 */
@Module({
  imports: [IntegrationsModule],
  controllers: [
    SessionsController,
    DemoSessionsController,
    SessionRequestsController,
    TeacherSchedulesLookupController,
    SessionReportsController,
  ],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
