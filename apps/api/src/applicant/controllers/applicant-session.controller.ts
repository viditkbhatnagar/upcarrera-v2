import {
  Body,
  Controller,
  HttpCode,
  Ip,
  NotFoundException,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { PublicSessionService } from '../public-session.service';
import { ApplicantThrottlerGuard } from '../throttler/applicant-throttler.guard';
import { THROTTLE_SESSION } from '../throttler/applicant-throttle';
import { ExchangeSessionDto } from '../dto/public-form.dto';

/**
 * The ONLY unauthenticated applicant route: exchange a raw magic-link token for a
 * session. @Public (skips the staff JwtAuthGuard) and throttled per IP (10/min,
 * 40/hour) — NOT a session route, so no ApplicantSessionGuard here. The request
 * body is NEVER logged (it carries the raw token).
 */
@Public()
@Controller('public/application')
@UseGuards(ApplicantThrottlerGuard)
export class ApplicantSessionController {
  constructor(private readonly sessions: PublicSessionService) {}

  @Post('session')
  @HttpCode(200)
  @Throttle(THROTTLE_SESSION)
  @ResponseMessage('Session created')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async create(@Body() dto: ExchangeSessionDto, @Ip() ip: string) {
    // Honeypot: a filled field means a bot — reject as if the link were invalid.
    if (dto.website) {
      throw new NotFoundException({ message: 'This link is not valid.', code: 'LINK_INVALID' });
    }
    return this.sessions.exchange(dto.token, ip ?? null);
  }
}
