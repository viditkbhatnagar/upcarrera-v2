import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';

/** The academic references an application create/edit can set (null clears). */
export interface ApplicationReferenceInput {
  university_id?: number | null;
  course_id?: number | null;
  specialisation_id?: number | null;
  session_id?: number | null;
  pipeline_user?: number | null;
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
