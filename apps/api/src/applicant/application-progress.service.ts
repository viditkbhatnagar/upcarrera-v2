import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentChecklistService } from './document-checklist.service';

export interface ProgressStep {
  key: string;
  label: string;
  complete: boolean;
}

export interface Progress {
  completed: number;
  total: number;
  steps: ProgressStep[];
}

/**
 * The "N of M steps" progress for a form. Steps are Personal, Contact, Program,
 * Education, [Employment only when the course requires it], Documents — so the
 * total is 5, or 6 with employment (design openQuestion #1). Declaration is the
 * submit action itself, not a step. Shared by the staff magic-link card and the
 * public read, so both report the same number.
 */
@Injectable()
export class ApplicationProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checklist: DocumentChecklistService,
  ) {}

  async compute(applicationId: number): Promise<Progress> {
    const [application, form] = await Promise.all([
      this.prisma.applications.findUnique({
        where: { application_id: applicationId },
        select: { application_id: true, course_id: true },
      }),
      this.prisma.application_form.findUnique({
        where: { application_id: applicationId },
        select: {
          personal_saved_at: true,
          contact_saved_at: true,
          program_confirmed_at: true,
          education_saved_at: true,
          employment_saved_at: true,
          documents_completed_at: true,
        },
      }),
    ]);

    const [employmentRequired, docCoverage] = await Promise.all([
      application ? this.checklist.employmentRequired(application.course_id) : Promise.resolve(false),
      application
        ? this.checklist.requiredCoverage(applicationId, application.course_id)
        : Promise.resolve({ complete: false, required: [], missing: [] }),
    ]);

    const steps: ProgressStep[] = [
      { key: 'personal', label: 'Personal', complete: form?.personal_saved_at != null },
      { key: 'contact', label: 'Contact', complete: form?.contact_saved_at != null },
      { key: 'program', label: 'Program', complete: form?.program_confirmed_at != null },
      { key: 'education', label: 'Education', complete: form?.education_saved_at != null },
    ];
    if (employmentRequired) {
      steps.push({ key: 'employment', label: 'Employment', complete: form?.employment_saved_at != null });
    }
    // Documents step: complete when every REQUIRED document is present (vacuously
    // true when nothing is required), computed live so it never depends on a stamp.
    steps.push({ key: 'documents', label: 'Documents', complete: docCoverage.complete });

    const completed = steps.filter((s) => s.complete).length;
    return { completed, total: steps.length, steps };
  }
}
