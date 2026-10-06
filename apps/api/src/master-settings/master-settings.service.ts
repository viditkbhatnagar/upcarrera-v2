import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentRequirementDto } from './dto/create-document-requirement.dto';
import { UpdateDocumentRequirementDto } from './dto/update-document-requirement.dto';
import { DocumentRequirementQueryDto } from './dto/document-requirement-query.dto';
import { CreateAdmissionRuleDto } from './dto/create-admission-rule.dto';
import { UpdateAdmissionRuleDto } from './dto/update-admission-rule.dto';
import { AdmissionRuleQueryDto } from './dto/admission-rule-query.dto';
import { normaliseAppliesWhen } from './dto/document-requirement.constants';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

interface Pagination {
  page?: number;
  limit?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Master Settings (WS6): the admin surface that POPULATES the two phase-1 tables
 * nothing else writes —
 *   - document_requirement   (the per-canonical-level document checklist the SA
 *                             approve gate + public form resolve), and
 *   - course_admission_rule  (the per-course eligibility rule the public form +
 *                             inline eligibility check read).
 *
 * Conventions mirror AcademicsService exactly: soft delete (stamp `deleted_at`),
 * manual `created_at`/`updated_at`, the { items,total,page,limit } envelope, and
 * bulk decoration (never an N+1). Uniqueness matches the committed DB keys
 * (document_requirement: course_level+document_type_id; course_admission_rule:
 * course_id); a clash on a LIVE row is a 409, a clash on a SOFT-DELETED row is
 * revived in place (the same pattern UniversityCourseService.tagCourses uses).
 */
@Injectable()
export class MasterSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolvePaging(query: Pagination) {
    const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_LIMIT;
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  private paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return { items, total, page, limit };
  }

  // ===========================================================================
  // document_requirement  -> /document-requirements
  // ===========================================================================

  async listRequirements(query: DocumentRequirementQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where: Prisma.document_requirementWhereInput = { deleted_at: null };
    if (query.course_level) where.course_level = query.course_level;

    const [rows, total] = await Promise.all([
      this.prisma.document_requirement.findMany({
        where,
        orderBy: [{ course_level: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
        skip,
        take,
      }),
      this.prisma.document_requirement.count({ where }),
    ]);

    const titles = await this.documentTypeTitles(rows.map((r) => r.document_type_id));
    const items = rows.map((r) => ({
      ...r,
      document_type_title: titles.get(r.document_type_id) ?? null,
    }));
    return this.paginated(items, total, page, limit);
  }

  async createRequirement(dto: CreateDocumentRequirementDto, userId: number | null) {
    await this.assertDocumentTypeLive(dto.document_type_id);
    const appliesWhen = normaliseAppliesWhen(dto.applies_when);
    const now = new Date();

    // The DB key is (course_level, document_type_id); at most one row can exist.
    const existing = await this.prisma.document_requirement.findFirst({
      where: { course_level: dto.course_level, document_type_id: dto.document_type_id },
    });
    if (existing && existing.deleted_at == null) {
      throw new ConflictException(
        `A document requirement for this document type already exists at the "${dto.course_level}" level.`,
      );
    }

    const data = {
      course_level: dto.course_level,
      document_type_id: dto.document_type_id,
      is_required: dto.is_required ?? true,
      applies_when: appliesWhen,
      max_files: dto.max_files ?? 1,
      help_text: dto.help_text ?? null,
      sort_order: dto.sort_order ?? 0,
    };

    if (existing) {
      // Revive the soft-deleted row (keeps the DB key satisfied).
      return this.prisma.document_requirement.update({
        where: { id: existing.id },
        data: {
          ...data,
          deleted_at: null,
          deleted_by: null,
          created_by: userId,
          created_at: now,
          updated_by: userId,
          updated_at: now,
        },
      });
    }

    return this.prisma.document_requirement.create({
      data: { ...data, created_by: userId, created_at: now, updated_by: userId, updated_at: now },
    });
  }

  async updateRequirement(id: number, dto: UpdateDocumentRequirementDto, userId: number | null) {
    const current = await this.getRequirement(id);

    const nextLevel = dto.course_level ?? current.course_level;
    const nextTypeId = dto.document_type_id ?? current.document_type_id;
    if (dto.document_type_id != null && dto.document_type_id !== current.document_type_id) {
      await this.assertDocumentTypeLive(dto.document_type_id);
    }
    // Re-check the (course_level, document_type_id) key when either part moves.
    if (nextLevel !== current.course_level || nextTypeId !== current.document_type_id) {
      const clash = await this.prisma.document_requirement.findFirst({
        where: {
          course_level: nextLevel,
          document_type_id: nextTypeId,
          deleted_at: null,
          id: { not: id },
        },
      });
      if (clash) {
        throw new ConflictException(
          `A document requirement for this document type already exists at the "${nextLevel}" level.`,
        );
      }
    }

    const data: Prisma.document_requirementUpdateInput = { updated_by: userId, updated_at: new Date() };
    if (dto.course_level !== undefined) data.course_level = dto.course_level;
    if (dto.document_type_id !== undefined) data.document_type_id = dto.document_type_id;
    if (dto.is_required !== undefined) data.is_required = dto.is_required;
    if (dto.applies_when !== undefined) data.applies_when = normaliseAppliesWhen(dto.applies_when);
    if (dto.max_files !== undefined) data.max_files = dto.max_files;
    if (dto.help_text !== undefined) data.help_text = dto.help_text;
    if (dto.sort_order !== undefined) data.sort_order = dto.sort_order;

    return this.prisma.document_requirement.update({ where: { id }, data });
  }

  async deleteRequirement(id: number, userId: number | null) {
    await this.getRequirement(id);
    return this.prisma.document_requirement.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
  }

  private async getRequirement(id: number) {
    const row = await this.prisma.document_requirement.findFirst({
      where: { id, deleted_at: null },
    });
    if (!row) throw new NotFoundException('Document requirement not found!');
    return row;
  }

  private async assertDocumentTypeLive(documentTypeId: number): Promise<void> {
    const type = await this.prisma.document_type.findFirst({
      where: { id: documentTypeId, deleted_at: null },
      select: { id: true },
    });
    if (!type) {
      throw new BadRequestException(`Document type ${documentTypeId} not found or deleted.`);
    }
  }

  /** id -> title for the given document_type ids, in ONE query (no N+1). */
  private async documentTypeTitles(
    ids: number[],
  ): Promise<Map<number, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.document_type.findMany({
      where: { id: { in: unique } },
      select: { id: true, title: true },
    });
    return new Map(rows.map((t) => [t.id, t.title]));
  }

  // ===========================================================================
  // course_admission_rule  -> /course-admission-rules
  // ===========================================================================

  async listRules(query: AdmissionRuleQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where: Prisma.course_admission_ruleWhereInput = { deleted_at: null };
    if (query.course_id != null) where.course_id = query.course_id;

    const [rows, total] = await Promise.all([
      this.prisma.course_admission_rule.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.course_admission_rule.count({ where }),
    ]);

    const titles = await this.courseTitles(rows.map((r) => r.course_id));
    const items = rows.map((r) => this.decorateRule(r, titles));
    return this.paginated(items, total, page, limit);
  }

  async createRule(dto: CreateAdmissionRuleDto, userId: number | null) {
    await this.assertCourseLive(dto.course_id);
    const now = new Date();

    // One rule per course (the DB key is course_id).
    const existing = await this.prisma.course_admission_rule.findFirst({
      where: { course_id: dto.course_id },
    });
    if (existing && existing.deleted_at == null) {
      throw new ConflictException('An admission rule already exists for this course.');
    }

    const data = {
      course_id: dto.course_id,
      min_qualification: dto.min_qualification ?? null,
      min_percentage: dto.min_percentage ?? null,
      min_cgpa: dto.min_cgpa ?? null,
      requires_employment: dto.requires_employment ?? false,
      min_experience_months: dto.min_experience_months ?? null,
      notes: dto.notes ?? null,
    };

    const row = existing
      ? await this.prisma.course_admission_rule.update({
          where: { id: existing.id },
          data: {
            ...data,
            deleted_at: null,
            created_by: userId,
            created_at: now,
            updated_by: userId,
            updated_at: now,
          },
        })
      : await this.prisma.course_admission_rule.create({
          data: {
            ...data,
            created_by: userId,
            created_at: now,
            updated_by: userId,
            updated_at: now,
          },
        });

    const titles = await this.courseTitles([row.course_id]);
    return this.decorateRule(row, titles);
  }

  async updateRule(id: number, dto: UpdateAdmissionRuleDto, userId: number | null) {
    await this.getRule(id);
    const data: Prisma.course_admission_ruleUpdateInput = { updated_by: userId, updated_at: new Date() };
    if (dto.min_qualification !== undefined) data.min_qualification = dto.min_qualification;
    if (dto.min_percentage !== undefined) data.min_percentage = dto.min_percentage;
    if (dto.min_cgpa !== undefined) data.min_cgpa = dto.min_cgpa;
    if (dto.requires_employment !== undefined) data.requires_employment = dto.requires_employment;
    if (dto.min_experience_months !== undefined) data.min_experience_months = dto.min_experience_months;
    if (dto.notes !== undefined) data.notes = dto.notes;

    const row = await this.prisma.course_admission_rule.update({ where: { id }, data });
    const titles = await this.courseTitles([row.course_id]);
    return this.decorateRule(row, titles);
  }

  async deleteRule(id: number, userId: number | null) {
    await this.getRule(id);
    return this.prisma.course_admission_rule.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: userId, updated_at: new Date() },
    });
  }

  private async getRule(id: number) {
    const row = await this.prisma.course_admission_rule.findFirst({
      where: { id, deleted_at: null },
    });
    if (!row) throw new NotFoundException('Admission rule not found!');
    return row;
  }

  private async assertCourseLive(courseId: number): Promise<void> {
    const course = await this.prisma.course.findFirst({
      where: { id: courseId, deleted_at: null },
      select: { id: true },
    });
    if (!course) {
      throw new BadRequestException(`Course ${courseId} not found or deleted.`);
    }
  }

  /** id -> title for the given course ids, in ONE query (no N+1). */
  private async courseTitles(ids: number[]): Promise<Map<number, string | null>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.course.findMany({
      where: { id: { in: unique } },
      select: { id: true, title: true },
    });
    return new Map(rows.map((c) => [c.id, c.title]));
  }

  /**
   * Serialise a rule row for the client: Prisma Decimals -> numbers (so the web
   * never has to parse a Decimal string), plus the resolved course_title.
   */
  private decorateRule(
    row: {
      id: number;
      course_id: number;
      min_qualification: string | null;
      min_percentage: Prisma.Decimal | null;
      min_cgpa: Prisma.Decimal | null;
      requires_employment: boolean;
      min_experience_months: number | null;
      notes: string | null;
      created_at: Date | null;
      updated_at: Date | null;
    },
    titles: Map<number, string | null>,
  ) {
    return {
      ...row,
      min_percentage: row.min_percentage != null ? Number(row.min_percentage) : null,
      min_cgpa: row.min_cgpa != null ? Number(row.min_cgpa) : null,
      course_title: titles.get(row.course_id) ?? null,
    };
  }
}
