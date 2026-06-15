import { Body, Controller, Get, Post } from '@nestjs/common';
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
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  // Protected by the global JwtAuthGuard — returns the token's user snapshot.
  @Get('me')
  @ResponseMessage('Profile')
  me(@CurrentUser() user: unknown) {
    return user;
  }
}
