import { Module } from '@nestjs/common';
import { AinvoxService } from './ainvox.service';
import { AdminCallsController } from './calls.controller';
import { CallsFlowController } from './calls-flow.controller';

/**
 * Ainvox cloud-telephony: staff click-to-call + call history/recordings
 * (AdminCallsController, /api/admin/calls) and the public Ainvox call-control
 * webhooks (CallsFlowController, /api/calls). PrismaService comes from the
 * @Global PrismaModule. JWT + role guards are global (AppModule).
 */
@Module({
  controllers: [AdminCallsController, CallsFlowController],
  providers: [AinvoxService],
  exports: [AinvoxService],
})
export class CallsModule {}
