import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { ListSalesTeamsDto } from './dto/list-sales-teams.dto';
import { CreateSalesTeamDto } from './dto/create-sales-team.dto';
import { UpdateSalesTeamDto } from './dto/update-sales-team.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Sales team management. Port of CI4 App\Controllers\App\Sales (+ Sales_model).
 * Protected by the global JwtAuthGuard. List endpoints use a @Query() DTO (with
 * @Type coercion) rather than per-param ParseIntPipe, which conflicts with the
 * global transform ValidationPipe.
 *
 * ROUTE ORDER MATTERS: the static /performance and /insights routes are
 * declared BEFORE the dynamic /:id route so they are not swallowed by it.
 */
@Controller('sales-teams')
export class SalesTeamsController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  @ResponseMessage('Sales Teams fetched successfully!')
  findAll(@Query() query: ListSalesTeamsDto) {
    return this.sales.findAllTeams(query);
  }

  // --- Static routes BEFORE the dynamic :id route ---------------------------

  @Get('performance')
  @ResponseMessage('Team performance fetched successfully!')
  performance(@Query() query: ListSalesTeamsDto) {
    return this.sales.performance(query);
  }

  @Get('insights')
  @ResponseMessage('Team insights fetched successfully!')
  insights() {
    return this.sales.insights();
  }

  // --- Dynamic routes -------------------------------------------------------

  @Get(':id')
  @ResponseMessage('Sales Team fetched successfully!')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.sales.findOneTeam(id);
  }

  @Post()
  @ResponseMessage('Sales Team Added Successfully!')
  create(
    @Body() dto: CreateSalesTeamDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.createTeam(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Sales Team Updated Successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalesTeamDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.updateTeam(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Sales Team Deleted Successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.sales.removeTeam(id, userId);
  }
}
