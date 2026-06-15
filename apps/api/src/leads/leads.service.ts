import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * CRM funnel service. Ports the read/write CRUD of CI4
 * App/Controllers/App/Leads.php + Models/Leads_model.php.
 * Heavy sagas (convert-to-student, bulk Excel import) are deferred to phase 3.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- leads CRUD ----------------------------------------------------------

  async findAll(query: ListLeadsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    // Legacy index() only ever lists non-converted, non-deleted leads.
    const where = {
      deleted_at: null,
      is_converted: 0,
      ...(query.lead_status_id !== undefined && {
        lead_status_id: query.lead_status_id,
      }),
      ...(query.telecaller_id !== undefined && {
        telecaller_id: query.telecaller_id,
      }),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.leads.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.leads.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: number) {
    const lead = await this.prisma.leads.findFirst({
      where: { id, deleted_at: null },
    });
    if (!lead) {
      throw new NotFoundException('Lead not found!');
    }
    return lead;
  }

  async create(dto: CreateLeadDto, userId: number) {
    const now = new Date();
    return this.prisma.leads.create({
      data: {
        ...dto,
        is_converted: 0,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async update(id: number, dto: UpdateLeadDto, userId: number) {
    await this.findOne(id); // 404 if missing/soft-deleted

    return this.prisma.leads.update({
      where: { id },
      data: {
        ...dto,
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  }

  async remove(id: number, userId: number) {
    await this.findOne(id); // 404 if missing/already soft-deleted

    // Soft delete: stamp deleted_at instead of removing the row.
    await this.prisma.leads.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { id };
  }

  /**
   * Port of Leads::update_lead_status — a 2-write operation:
   *   1. insert a lead_activity history row
   *   2. update the lead's current status/followup/remarks
   * Wrapped in a transaction so the funnel history and the lead never diverge.
   */
  async updateStatus(id: number, dto: UpdateLeadStatusDto, userId: number) {
    await this.findOne(id); // 404 if missing/soft-deleted

    const now = new Date();
    const followupDate = dto.followup_date ? new Date(dto.followup_date) : null;

    const [activity, lead] = await this.prisma.$transaction([
      this.prisma.lead_activity.create({
        data: {
          lead_id: id,
          lead_status_id: dto.lead_status_id,
          followup_date: followupDate,
          remarks: dto.remarks ?? null,
          action_by: userId,
          created_by: userId,
          updated_by: userId,
          created_at: now,
          updated_at: now,
        },
      }),
      this.prisma.leads.update({
        where: { id },
        data: {
          lead_status_id: dto.lead_status_id,
          followup_date: followupDate,
          remarks: dto.remarks ?? null,
          updated_by: userId,
          updated_at: now,
        },
      }),
    ]);

    return { lead, activity };
  }

  // ---- lead_source ---------------------------------------------------------

  findAllSources() {
    return this.prisma.lead_source.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'desc' },
    });
  }

  createSource(dto: CreateLeadSourceDto, userId: number) {
    const now = new Date();
    return this.prisma.lead_source.create({
      data: {
        title: dto.title,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // ---- lead_status ---------------------------------------------------------

  findAllStatuses() {
    return this.prisma.lead_status.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  // ---- phase-3 stubs -------------------------------------------------------

  // TODO(phase-3): port Leads_model::convert_lead_to_student — a multi-write saga
  // that creates a student user, enrols them, and marks the lead converted.
  convertToStudent(_id: number): never {
    throw new NotImplementedException(
      'Lead to student conversion — phase 3',
    );
  }

  // TODO(phase-3): port Leads::bulk_upload_add — parse an uploaded Excel file
  // (lead_upload) and bulk-insert leads.
  bulkImport(): never {
    throw new NotImplementedException('Bulk lead import — phase 3');
  }
}
