import {
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CreateUniversityDto } from './dto/create-university.dto';
import { UpdateUniversityDto } from './dto/update-university.dto';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { CreateSemesterDto } from './dto/create-semester.dto';
import { UpdateSemesterDto } from './dto/update-semester.dto';
import { CreateSpecialisationDto } from './dto/create-specialisation.dto';
import { UpdateSpecialisationDto } from './dto/update-specialisation.dto';
import { TeachersBySubjectsDto } from './dto/teachers-by-subjects.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** role_id for teachers in the users table (legacy convention). */
const TEACHER_ROLE_ID = 3;

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
 * Academic catalog service. Ports the CI4 App\Course / University / Subjects /
 * Semester / Specialisation / College / Country / Visa_type controllers.
 *
 * Conventions enforced everywhere:
 *  - Lists & reads filter `where: { deleted_at: null }` (soft delete).
 *  - Delete = stamp `deleted_at` with a JS Date (no hard delete).
 *  - Create/update stamp `created_at` / `updated_at` manually (legacy schema
 *    has manual timestamps, auto-timestamps are off).
 */
@Injectable()
export class AcademicsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resolves page/limit into a normalised { page, limit, skip, take }. */
  private resolvePaging(query: Pagination) {
    const page = query.page && query.page > 0 ? query.page : DEFAULT_PAGE;
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_LIMIT;
    return { page, limit, skip: (page - 1) * limit, take: limit };
  }

  private paginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
    return { items, total, page, limit };
  }

  // ---------------------------------------------------------------------------
  // course  -> /courses
  // ---------------------------------------------------------------------------

  async listCourses(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.course.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async getCourse(id: number) {
    const course = await this.prisma.course.findFirst({
      where: { id, deleted_at: null },
    });
    if (!course) {
      throw new NotFoundException('Course not found!');
    }
    return course;
  }

  async createCourse(dto: CreateCourseDto) {
    const now = new Date();
    return this.prisma.course.create({
      data: {
        ...dto,
        // These columns are NOT NULL in the legacy schema with no DB default.
        // The legacy app stored blanks when unfilled, so we mirror that.
        short_name: dto.short_name ?? '',
        stream: dto.stream ?? '',
        total_duration: dto.total_duration ?? '',
        study_mode: dto.study_mode ?? '',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateCourse(id: number, dto: UpdateCourseDto) {
    await this.getCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteCourse(id: number) {
    await this.getCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // university  -> /universities
  // ---------------------------------------------------------------------------

  async listUniversities(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.university.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.university.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async getUniversity(id: number) {
    const university = await this.prisma.university.findFirst({
      where: { id, deleted_at: null },
    });
    if (!university) {
      throw new NotFoundException('University not found!');
    }
    return university;
  }

  async createUniversity(dto: CreateUniversityDto) {
    const now = new Date();
    return this.prisma.university.create({
      data: {
        ...dto,
        // These columns are NOT NULL in the legacy schema with no DB default.
        // The legacy app stored blanks when unfilled, so we mirror that.
        country_id: dto.country_id ?? '',
        website: dto.website ?? '',
        phone: dto.phone ?? '',
        email: dto.email ?? '',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateUniversity(id: number, dto: UpdateUniversityDto) {
    await this.getUniversity(id);
    return this.prisma.university.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteUniversity(id: number) {
    await this.getUniversity(id);
    return this.prisma.university.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // subjects  -> /subjects
  // ---------------------------------------------------------------------------

  async listSubjects(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.subjects.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.subjects.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async getSubject(id: number) {
    const subject = await this.prisma.subjects.findFirst({
      where: { id, deleted_at: null },
    });
    if (!subject) {
      throw new NotFoundException('Subject not found!');
    }
    return subject;
  }

  async createSubject(dto: CreateSubjectDto) {
    const now = new Date();
    return this.prisma.subjects.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateSubject(id: number, dto: UpdateSubjectDto) {
    await this.getSubject(id);
    return this.prisma.subjects.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteSubject(id: number) {
    await this.getSubject(id);
    return this.prisma.subjects.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // semester  -> /semesters
  // ---------------------------------------------------------------------------

  async listSemesters(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.semester.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.semester.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async getSemester(id: number) {
    const semester = await this.prisma.semester.findFirst({
      where: { id, deleted_at: null },
    });
    if (!semester) {
      throw new NotFoundException('Semester not found!');
    }
    return semester;
  }

  async createSemester(dto: CreateSemesterDto) {
    const now = new Date();
    return this.prisma.semester.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateSemester(id: number, dto: UpdateSemesterDto) {
    await this.getSemester(id);
    return this.prisma.semester.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteSemester(id: number) {
    await this.getSemester(id);
    return this.prisma.semester.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // specialisations  -> /specialisations
  // ---------------------------------------------------------------------------

  async listSpecialisations(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.specialisations.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.specialisations.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async getSpecialisation(id: number) {
    const specialisation = await this.prisma.specialisations.findFirst({
      where: { id, deleted_at: null },
    });
    if (!specialisation) {
      throw new NotFoundException('Specialisation not found!');
    }
    return specialisation;
  }

  async createSpecialisation(dto: CreateSpecialisationDto) {
    const now = new Date();
    return this.prisma.specialisations.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateSpecialisation(id: number, dto: UpdateSpecialisationDto) {
    await this.getSpecialisation(id);
    return this.prisma.specialisations.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteSpecialisation(id: number) {
    await this.getSpecialisation(id);
    return this.prisma.specialisations.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // teacher assignment helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the teachers assigned to each of the given course ids.
   *
   * The live `teachers_subjects` table links a teacher (user_id, role 3) to a
   * course (course_id) — the current prisma schema models no per-subject column,
   * so assignment is at the course grain. Teachers are `users` with
   * role_id = 3. Returns a Map<course_id, teacher[]> built in two bulk queries
   * (no N+1).
   */
  private async teachersByCourseIds(
    courseIds: number[],
  ): Promise<Map<number, Array<{ id: number; name: string | null }>>> {
    const result = new Map<number, Array<{ id: number; name: string | null }>>();
    const uniqueCourseIds = [...new Set(courseIds.filter((c) => c != null))];
    if (uniqueCourseIds.length === 0) {
      return result;
    }

    // 1. all teacher<->course links for these courses.
    const links = await this.prisma.teachers_subjects.findMany({
      where: { course_id: { in: uniqueCourseIds }, deleted_at: null },
      select: { user_id: true, course_id: true },
    });

    // 2. resolve those user ids to active teachers (role 3) in one query.
    const teacherIds = [
      ...new Set(
        links.map((l) => l.user_id).filter((u): u is number => u != null),
      ),
    ];
    const teachers =
      teacherIds.length > 0
        ? await this.prisma.users.findMany({
            where: {
              id: { in: teacherIds },
              role_id: TEACHER_ROLE_ID,
              deleted_at: null,
            },
            select: { id: true, name: true },
          })
        : [];
    const teacherById = new Map(teachers.map((t) => [t.id, t]));

    for (const courseId of uniqueCourseIds) {
      result.set(courseId, []);
    }
    for (const link of links) {
      if (link.course_id == null || link.user_id == null) continue;
      const teacher = teacherById.get(link.user_id);
      if (!teacher) continue; // user_id is not an active teacher
      const bucket = result.get(link.course_id);
      // de-dupe in case a teacher is linked to the same course twice.
      if (bucket && !bucket.some((t) => t.id === teacher.id)) {
        bucket.push(teacher);
      }
    }

    return result;
  }

  /**
   * POST /subjects/teachers-by-subjects — for each requested subject id, return
   * the subject with the teachers assigned to its course. Missing/soft-deleted
   * subject ids are dropped. Mirrors the legacy
   * Teachers_subjects_model::get_teacher_enrolments join, adapted to the current
   * (course-grained) schema.
   */
  async teachersBySubjects(dto: TeachersBySubjectsDto) {
    const subjects = await this.prisma.subjects.findMany({
      where: { id: { in: dto.subject_ids }, deleted_at: null },
      select: { id: true, title: true, course_id: true },
    });

    const teacherMap = await this.teachersByCourseIds(
      subjects
        .map((s) => s.course_id)
        .filter((c): c is number => c != null),
    );

    return subjects.map((subject) => ({
      subject_id: subject.id,
      title: subject.title,
      course_id: subject.course_id,
      teachers:
        subject.course_id != null
          ? (teacherMap.get(subject.course_id) ?? [])
          : [],
    }));
  }

  /**
   * GET /courses/:id/subjects-with-teachers — all subjects for the course, each
   * decorated with the teachers assigned to the course. 404 when the course is
   * missing/soft-deleted.
   */
  async subjectsWithTeachers(courseId: number) {
    await this.getCourse(courseId); // 404 if missing/soft-deleted

    const [subjects, teacherMap] = await Promise.all([
      this.prisma.subjects.findMany({
        where: { course_id: courseId, deleted_at: null },
        orderBy: { id: 'asc' },
        select: { id: true, title: true, course_id: true },
      }),
      this.teachersByCourseIds([courseId]),
    ]);

    const teachers = teacherMap.get(courseId) ?? [];

    return subjects.map((subject) => ({
      subject_id: subject.id,
      title: subject.title,
      course_id: subject.course_id,
      teachers,
    }));
  }

  // ---------------------------------------------------------------------------
  // Simple read-only lookups
  // ---------------------------------------------------------------------------

  // college  -> /colleges
  async listColleges(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.college.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
      this.prisma.college.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  // countries  -> /countries  (PK is country_id, not id)
  async listCountries(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.countries.findMany({
        where: { deleted_at: null },
        orderBy: { country: 'asc' },
        skip,
        take,
      }),
      this.prisma.countries.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  // states  -> /states
  async listStates(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.states.findMany({
        where: { deleted_at: null },
        orderBy: { state_name: 'asc' },
        skip,
        take,
      }),
      this.prisma.states.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  // document_type  -> /document-types
  async listDocumentTypes(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.document_type.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
      this.prisma.document_type.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  // visa_type  -> /visa-types
  // TODO(phase-3): The legacy `visa_type` lookup table (App\Visa_type controller)
  // is NOT present in the current prisma/schema.prisma, so there is no
  // `prisma.visa_type` delegate to query. Add the `visa_type` model to the schema
  // (id, title, created_by/at, updated_by/at, deleted_by/at) and implement the
  // simple soft-deleted list here, mirroring listDocumentTypes above.
  async listVisaTypes(_query: Pagination): Promise<never> {
    throw new NotImplementedException(
      'visa_type is not modelled in prisma/schema.prisma yet — phase-3',
    );
  }
}
