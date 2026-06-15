import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { ZoomService } from './zoom.service';
import { EmailService } from './email.service';
import { SmsService } from './sms.service';
import { OtpService } from './otp.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

/**
 * External-integration surface: a public health probe plus the phone-OTP flow.
 * Routes are served under /api/integrations (global prefix in main.ts).
 *
 * OTP endpoints are intentionally NOT @Public — they sit behind the global
 * JwtAuthGuard like every other authenticated route. The health probe is the
 * only public route here so ops/clients can check config without a token.
 */
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly zoom: ZoomService,
    private readonly email: EmailService,
    private readonly sms: SmsService,
    private readonly otp: OtpService,
  ) {}

  /**
   * Which integration credentials are present. Booleans only — never the
   * secrets themselves.
   */
  @Public()
  @Get('health')
  @ResponseMessage('Integration health')
  health() {
    return {
      zoom: this.zoom.isConfigured,
      email: this.email.isConfigured,
      sms: this.sms.isConfigured,
    };
  }

  @Post('otp/send')
  @ResponseMessage('OTP sent')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.otp.send(dto.phone);
  }

  @Post('otp/verify')
  @ResponseMessage('OTP verified')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otp.verify(dto.phone, dto.otp);
  }
}
