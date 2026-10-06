import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/** The academic references an application create/edit can set (null clears). */
export interface ApplicationReferenceInput {
  university_id?: number | null;
  course_id?: number | null;
  specialisation_id?: number | null;
  session_id?: number | null;
  intake_id?: number | null;
  pipeline_user?: number | null;
}

/** Options for {@link assertApplicationReferences}. */
export interface AssertReferencesOptions {
  /**
   * Skip the legacy course.university_id ↔ university consistency throw. Passed
   * when an IN04 offering (university_course_intake) has already PROVEN the
   * (university, course) pair is a live tag, since the mapping tables — not
   * course.university_id — are the source of truth for tagging (a course may be
   * tagged to a different university than its legacy course.university_id).
   */
  skipUniversityCourseConsistency?: boolean;
}

/** The current values of those references on the row being edited. */
export interface ApplicationReferenceState {
  university_id: number | null;
  course_id: number | null;
  specialisation_id: number | null;
}

const NO_REFERENCES: ApplicationReferenceState = {
  university_id: null,
  course_id: null,
  specialisation_id: null,
};

/** The value a field will hold after the save: the body's when sent, else the row's. */
function after<K extends keyof ApplicationReferenceState>(
  dto: ApplicationReferenceInput,
  existing: ApplicationReferenceState,
  key: K,
): number | null {
  const sent = dto[key];
  return sent !== undefined ? sent : existing[key];
}

/**
 * 400s when an application create/academic edit points at a row that does not
 * exist, or pairs a course with another university's / a specialisation with
 * another course's. `applications` is shared with the LMS, so an id is checked
 * before it is stored. One query per referenced table, all in parallel.
 *
 * Consistency is checked only when the body touches university/course/
 * specialisation, so an edit of the counsellor or intake is never blocked by a
 * legacy mismatch it did not create. A course or specialisation that is not
 * tagged (university_id / course_id NULL) fits anywhere, as the list's
 * university fallback already treats it.
 */
export async function assertApplicationReferences(
  prisma: PrismaService,
  dto: ApplicationReferenceInput,
  existing: ApplicationReferenceState | null,
  opts: AssertReferencesOptions = {},
): Promise<void> {
  const current = existing ?? NO_REFERENCES;
  const touchesProgramme =
    dto.university_id !== undefined ||
    dto.course_id !== undefined ||
    dto.specialisation_id !== undefined;

  const universityId = after(dto, current, 'university_id');
  const courseId = after(dto, current, 'course_id');
  const specialisationId = after(dto, current, 'specialisation_id');

  const [university, course, specialisation, session, counsellor] =
    await Promise.all([
      dto.university_id != null
        ? prisma.university.findFirst({
            where: { id: dto.university_id, deleted_at: null },
            select: { id: true },
          })
        : null,
      touchesProgramme && courseId != null
        ? prisma.course.findFirst({
            where: { id: courseId, deleted_at: null },
            select: { id: true, university_id: true },
          })
        : null,
      touchesProgramme && specialisationId != null
        ? prisma.specialisations.findFirst({
            where: { id: specialisationId, deleted_at: null },
            select: { id: true, course_id: true },
          })
        : null,
      dto.session_id != null
        ? prisma.sessions.findFirst({
            where: { session_id: dto.session_id, deleted_at: null },
            select: { session_id: true },
          })
        : null,
      dto.pipeline_user != null
        ? prisma.users.findFirst({
            where: { id: dto.pipeline_user, deleted_at: null },
            select: { id: true },
          })
        : null,
    ]);

  if (dto.university_id != null && !university) {
    throw new BadRequestException(`University ${dto.university_id} does not exist`);
  }
  if (dto.course_id != null && !course) {
    throw new BadRequestException(`Course ${dto.course_id} does not exist`);
  }
  if (dto.specialisation_id != null && !specialisation) {
    throw new BadRequestException(
      `Specialisation ${dto.specialisation_id} does not exist`,
    );
  }
  if (dto.session_id != null && !session) {
    throw new BadRequestException(`Intake ${dto.session_id} does not exist`);
  }
  if (dto.pipeline_user != null && !counsellor) {
    throw new BadRequestException(`Counsellor ${dto.pipeline_user} does not exist`);
  }

  if (
    !opts.skipUniversityCourseConsistency &&
    course?.university_id != null &&
    universityId != null &&
    course.university_id !== universityId
  ) {
    throw new BadRequestException(
      'The course does not belong to the selected university',
    );
  }
  if (
    specialisation?.course_id != null &&
    courseId != null &&
    specialisation.course_id !== courseId
  ) {
    throw new BadRequestException(
      'The specialisation does not belong to the selected course',
    );
  }
}

/** The intake resolved for an application write: the id, and the legacy session it mirrors. */
export interface ResolvedApplicationIntake {
  intake_id: number;
  /** intake.session_id (the legacy sessions bridge), or null when not yet linked. */
  session_id: number | null;
}

/**
 * IN04 — validate that (university_id, course_id, intake_id) is a live, active
 * offering (university_course_intake) before an application stores intake_id, and
 * return the intake's legacy session_id so the caller can dual-write
 * applications.session_id (keeping legacy displays/joins working).
 *
 * 400s (naming the problem) when the intake does not exist, when a university or
 * course is not yet chosen, or when the triple is not an open offering. Never
 * writes course.university_id — the mapping tables are the source of truth.
 */
export async function resolveApplicationIntake(
  prisma: PrismaService,
  params: {
    universityId: number | null | undefined;
    courseId: number | null | undefined;
    intakeId: number;
  },
): Promise<ResolvedApplicationIntake> {
  const { universityId, courseId, intakeId } = params;

  const intake = await prisma.intake.findFirst({
    where: { id: intakeId, deleted_at: null },
    select: { id: true, session_id: true },
  });
  if (!intake) {
    throw new BadRequestException(`Intake ${intakeId} does not exist`);
  }
  if (universityId == null || courseId == null) {
    throw new BadRequestException(
      'Select a university and course before choosing an intake.',
    );
  }

  // WS3 LOW 5: the (university, course) tag itself must be live and active — a
  // paused or soft-deleted tag must not accept new leads, consistent with the
  // Add Lead cascade (catalogIntakes/catalogCourses filter on the active tag).
  const liveTag = await prisma.university_course.findFirst({
    where: {
      university_id: universityId,
      course_id: courseId,
      deleted_at: null,
      status: 1,
    },
    select: { id: true },
  });
  if (!liveTag) {
    throw new BadRequestException(
      'This course is not active for the selected university.',
    );
  }

  const offering = await prisma.university_course_intake.findFirst({
    where: {
      university_id: universityId,
      course_id: courseId,
      intake_id: intakeId,
      deleted_at: null,
      status: 1,
    },
    select: { id: true },
  });
  if (!offering) {
    throw new BadRequestException(
      'This course is not open for the selected intake.',
    );
  }

  return { intake_id: intakeId, session_id: intake.session_id ?? null };
}

/**
 * Whether an academic edit changes the programme (university or course). The
 * legacy academic step reset admission_status to 0 on save; that reset now
 * happens only when the programme really changes.
 */
export function changesProgramme(
  dto: ApplicationReferenceInput,
  existing: ApplicationReferenceState,
): boolean {
  return (['university_id', 'course_id'] as const).some(
    (k) => dto[k] !== undefined && dto[k] !== existing[k],
  );
}
