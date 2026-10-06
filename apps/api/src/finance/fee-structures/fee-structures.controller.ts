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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ResponseMessage } from '../../common/decorators/response-message.decorator';
import { FeeStructuresService } from './fee-structures.service';
import {
  ActivateFeeStructureDto,
  CopyFeeStructureDto,
  CopyIntakeDto,
  CreateFeeStructureDto,
  ExpireFeeStructureDto,
  ListFeeStructuresDto,
  ResolveFeeStructureDto,
  UpdateFeeStructureDto,
} from './dto/fee-structure.dto';

/** Read permission: list / detail / export (Accounts + Admin; Super Admin bypasses). */
const PERM_READ = 'crm:fee-structures.index';
/** Manage permission: create / edit / delete / lifecycle / copy (Admin; Super Admin bypasses). */
const PERM_MANAGE = 'crm:fee-structures.manage';
/** Resolve is gated with the broad catalog-view slug any internal staff holds. */
const PERM_RESOLVE = 'crm:catalog.view';

/**
 * The Fee Structure master HTTP surface (WS2, spec FS01-FS04). EVERY route
 * carries @RequirePermission — the global PermissionsGuard lets an unslugged
 * route through, so an unguarded route here would be a silent hole.
 *
 * Literal segments (export, resolve, copy-intake) are declared before the `:id`
 * param routes so they are never captured as an id.
 */
@Controller('fee-structures')
export class FeeStructuresController {
  constructor(private readonly service: FeeStructuresService) {}

  @Get()
  @RequirePermission(PERM_READ)
  @ResponseMessage('Fee structures fetched')
  list(@Query() query: ListFeeStructuresDto) {
    return this.service.list(query);
  }

  /** CSV of the current filtered list. Writes the response directly (no envelope). */
  @Get('export')
  @RequirePermission(PERM_READ)
  async export(
    @Query() query: ListFeeStructuresDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const csv = await this.service.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fee-structures.csv"');
    res.send(csv);
  }

  /** The active structure + computed totals for a (university, course, intake). Stage-4 read. */
  @Get('resolve')
  @RequirePermission(PERM_RESOLVE)
  @ResponseMessage('Active fee structure resolved')
  resolve(@Query() query: ResolveFeeStructureDto) {
    return this.service.resolveActive(query.university_id, query.course_id, query.intake_id);
  }

  @Get(':id')
  @RequirePermission(PERM_READ)
  @ResponseMessage('Fee structure fetched')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure created')
  create(@Body() dto: CreateFeeStructureDto, @CurrentUser('id') userId: number) {
    return this.service.create(dto, userId);
  }

  /** Bulk copy-to-next-intake. Declared before the `:id` routes. */
  @Post('copy-intake')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Intake copied')
  copyIntake(@Body() dto: CopyIntakeDto, @CurrentUser('id') userId: number) {
    return this.service.copyIntake(dto, userId);
  }

  @Patch(':id')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFeeStructureDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.update(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure deleted')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.service.remove(id, userId);
  }

  @Post(':id/activate')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure activated')
  activate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActivateFeeStructureDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.activate(id, dto, userId);
  }

  @Post(':id/expire')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure expired')
  expire(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExpireFeeStructureDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.expire(id, dto, userId);
  }

  @Post(':id/copy')
  @RequirePermission(PERM_MANAGE)
  @ResponseMessage('Fee structure copied')
  copy(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CopyFeeStructureDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.service.copy(id, dto, userId);
  }
}
