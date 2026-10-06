import { Injectable } from '@nestjs/common';
import type { applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalCourseLevel } from '../workflow/stages';

export interface ChecklistRequirement {
  requirement_id: number;
  document_type_id: number | null;
  label: string;
  is_required: boolean;
  applies_when: string | null;
  max_files: number;
  help_text: string | null;
  sort_order: number;
}

type ChecklistAppRow = Pick<applications, 'application_id' | 'course_id'>;

/**
 * Resolves the per-application document checklist from the Master-Settings
 * document_requirement rows, keyed on the canonical course level
 * (canonicalCourseLevel(course.level)). applies_when='employment' rows are
 * included only when the course requires the Employment section
 * (course_admission_rule.requires_employment). Shared by the documents service,
 * the form read and the progress computation so they never disagree.
 */
@Injectable()
export class DocumentChecklistService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when the course needs the Employment section (and its documents). */
  async employmentRequired(courseId: number | null): Promise<boolean> {
    if (courseId == null) return false;
    const rule = await this.prisma.course_admission_rule.findFirst({
      where: { course_id: courseId, deleted_at: null },
      select: { requires_employment: true },
    });
    return rule?.requires_employment === true;
  }

  /** The ordered checklist that applies to this application (may be empty). */
  async resolve(app: ChecklistAppRow): Promise<ChecklistRequirement[]> {
    if (app.course_id == null) return [];
    const course = await this.prisma.course.findUnique({
      where: { id: app.course_id },
      select: { level: true },
    });
    const level = canonicalCourseLevel(course?.level ?? null);
    if (level == null) return [];

    const [rows, employmentNeeded] = await Promise.all([
      this.prisma.document_requirement.findMany({
        where: { course_level: level, deleted_at: null },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.employmentRequired(app.course_id),
    ]);

    const applicable = rows.filter((r) =>
      r.applies_when == null ? true : r.applies_when === 'employment' ? employmentNeeded : true,
    );
    if (applicable.length === 0) return [];

    const typeIds = [...new Set(applicable.map((r) => r.document_type_id))];
    const types = await this.prisma.document_type.findMany({
      where: { id: { in: typeIds } },
      select: { id: true, title: true },
    });
    const titleById = new Map(types.map((t) => [t.id, t.title ?? '']));

    return applicable.map((r) => ({
      requirement_id: r.id,
      document_type_id: r.document_type_id,
      label: titleById.get(r.document_type_id)?.trim() || 'Document',
      is_required: r.is_required,
      applies_when: r.applies_when,
      max_files: r.max_files,
      help_text: r.help_text?.trim() || null,
      sort_order: r.sort_order,
    }));
  }

  /** The required subset of a resolved checklist. */
  requiredOf(checklist: readonly ChecklistRequirement[]): ChecklistRequirement[] {
    return checklist.filter((c) => c.is_required);
  }

  /**
   * Whether every REQUIRED document for an application has a live upload. Vacuously
   * complete when nothing is required (e.g. no checklist seeded for the level). The
   * single source of truth for "documents done", shared by progress, the upload
   * recompute and the submit gate so they can never disagree.
   */
  async requiredCoverage(
    applicationId: number,
    courseId: number | null,
  ): Promise<{ required: ChecklistRequirement[]; missing: ChecklistRequirement[]; complete: boolean }> {
    const checklist = await this.resolve({ application_id: applicationId, course_id: courseId });
    const required = this.requiredOf(checklist);
    if (required.length === 0) return { required, missing: [], complete: true };

    const docs = await this.prisma.application_document.findMany({
      where: { application_id: applicationId, deleted_at: null },
      select: { requirement_id: true, document_type_id: true },
    });
    const haveReq = new Set(docs.map((d) => d.requirement_id).filter((x): x is number => x != null));
    const haveType = new Set(docs.map((d) => d.document_type_id).filter((x): x is number => x != null));
    const missing = required.filter(
      (r) => !haveReq.has(r.requirement_id) && (r.document_type_id == null || !haveType.has(r.document_type_id)),
    );
    return { required, missing, complete: missing.length === 0 };
  }
}
