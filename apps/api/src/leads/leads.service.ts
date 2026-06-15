import {
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
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

  // ---- conversion saga -----------------------------------------------------

  /**
   * Port of Leads_model::convert_lead_to_student (+ create_student, enrol_student,
   * mark_lead_as_converted) and Invoice_model::generate_invoice.
   *
   * One interactive transaction performs, atomically:
   *   1. users   — a role_id=4 (student) account, password = bcrypt(lead.phone)
   *   2. students — the student profile row (student_id = the new user's id)
   *   3. enrol   — the course enrolment row
   *   4. invoice — one per course semester (or a single course-total fallback)
   *   5. leads   — flag the lead converted (is_converted=1, lead_status_id=5,
   *                converted_by, coverted_at — note the legacy misspelling)
   *
   * Returns { user_id, student_id, invoice_count }.
   */
  async convertToStudent(leadId: number, actorUserId: number) {
    const lead = await this.findOne(leadId); // 404 if missing/soft-deleted

    if (lead.is_converted === 1) {
      throw new ConflictException('Lead is already converted!');
    }

    const STUDENT_ROLE_ID = 4;
    const ENROLLED_ADMISSION_STATUS = 2; // Enrolled
    const CONVERTED_LEAD_STATUS_ID = 5;

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Legacy `code` column on users is an Int; the lead stores it as a string.
      const numericCode =
        lead.code != null && lead.code !== '' && !Number.isNaN(Number(lead.code))
          ? Number(lead.code)
          : null;

      // Generate a username from the lead's email, falling back to phone.
      const username =
        lead.email && lead.email.trim() !== ''
          ? lead.email.trim()
          : `${lead.code ?? ''}${lead.phone ?? ''}` || `lead-${lead.id}`;

      // Password defaults to the lead's phone (legacy behaviour).
      const hashedPassword = await bcrypt.hash(lead.phone ?? '', 10);

      // 1. users row (role_id = 4 student)
      const user = await tx.users.create({
        data: {
          lead_id: lead.id,
          name: lead.title ?? null,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          code: numericCode,
          gender: lead.gender ?? null,
          syllabus: lead.syllabus ?? null,
          class: lead.class ?? null,
          country_id: lead.country_id ?? null,
          university_id: lead.university_id ?? null,
          institution_id: lead.institution_id ?? null,
          telecaller_id: lead.telecaller_id ?? 0,
          username,
          password: hashedPassword,
          role_id: STUDENT_ROLE_ID,
          status: 1,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 2. students profile row (student_id = new user id)
      await tx.students.create({
        data: {
          student_id: user.id,
          course_id: lead.course_id ?? null,
          specialisation_id: null,
          admission_status: ENROLLED_ADMISSION_STATUS,
          // address + consultant_id are NOT NULL columns; the lead has no consultant,
          // so default them to the lead address / the acting user.
          address: lead.address ?? '',
          consultant_id: actorUserId,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 3. enrol row
      await tx.enrol.create({
        data: {
          user_id: user.id,
          course_id: lead.course_id ?? null,
          university_id: lead.university_id ?? null,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 4. invoices — one per semester for the course; fallback to a single
      //    course-total invoice when the course has no semesters configured.
      const semesters = lead.course_id
        ? await tx.semester.findMany({
            where: { course_id: lead.course_id, deleted_at: null },
            orderBy: { id: 'asc' },
          })
        : [];

      let invoiceCount = 0;

      if (semesters.length > 0) {
        for (const semester of semesters) {
          const fee = semester.semester_fee ?? 0;
          await tx.invoice.create({
            data: {
              student_id: user.id,
              university_id: lead.university_id ?? null,
              semester_id: semester.id,
              course_id: lead.course_id ?? null,
              payment_status: 'pending',
              total_amount: fee,
              discount_amount: 0,
              payable_amount: fee,
              date: now,
              created_by: actorUserId,
              updated_by: actorUserId,
              created_at: now,
              updated_at: now,
            },
          });
          invoiceCount += 1;
        }
      } else {
        // No semesters: bill the course total in a single invoice.
        const course = lead.course_id
          ? await tx.course.findUnique({ where: { id: lead.course_id } })
          : null;
        const total = course?.total_amount ?? 0;
        await tx.invoice.create({
          data: {
            student_id: user.id,
            university_id: lead.university_id ?? null,
            semester_id: null,
            course_id: lead.course_id ?? null,
            payment_status: 'pending',
            total_amount: total,
            discount_amount: 0,
            payable_amount: total,
            date: now,
            created_by: actorUserId,
            updated_by: actorUserId,
            created_at: now,
            updated_at: now,
          },
        });
        invoiceCount = 1;
      }

      // 5. mark the lead converted
      await tx.leads.update({
        where: { id: lead.id },
        data: {
          is_converted: 1,
          lead_status_id: CONVERTED_LEAD_STATUS_ID,
          converted_by: actorUserId,
          coverted_at: now, // legacy misspelling, preserved
          updated_by: actorUserId,
          updated_at: now,
        },
      });

      return {
        user_id: user.id,
        student_id: user.id,
        invoice_count: invoiceCount,
      };
    });
  }

  // ---- phase-3 stubs -------------------------------------------------------

  // TODO(phase-3): port Leads::bulk_upload_add — parse an uploaded Excel file
  // (lead_upload) and bulk-insert leads.
  bulkImport(): never {
    throw new NotImplementedException('Bulk lead import — phase 3');
  }
}
