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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { ListFollowupsDto } from './dto/list-followups.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { AssignTelecallerDto } from './dto/assign-telecaller.dto';
import { VerifyLeadDto } from './dto/verify-lead.dto';
import { BulkImportLeadsDto } from './dto/bulk-import-leads.dto';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UploadedFileType } from '../files/uploaded-file.type';

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

  /**
   * The follow-up funnel (lead_status_id = 3, not converted). Declared BEFORE
   * the `:id` route so 'followups' is never parsed as a lead id.
   */
  @Get('followups')
  @ResponseMessage('Followups')
  findFollowups(@Query() query: ListFollowupsDto) {
    return this.leads.findFollowups(query);
  }

  @Get(':id')
  @ResponseMessage('Lead')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.leads.findOne(id);
  }

  @Get(':id/activity')
  @ResponseMessage('Lead activity')
  findActivity(@Param('id', ParseIntPipe) id: number) {
    return this.leads.findActivity(id);
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

  @Patch(':id/telecaller')
  @ResponseMessage('Telecaller assigned successfully!')
  assignTelecaller(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignTelecallerDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.assignTelecaller(id, dto, userId);
  }

  @Patch(':id/verify')
  @ResponseMessage('Lead verified successfully!')
  verify(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: VerifyLeadDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.verify(id, dto, userId);
  }

  @Post(':id/convert')
  @ResponseMessage('Lead converted to student')
  convert(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.convertToStudent(id, userId);
  }

  /**
   * Bulk-import leads from an uploaded .xlsx file. Port of
   * Leads::bulk_upload_add. The file arrives via FileInterceptor (multer memory
   * storage ships with @nestjs/platform-express — no install needed); optional
   * batch metadata (title, lead_source_id, course_id) rides along in the body.
   */
  @Post('bulk-import')
  @ResponseMessage('Leads imported')
  @UseInterceptors(FileInterceptor('file'))
  bulkImport(
    @UploadedFile() file: UploadedFileType,
    @Body() dto: BulkImportLeadsDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.leads.bulkImport(file?.buffer, userId, dto);
  }
}
