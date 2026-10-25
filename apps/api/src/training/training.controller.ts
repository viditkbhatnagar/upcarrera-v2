import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CreateTrainingVideoDto, UpdateTrainingVideoDto } from './dto/training-video.dto';
import { TrainingService } from './training.service';

/** Training Center. Read + mark-complete: crm:training.view. Writes: crm:training.manage. */
@Controller('training-videos')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Get()
  @RequirePermission('crm:training.view')
  @ResponseMessage('Training videos fetched')
  list(@CurrentUser('id') userId: number) {
    return this.training.list(userId);
  }

  /** Admin list: every non-deleted video (incl. inactive), flat. Declared before :id routes. */
  @Get('admin')
  @RequirePermission('crm:training.manage')
  @ResponseMessage('Training videos fetched')
  listAll() {
    return this.training.listAll();
  }

  @Post(':id/complete')
  @RequirePermission('crm:training.view')
  @ResponseMessage('Marked as completed')
  complete(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.training.markComplete(userId, id);
  }

  @Delete(':id/complete')
  @RequirePermission('crm:training.view')
  @ResponseMessage('Completion removed')
  uncomplete(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.training.unmarkComplete(userId, id);
  }

  @Post()
  @RequirePermission('crm:training.manage')
  @ResponseMessage('Training video added')
  create(@CurrentUser('id') userId: number, @Body() dto: CreateTrainingVideoDto) {
    return this.training.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('crm:training.manage')
  @ResponseMessage('Training video updated')
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTrainingVideoDto,
  ) {
    return this.training.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermission('crm:training.manage')
  @ResponseMessage('Training video deleted')
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.training.remove(id, userId);
  }
}
