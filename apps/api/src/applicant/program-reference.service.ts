import { Injectable } from '@nestjs/common';
import type { applications } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ProgramLabels {
  university: string | null;
  course: string | null;
  specialisation: string | null;
  intake: string | null;
}

export interface CounsellorContact {
  user_id: number | null;
  name: string | null;
  email: string | null;
  phone: string | null;
}

/** The subset of `applications` the resolver reads. */
type ProgramRow = Pick<
  applications,
  | 'university_id'
  | 'course_id'
  | 'specialisation_id'
  | 'session_id'
  | 'intake_id'
  | 'pipeline_user'
  | 'created_by'
  | 'name'
  | 'custom_application_id'
  | 'application_id'
>;

const EM_DASH = '—';

/**
 * Resolves the locked program (university / course / specialisation / intake)
 * titles and the owning counsellor's contact for an application. Shared by the
 * magic-link / submitted / reopened emails and the public GET /application read,
 * so the student and the counsellor always see the same labels. The program is
 * NEVER writable from the public side.
 */
@Injectable()
export class ProgramReferenceService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveProgram(app: ProgramRow): Promise<ProgramLabels> {
    const [university, course, specialisation, intake] = await Promise.all([
      app.university_id != null
        ? this.prisma.university.findUnique({
            where: { id: app.university_id },
            select: { title: true },
          })
        : Promise.resolve(null),
      app.course_id != null
        ? this.prisma.course.findUnique({
            where: { id: app.course_id },
            select: { title: true },
          })
        : Promise.resolve(null),
      app.specialisation_id != null
        ? this.prisma.specialisations.findUnique({
            where: { id: app.specialisation_id },
            select: { title: true },
          })
        : Promise.resolve(null),
      this.resolveIntake(app),
    ]);

    return {
      university: university?.title?.trim() || null,
      course: course?.title?.trim() || null,
      specialisation: specialisation?.title?.trim() || null,
      intake: intake || null,
    };
  }

  /** intake.name (v2 master, via intake_id) or the legacy sessions.session_title. */
  private async resolveIntake(app: ProgramRow): Promise<string | null> {
    if (app.intake_id != null) {
      const intake = await this.prisma.intake.findUnique({
        where: { id: app.intake_id },
        select: { name: true, month: true, year: true },
      });
      if (intake) {
        const label = intake.name?.trim();
        if (label) return label;
        if (intake.month || intake.year) {
          return [intake.month?.trim(), intake.year].filter(Boolean).join(' ') || null;
        }
      }
    }
    if (app.session_id != null) {
      const session = await this.prisma.sessions.findUnique({
        where: { session_id: app.session_id },
        select: { session_title: true },
      });
      return session?.session_title?.trim() || null;
    }
    return null;
  }

  async resolveCounsellor(app: ProgramRow): Promise<CounsellorContact> {
    const userId = app.pipeline_user ?? app.created_by ?? null;
    if (userId == null) return { user_id: null, name: null, email: null, phone: null };
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { id: true, name: true, email: true, phone: true },
    });
    return {
      user_id: user?.id ?? userId,
      name: user?.name?.trim() || null,
      email: user?.email?.trim() || null,
      phone: user?.phone?.trim() || null,
    };
  }

  /**
   * The display id for emails and screens: APP-YYYY-NNNNNN (custom_application_id),
   * falling back to a synthetic id so a template placeholder is never empty.
   */
  displayId(app: Pick<applications, 'custom_application_id' | 'application_id'>): string {
    return app.custom_application_id?.trim() || `APP-${app.application_id}`;
  }

  /** First name from the lead name, for the email greeting. */
  firstName(app: Pick<applications, 'name'>): string {
    const full = app.name?.trim() || '';
    const first = full.split(/\s+/)[0];
    return first || 'there';
  }

  /**
   * The email variable map common to every applicant email. The missing
   * specialisation/intake are rendered as an em dash (the template requires every
   * placeholder to be filled). These are the RAW values — the caller HTML-escapes
   * them (CRITIQUE #14) before handing them to the template renderer.
   */
  async emailVars(app: ProgramRow): Promise<Record<string, string>> {
    const [program, counsellor] = await Promise.all([
      this.resolveProgram(app),
      this.resolveCounsellor(app),
    ]);
    return {
      first_name: this.firstName(app),
      application_id: this.displayId(app),
      university: program.university ?? EM_DASH,
      course: program.course ?? EM_DASH,
      specialisation: program.specialisation ?? EM_DASH,
      intake: program.intake ?? EM_DASH,
      counsellor_name: counsellor.name ?? 'Your counsellor',
      counsellor_email: counsellor.email ?? 'hello@upcarrera.com',
      counsellor_phone: counsellor.phone ?? '+91 95620 04111',
    };
  }
}
