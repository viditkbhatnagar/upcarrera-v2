import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateExternalRefereeDto } from './dto/create-external-referee.dto';
import { ListExternalRefereesDto } from './dto/list-external-referees.dto';
import { ExternalRefereesService } from './external-referees.service';

/** Outside referrers picked by "External Reference" leads. */
@Controller('external-referees')
export class ExternalRefereesController {
  constructor(private readonly referees: ExternalRefereesService) {}

  @RequirePermission('crm:referees.view')
  @Get()
  @ResponseMessage('External referees fetched')
  list(@Query() query: ListExternalRefereesDto) {
    return this.referees.list(query.search);
  }

  @RequirePermission('crm:referees.manage')
  @Post()
  @ResponseMessage('External referee added')
  create(@Body() dto: CreateExternalRefereeDto, @CurrentUser('id') userId: number) {
    return this.referees.create(dto, userId);
  }
}
