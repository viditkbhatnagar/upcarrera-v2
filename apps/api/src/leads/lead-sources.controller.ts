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
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/** Staff endpoints porting App/Controllers/App/Lead_source.php. */
@Controller('lead-sources')
export class LeadSourcesController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ResponseMessage('Lead sources')
  findAll() {
    return this.leads.findAllSources();
  }

  @Post()
  @ResponseMessage('Lead source created successfully!')
  create(
    @Body() dto: CreateLeadSourceDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.createSource(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Lead source updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadSourceDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.updateSource(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Lead source deleted successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.removeSource(id, userId);
  }
}
