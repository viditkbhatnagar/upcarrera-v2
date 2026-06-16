import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { ListTelecallersDto } from './dto/list-telecallers.dto';
import { CreateTelecallerDto } from './dto/create-telecaller.dto';
import { UpdateTelecallerDto } from './dto/update-telecaller.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Telecaller management. A telecaller is a `users` row with role_id=2.
 * Protected by the global JwtAuthGuard. Port of CI4
 * App\Controllers\App\Telecallers. List endpoints use a @Query() DTO (with
 * @Type coercion) rather than per-param ParseIntPipe, which conflicts with the
 * global transform ValidationPipe.
 */
@Controller('telecallers')
export class TelecallersController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @ResponseMessage('Telecallers fetched successfully!')
  findAll(@Query() query: ListTelecallersDto) {
    return this.sales.findAllTelecallers(query);
  }

  @Post()
  @ResponseMessage('Telecallers Added Successfully!')
  create(
    @Body() dto: CreateTelecallerDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.createTelecaller(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Telecallers Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTelecallerDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.updateTelecaller(id, dto, userId);
  }
}
