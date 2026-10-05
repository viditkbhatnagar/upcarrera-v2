import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // Mirrors CI4 Api/Login::login_username_app — username + password -> JWT.
  @Public()
  @Post('login')
  @ResponseMessage('Login successful!')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    // With `trust proxy` configured (main.ts), req.ip is the real client IP from
    // the nearest X-Forwarded-For hop; never trust the raw header directly.
    const ip = req.ip ?? req.socket?.remoteAddress ?? null;
    const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
    return this.auth.login(dto.username, dto.password, { ip, userAgent });
  }

  // Protected by the global JwtAuthGuard — returns the token's user snapshot.
  @Get('me')
  @ResponseMessage('Profile')
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
