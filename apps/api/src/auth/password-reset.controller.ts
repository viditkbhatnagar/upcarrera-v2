import { Body, Controller, HttpCode, Ip, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { PasswordResetService } from './password-reset.service';
import { ForgotPasswordDto, ResetWithOtpDto } from './dto/password-reset.dto';

/** Stricter than the global pipe: reject unknown keys on these auth payloads. */
const strictPipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

/**
 * Unauthenticated password recovery. @Public() opts these out of the staff
 * JwtAuthGuard. They live under /api/public/* so the nginx `applicant` limiter
 * (120 req/min/IP) applies; the service adds per-user + per-code caps.
 *
 * Both endpoints answer uniformly whether or not the account exists (no
 * enumeration): forgot-password always returns the same 200, and reset-password
 * returns one generic error for every account/code failure.
 */
@Public()
@Controller('public/auth')
@UsePipes(strictPipe)
export class PasswordResetController {
  constructor(private readonly service: PasswordResetService) {}

  @Post('forgot-password')
  @HttpCode(200)
  @ResponseMessage('If an account exists for that email or user ID, a reset code is on its way.')
  forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string): { ok: true } {
    // Fire-and-forget: the service does all lookup/create/email work in the
    // background and never throws, so the response is a fixed 200 in constant
    // time regardless of whether the account exists (no enumeration).
    this.service.requestReset(dto.identifier, ip ?? null);
    return { ok: true };
  }

  @Post('reset-password')
  @HttpCode(200)
  @ResponseMessage('Your password has been reset. You can now sign in.')
  async resetPassword(@Body() dto: ResetWithOtpDto, @Ip() ip: string): Promise<{ ok: true }> {
    await this.service.resetWithOtp(dto.identifier, dto.otp, dto.password, ip ?? null);
    return { ok: true };
  }
}
