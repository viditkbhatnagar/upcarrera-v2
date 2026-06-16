import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { UpdateLeadStatusDto } from './dto/update-lead-status.dto';
import { CreateLeadSourceDto } from './dto/create-lead-source.dto';
import { UpdateLeadSourceDto } from './dto/update-lead-source.dto';
import { CreateLeadStatusDto } from './dto/create-lead-status.dto';
import { UpdateLeadStatusConfigDto } from './dto/update-lead-status-config.dto';
import { BulkImportLeadsDto } from './dto/bulk-import-leads.dto';
import { ListFollowupsDto } from './dto/list-followups.dto';
import { AssignTelecallerDto } from './dto/assign-telecaller.dto';
import { VerifyLeadDto } from './dto/verify-lead.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** lead_status_id the legacy follow-up screens hard-code (Followup_report.php). */
const FOLLOWUP_LEAD_STATUS_ID = 3;

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

  /**
   * Port of the legacy follow-up funnel screen: leads parked at lead_status_id=3
   * (Follow-up) that have not yet converted. Paginated, newest first, with the
   * optional filters the legacy screen offered. The from/to bounds apply to the
   * followup_date column (a DATE), inclusive of both ends.
   */
  async findFollowups(query: ListFollowupsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;

    const followupDate = this.dateRange(query.from, query.to);

    const where = {
      deleted_at: null,
      lead_status_id: FOLLOWUP_LEAD_STATUS_ID,
      is_converted: 0,
      ...(query.telecaller_id !== undefined && {
        telecaller_id: query.telecaller_id,
      }),
      ...(query.lead_source_id !== undefined && {
        lead_source_id: query.lead_source_id,
      }),
      ...(query.course_id !== undefined && { course_id: query.course_id }),
      ...(followupDate && { followup_date: followupDate }),
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

  /**
   * Port of Leads::ajax_lead_history — the activity/status timeline for a lead.
   * Returns the lead_activity rows newest first, each decorated with the
   * lead_status title (resolved in one extra query, no relation in the schema).
   */
  async findActivity(id: number) {
    await this.findOne(id); // 404 if the lead is missing/soft-deleted

    const activities = await this.prisma.lead_activity.findMany({
      where: { lead_id: id, deleted_at: null },
      orderBy: { id: 'desc' },
    });

    // Resolve lead_status titles in a single lookup (no FK relation modelled).
    const statusIds = [
      ...new Set(
        activities
          .map((a) => a.lead_status_id)
          .filter((s): s is number => s != null),
      ),
    ];
    const statuses =
      statusIds.length > 0
        ? await this.prisma.lead_status.findMany({
            where: { id: { in: statusIds } },
            select: { id: true, title: true },
          })
        : [];
    const titleById = new Map(statuses.map((s) => [s.id, s.title]));

    return activities.map((a) => ({
      ...a,
      lead_status_title:
        a.lead_status_id != null
          ? (titleById.get(a.lead_status_id) ?? null)
          : null,
    }));
  }

  /**
   * Port of Leads::update_telecaller — reassign the lead's owning telecaller.
   */
  async assignTelecaller(id: number, dto: AssignTelecallerDto, userId: number) {
    await this.findOne(id); // 404 if missing/soft-deleted

    return this.prisma.leads.update({
      where: { id },
      data: {
        telecaller_id: dto.telecaller_id,
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Port of Leads::verify_lead — flag the lead verified and update the verified
   * contact fields. The legacy `name` field maps to the `title` column. Only the
   * fields the caller supplies are written (the rest are left untouched).
   */
  async verify(id: number, dto: VerifyLeadDto, userId: number) {
    await this.findOne(id); // 404 if missing/soft-deleted

    const now = new Date();

    return this.prisma.leads.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { title: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.course_id !== undefined && { course_id: dto.course_id }),
        is_verified: 1,
        verified_by: userId,
        verified_at: now,
        updated_by: userId,
        updated_at: now,
      },
    });
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

  /** Port of Lead_source::edit. 404 when missing/soft-deleted. */
  async updateSource(id: number, dto: UpdateLeadSourceDto, userId: number) {
    const source = await this.prisma.lead_source.findFirst({
      where: { id, deleted_at: null },
    });
    if (!source) {
      throw new NotFoundException('Lead source not found!');
    }

    return this.prisma.lead_source.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  }

  /** Port of Lead_source::delete (soft delete: stamp deleted_at/deleted_by). */
  async removeSource(id: number, userId: number) {
    const source = await this.prisma.lead_source.findFirst({
      where: { id, deleted_at: null },
    });
    if (!source) {
      throw new NotFoundException('Lead source not found!');
    }

    await this.prisma.lead_source.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { id };
  }

  // ---- lead_status ---------------------------------------------------------

  findAllStatuses() {
    return this.prisma.lead_status.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'asc' },
    });
  }

  /** Port of Lead_status::add. */
  createStatus(dto: CreateLeadStatusDto, userId: number) {
    const now = new Date();
    return this.prisma.lead_status.create({
      data: {
        title: dto.title,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });
  }

  /** Port of Lead_status::edit. 404 when missing/soft-deleted. */
  async updateStatusConfig(
    id: number,
    dto: UpdateLeadStatusConfigDto,
    userId: number,
  ) {
    const status = await this.prisma.lead_status.findFirst({
      where: { id, deleted_at: null },
    });
    if (!status) {
      throw new NotFoundException('Lead status not found!');
    }

    return this.prisma.lead_status.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        updated_by: userId,
        updated_at: new Date(),
      },
    });
  }

  /** Port of Lead_status::delete (soft delete: stamp deleted_at/deleted_by). */
  async removeStatus(id: number, userId: number) {
    const status = await this.prisma.lead_status.findFirst({
      where: { id, deleted_at: null },
    });
    if (!status) {
      throw new NotFoundException('Lead status not found!');
    }

    await this.prisma.lead_status.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { id };
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

  // ---- bulk Excel import ---------------------------------------------------

  /**
   * Port of Leads::bulk_upload_add (App/Controllers/App/Leads.php) +
   * Lead_upload_model.
   *
   * Flow, mirroring the legacy controller:
   *   1. create a lead_upload row to represent the batch (filename/title +
   *      created_by/updated_by + timestamps).
   *   2. parse the workbook from the in-memory buffer, take the FIRST sheet, and
   *      turn it into rows.
   *   3. fetch role_id=2 (telecaller) user ids ONCE; round-robin them across the
   *      imported leads exactly like the legacy $telecallerIndex loop.
   *   4. for each row: map columns leniently (legacy fixed order was
   *      Student name / Country code / Phone / Place / Remarks), skip rows with
   *      no phone, skip phones that already exist as a lead or a user (the
   *      legacy duplicate guard), and build a lead insert with lead_status_id=1
   *      (Pending), is_converted=0, excel_file_id = the batch id,
   *      created_by/updated_by = actor, timestamps.
   *   5. insert all surviving rows inside one $transaction.
   *
   * Returns { imported, batch_id, skipped } where `skipped` lists the rows that
   * were dropped and why (missing phone / duplicate).
   *
   * @param fileBuffer  raw .xlsx bytes (from FileInterceptor memory storage)
   * @param actorUserId the acting staff user (created_by/updated_by/uploaded_by)
   * @param meta        optional batch metadata (title, lead_source_id, course_id)
   */
  async bulkImport(
    fileBuffer: Buffer,
    actorUserId: number,
    meta: BulkImportLeadsDto = {},
  ) {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new BadRequestException('No file uploaded.');
    }

    // --- 2. parse the workbook (first sheet) --------------------------------
    // Build header-keyed row objects (header text -> cell value) so the
    // downstream `cell()` alias mapping behaves exactly as it did with the
    // legacy `sheet_to_json` output: row 1 is the header, data starts at row 2,
    // missing cells default to '' so keys never shift between rows.
    let rows: Record<string, unknown>[];
    try {
      const workbook = new ExcelJS.Workbook();
      // exceljs's load() is typed against an older @types/node where `Buffer`
      // was non-generic; under @types/node v22 `Buffer<ArrayBufferLike>` is no
      // longer structurally assignable to that declaration (the [Symbol.toStringTag]
      // discriminant differs). The value IS a Node Buffer at runtime, so cast at
      // this single interop seam to bridge the purely-nominal typing gap.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await workbook.xlsx.load(fileBuffer as any);
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        throw new BadRequestException('The uploaded workbook has no sheets.');
      }

      let headers: string[] = [];
      rows = [];

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) {
          // Header row: capture header text per column index.
          headers = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            headers[colNumber] = this.cellText(cell.value);
          });
          return;
        }

        // Data row: map each configured header column to its cell value,
        // defaulting absent cells to '' for a stable object shape.
        const record: Record<string, unknown> = {};
        for (let colNumber = 1; colNumber < headers.length; colNumber += 1) {
          const header = headers[colNumber];
          if (header === undefined || header === '') continue;
          record[header] = this.cellText(row.getCell(colNumber).value);
        }
        rows.push(record);
      });
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(
        'Could not parse the uploaded file. Please upload a valid .xlsx file.',
      );
    }

    if (rows.length === 0) {
      throw new BadRequestException(
        'No data found in the uploaded sheet. Please add rows below the header.',
      );
    }

    const now = new Date();

    // --- 1. create the lead_upload batch row --------------------------------
    const batch = await this.prisma.lead_upload.create({
      data: {
        title: meta.title ?? null,
        lead_source_id: this.toNullableInt(meta.lead_source_id),
        file: null, // memory upload: no on-disk path to record
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });

    // --- 3. fetch role-2 (telecaller) ids once, for round-robin assignment ---
    const telecallers = await this.prisma.users.findMany({
      where: { role_id: 2, deleted_at: null },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const telecallerIds = telecallers.map((t) => t.id);
    let telecallerIndex = 0;

    // --- 4. map + validate each row -----------------------------------------
    const skipped: Array<{ row: number; reason: string }> = [];
    const toInsert: Array<{
      title: string | null;
      code: string | null;
      phone: string;
      place: string | null;
      remarks: string | null;
      telecaller_id: number | null;
    }> = [];

    rows.forEach((raw, index) => {
      // +2: header row is row 1, data starts at row 2 (matches legacy logging).
      const rowNumber = index + 2;

      const phone = this.cell(raw, ['phone', 'phone number', 'mobile']);
      if (phone === '') {
        // Legacy: blank phone rows are silently `continue`d (not an error).
        skipped.push({ row: rowNumber, reason: 'Missing phone' });
        return;
      }

      const code = this.cell(raw, [
        'country code',
        'code',
        'country_code',
        'countrycode',
      ]);

      toInsert.push({
        title:
          this.cell(raw, ['student name', 'name', 'title', 'full name']) ||
          null,
        code: code || null,
        phone,
        place: this.cell(raw, ['place', 'location', 'city']) || null,
        remarks: this.cell(raw, ['remarks', 'remark', 'notes']) || null,
        // round-robin telecaller assignment (no-op when none configured).
        telecaller_id:
          telecallerIds.length > 0
            ? telecallerIds[telecallerIndex++ % telecallerIds.length]
            : null,
      });
    });

    // --- duplicate guard: skip phones that already exist as a lead OR user ---
    const candidatePhones = [...new Set(toInsert.map((r) => r.phone))];

    const [existingLeads, existingUsers] = await Promise.all([
      this.prisma.leads.findMany({
        where: { phone: { in: candidatePhones }, deleted_at: null },
        select: { phone: true },
      }),
      this.prisma.users.findMany({
        where: { phone: { in: candidatePhones }, deleted_at: null },
        select: { phone: true },
      }),
    ]);

    const existingPhones = new Set<string>([
      ...existingLeads.map((l) => l.phone).filter((p): p is string => !!p),
      ...existingUsers.map((u) => u.phone).filter((p): p is string => !!p),
    ]);

    // De-dupe against the DB and against earlier rows in this same file.
    const seenInFile = new Set<string>();
    const leadSourceId = meta.lead_source_id ?? null;
    const courseId = meta.course_id ?? null;

    const rowsToCreate = toInsert.filter((r, i) => {
      const rowNumber = i + 2;
      if (existingPhones.has(r.phone) || seenInFile.has(r.phone)) {
        skipped.push({ row: rowNumber, reason: 'Duplicate phone' });
        return false;
      }
      seenInFile.add(r.phone);
      return true;
    });

    const data = rowsToCreate.map((r) => ({
      title: r.title,
      code: r.code,
      phone: r.phone,
      place: r.place,
      remarks: r.remarks,
      telecaller_id: r.telecaller_id,
      lead_status_id: 1, // Pending
      is_converted: 0,
      excel_file_id: batch.id,
      lead_source_id: leadSourceId,
      course_id: courseId,
      created_by: actorUserId,
      updated_by: actorUserId,
      created_at: now,
      updated_at: now,
    }));

    // --- 5. insert all surviving rows atomically ----------------------------
    // createMany issues a single multi-row INSERT, so it is already atomic — no
    // explicit $transaction wrapper is needed for the bulk insert itself.
    let imported = 0;
    if (data.length > 0) {
      const result = await this.prisma.leads.createMany({ data });
      imported = result.count;
    }

    return { imported, batch_id: batch.id, skipped };
  }

  /**
   * Read a cell from a header-keyed row, matching any of `aliases`
   * case-insensitively (sheet_to_json keys off the header text, which varies
   * across uploaded templates). Returns a trimmed string, '' when absent.
   */
  private cell(row: Record<string, unknown>, aliases: string[]): string {
    const wanted = aliases.map((a) => a.toLowerCase());
    for (const key of Object.keys(row)) {
      if (wanted.includes(key.trim().toLowerCase())) {
        const value = row[key];
        if (value === null || value === undefined) return '';
        return String(value).trim();
      }
    }
    return '';
  }

  /**
   * Normalise an exceljs cell value to a plain string. ExcelJS represents some
   * cells as rich objects (hyperlinks, formula results, rich text, dates,
   * errors) rather than primitives, so flatten those to the same text a simple
   * spreadsheet reader would yield. The downstream `cell()` helper trims and
   * lowercases as needed, so we only need a faithful raw string here.
   */
  private cellText(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      // Hyperlink cell: { text, hyperlink }
      if (typeof obj.text === 'string') return obj.text;
      // Formula cell: { formula, result }
      if ('result' in obj) return this.cellText(obj.result);
      // Rich-text cell: { richText: [{ text }, ...] }
      if (Array.isArray(obj.richText)) {
        return obj.richText
          .map((part) => this.cellText((part as { text?: unknown })?.text))
          .join('');
      }
      // Shared-formula / error cells: nothing useful to extract.
    }
    return String(value);
  }

  /** Coerce an optional numeric-string metadata field to Int|null. */
  private toNullableInt(value: string | undefined): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  /**
   * Build an inclusive date-range filter (mirrors the reports module helper).
   * `from` covers from 00:00:00, `to` covers through 23:59:59.999 of that day.
   * Returns undefined when neither bound is supplied so the filter is omitted.
   */
  private dateRange(
    from?: string,
    to?: string,
  ): { gte?: Date; lte?: Date } | undefined {
    if (!from && !to) {
      return undefined;
    }
    const range: { gte?: Date; lte?: Date } = {};
    if (from) {
      range.gte = new Date(`${from}T00:00:00.000`);
    }
    if (to) {
      range.lte = new Date(`${to}T23:59:59.999`);
    }
    return range;
  }

  // ---- static option lists (Lead::syllabus / Lead::classes) ----------------

  /**
   * Static syllabus options for lead forms. Ports App/Controllers/Api/Lead::syllabus.
   * No DB access — the legacy controller returned this fixed list verbatim.
   */
  getSyllabusOptions(): Array<{ id: string; title: string }> {
    return [
      { id: 'state', title: 'State' },
      { id: 'cbse', title: 'CBSE' },
      { id: 'icse', title: 'ICSE' },
      { id: 'igcse', title: 'IGCSE' },
    ];
  }

  /**
   * Static class/grade-level options for lead forms. Ports
   * App/Controllers/Api/Lead::classes. Fixed list, no DB access.
   */
  getClassOptions(): Array<{ id: string; title: string }> {
    return [
      { id: 'early_learning', title: 'Early Learning' },
      { id: 'kg1', title: 'KG1' },
      { id: 'kg2', title: 'KG2' },
      { id: '1', title: '1' },
      { id: '2', title: '2' },
      { id: '3', title: '3' },
      { id: '4', title: '4' },
      { id: '5', title: '5' },
      { id: '6', title: '6' },
      { id: '7', title: '7' },
      { id: '8', title: '8' },
      { id: '9', title: '9' },
      { id: '10', title: '10' },
      { id: '+1', title: '+1' },
      { id: '+2', title: '+2' },
    ];
  }
}
