import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CounsellorResourcesService } from './counsellor-resources.service';
import {
  CreateCounsellorResourceDto,
  UpdateCounsellorResourceDto,
} from './dto/counsellor-resource.dto';

/**
 * Counsellor Resources (distinct from the legacy /resources file browser).
 * Read: crm:resources.view. Writes: crm:resources.manage.
 */
@Controller('counsellor-resources')
export class CounsellorResourcesController {
  constructor(private readonly resources: CounsellorResourcesService) {}

  @Get()
  @RequirePermission('crm:resources.view')
  @ResponseMessage('Resources fetched')
  list() {
    return this.resources.list();
  }

  /** Admin list: every non-deleted resource (incl. inactive), flat. */
  @Get('admin')
  @RequirePermission('crm:resources.manage')
  @ResponseMessage('Resources fetched')
  listAll() {
    return this.resources.listAll();
  }

  @Post()
  @RequirePermission('crm:resources.manage')
  @ResponseMessage('Resource added')
  create(@CurrentUser('id') userId: number, @Body() dto: CreateCounsellorResourceDto) {
    return this.resources.create(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('crm:resources.manage')
  @ResponseMessage('Resource updated')
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCounsellorResourceDto,
  ) {
    return this.resources.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermission('crm:resources.manage')
  @ResponseMessage('Resource deleted')
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.resources.remove(id, userId);
  }
}
