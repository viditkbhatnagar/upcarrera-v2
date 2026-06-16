import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { CreateLeadStatusDto } from './dto/create-lead-status.dto';
import { UpdateLeadStatusConfigDto } from './dto/update-lead-status-config.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/** Staff endpoints porting App/Controllers/App/Lead_status.php. */
@Controller('lead-statuses')
export class LeadStatusesController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ResponseMessage('Lead statuses')
  findAll() {
    return this.leads.findAllStatuses();
  }

  @Post()
  @ResponseMessage('Lead status created successfully!')
  create(
    @Body() dto: CreateLeadStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.createStatus(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Lead status updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadStatusConfigDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.updateStatusConfig(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Lead status deleted successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.removeStatus(id, userId);
  }
}
