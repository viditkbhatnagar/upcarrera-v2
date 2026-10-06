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
import { MasterSettingsService } from './master-settings.service';
import { ResponseMessage } from '../common/decorators/response-message.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';
import { DocumentRequirementQueryDto } from './dto/document-requirement-query.dto';
import { ReorderDocumentRequirementsDto } from './dto/reorder-document-requirements.dto';
import { CreateAdmissionRuleDto } from './dto/create-admission-rule.dto';
import { UpdateAdmissionRuleDto } from './dto/update-admission-rule.dto';
import { AdmissionRuleQueryDto } from './dto/admission-rule-query.dto';

/**
 * Master Settings HTTP surface (WS6). Reads carry crm:catalog.view and writes
 * crm:catalog.manage — the same slugs the rest of the catalog uses (Admin holds
 * both; Super Admin bypasses). The { status, message, data } envelope is added by
 * ResponseInterceptor, so handlers just return data.
 */

// document_requirement -> /document-requirements
@Controller('document-requirements')
export class DocumentRequirementsController {
  constructor(private readonly master: MasterSettingsService) {}

  @Get()
  @RequirePermission('crm:catalog.view')
  @ResponseMessage('Document requirements')
  list(@Query() query: DocumentRequirementQueryDto) {
    return this.master.listRequirements(query);
  }

  @Post()
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Document requirement added successfully!')
  create(
    @Body() dto: CreateDocumentRequirementDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.master.createRequirement(dto, userId);
  }

  // Literal segment — declared BEFORE the bare `:id` PATCH so 'reorder' is never
  // read as an id.
  @Patch('reorder')
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Document requirements reordered')
  reorder(
    @Body() dto: ReorderDocumentRequirementsDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.master.reorderRequirements(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Document requirement updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDocumentRequirementDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.master.updateRequirement(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Document requirement deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.master.deleteRequirement(id, userId);
  }
}

// course_admission_rule -> /course-admission-rules
@Controller('course-admission-rules')
export class CourseAdmissionRulesController {
  constructor(private readonly master: MasterSettingsService) {}

  @Get()
  @RequirePermission('crm:catalog.view')
  @ResponseMessage('Course admission rules')
  list(@Query() query: AdmissionRuleQueryDto) {
    return this.master.listRules(query);
  }

  @Post()
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Admission rule added successfully!')
  create(@Body() dto: CreateAdmissionRuleDto, @CurrentUser('id') userId: number) {
    return this.master.createRule(dto, userId);
  }

  @Patch(':id')
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Admission rule updated successfully!')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdmissionRuleDto,
    @CurrentUser('id') userId: number,
  ) {
    return this.master.updateRule(id, dto, userId);
  }

  @Delete(':id')
  @RequirePermission('crm:catalog.manage')
  @ResponseMessage('Admission rule deleted successfully!')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser('id') userId: number) {
    return this.master.deleteRule(id, userId);
  }
}
