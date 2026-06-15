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
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * Staff CRM endpoints. Protected by the global JwtAuthGuard (no @Public).
 * Ports App/Controllers/App/Leads.php.
 */
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ResponseMessage('Leads')
  findAll(@Query() query: ListLeadsDto) {
    return this.leads.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('Lead')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leads.findOne(id);
  }

  @Post()
  @ResponseMessage('Lead created successfully!')
  create(@Body() dto: CreateLeadDto, @CurrentUser('id') userId: number) {
    return this.leads.create(dto, userId);
  }

  @Patch(':id')
  @ResponseMessage('Lead updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.update(id, dto, userId);
  }

  @Delete(':id')
  @ResponseMessage('Lead deleted successfully!')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.remove(id, userId);
  }

  @Patch(':id/status')
  @ResponseMessage('Lead status updated successfully!')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeadStatusDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.updateStatus(id, dto, userId);
  }

  @Post(':id/convert')
  @ResponseMessage('Lead converted to student')
  convert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.convertToStudent(id, userId);
  }
}
