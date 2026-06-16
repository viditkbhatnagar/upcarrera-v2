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
import { ConsultantsService } from './consultants.service';
import { ListTargetsDto } from './dto/list-targets.dto';
import { CreateTargetDto, UpdateTargetDto } from './dto/create-target.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Consultant target management. Protected by the global JwtAuthGuard.
 * Port of CI4 App\Controllers\App\Consultant_target. Mounted at
 * /consultant-targets (kebab) — its PK column is consultant_target_id, but the
 * route uses the plain :id segment for the public API surface.
 */
@Controller('consultant-targets')
export class ConsultantTargetsController {
  constructor(private readonly consultants: ConsultantsService) {}

  @Get()
  @ResponseMessage('Consultant targets')
  findAll(@Query() query: ListTargetsDto) {
    return this.consultants.findTargets(query);
  }

  @Get(':id')
  @ResponseMessage('Consultant target')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.consultants.findTarget(id);
  }

  @Post()
  @ResponseMessage('Consultant target added successfully!')
  create(
    @Body() dto: CreateTargetDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.createTarget(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Consultant target updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTargetDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.updateTarget(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Consultant target deleted successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.consultants.removeTarget(id, userId);
  }
}
