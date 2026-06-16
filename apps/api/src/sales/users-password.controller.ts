import { Body, Controller, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { SalesService } from './sales.service';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Standalone @Controller('users') exposing ONLY the password/username reset.
 * Port of Sales::edit_password + Telecallers::reset_password. There is no
 * platform `users` controller in this app, so there is no route collision —
 * this controller owns just PATCH /users/:id/password.
 */
@Controller('users')
export class UsersPasswordController {
  constructor(private readonly sales: SalesService) {}

  @Patch(':id/password')
  @ResponseMessage('Username and password updated Successfully!')
  updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePasswordDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.updatePassword(id, dto, userId);
  }
}
