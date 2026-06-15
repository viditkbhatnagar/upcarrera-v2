import { Controller, Get } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';

/** Staff endpoint porting App/Controllers/App/Lead_status.php (list only). */
@Controller('lead-statuses')
export class LeadStatusesController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ResponseMessage('Lead statuses')
  findAll() {
    return this.leads.findAllStatuses();
  }
}
