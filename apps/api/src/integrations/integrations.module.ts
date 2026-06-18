import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { ZoomService } from './zoom.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { OtpService } from './otp.service';

/**
 * External integration providers (Zoom, Microsoft 365 email, 2factor SMS) plus the
 * phone-OTP flow. PrismaService comes from the @Global() PrismaModule, so it is
 * not re-declared here — mirrors LeadsModule/AuthModule.
 *
 * All four providers are exported so other feature modules (sessions, sagas,
 * notifications) can inject them directly.
 */
@Module({
  controllers: [IntegrationsController],
  providers: [ZoomService, EmailService, SmsService, OtpService],
  exports: [ZoomService, EmailService, SmsService, OtpService],
})
export class IntegrationsModule {}
