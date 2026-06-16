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
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff-facing client management. Protected by the global JwtAuthGuard.
 * Port of CI4 App\Controllers\App\Clients. A client is a `users` row with
 * role_id = 8 plus a `clients` profile row (clients.user_id = users.id).
 *
 * ROUTE ORDER: the GET /:id detail route is declared after the literal GET ''
 * list route. List endpoints use a @Query() DTO (with @Type coercion) rather
 * than per-param ParseIntPipe, which conflicts with the global transform
 * ValidationPipe.
 */
@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @ResponseMessage('Clients')
  findAll(@Query() query: ListClientsDto) {
    return this.clients.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('Client')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.clients.findOne(id);
  }

  @Post()
  @ResponseMessage('Client added successfully!')
  create(@Body() dto: CreateClientDto, @CurrentUser('id') userId: number) {
    return this.clients.create(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Client updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateClientDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.clients.update(id, dto, userId);
  }
}
