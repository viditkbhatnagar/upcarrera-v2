import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
import { SubjectListQueryDto } from './dto/subject-list-query.dto';
import { CourseListQueryDto } from './dto/course-list-query.dto';
import { SemesterListQueryDto } from './dto/semester-list-query.dto';
import { StatesListQueryDto } from './dto/states-list-query.dto';
import { ToggleLmsDto } from './dto/toggle-lms.dto';
import { UpdateCourseStatusDto } from './dto/update-course-status.dto';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { CreateCollegeDto } from './dto/create-college.dto';
import { UpdateCollegeDto } from './dto/update-college.dto';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { CreateVisaTypeDto } from './dto/create-visa-type.dto';
import { UpdateVisaTypeDto } from './dto/update-visa-type.dto';
import { CreateIntakeDto } from './dto/create-intake.dto';
import { UpdateIntakeDto } from './dto/update-intake.dto';
import { CreateGroupCourseDto } from './dto/create-group-course.dto';
import { UpdateGroupCourseDto } from './dto/update-group-course.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** role_id for teachers in the users table (legacy convention). */
const TEACHER_ROLE_ID = 3;

/** role_id for students in the users table (legacy convention). */
const STUDENT_ROLE_ID = 4;

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

  /**
   * Builds the soft-delete + optional filter where-clause shared by listCourses.
   * Ports the legacy Course::index / lms_course filters:
   *   ?university_id -> course.university_id
   *   ?lms           -> course.is_lms_course
   * `?institution_id` is intentionally ignored: the `course` model in
   * prisma/schema.prisma has no institution_id column (the legacy query against
   * it would always match nothing), so we skip it rather than empty the result.
   */
  private courseWhere(query: CourseListQueryDto) {
    const where: {
      deleted_at: null;
      university_id?: number;
      is_lms_course?: number;
    } = { deleted_at: null };
    if (query.university_id != null) {
      where.university_id = query.university_id;
    }
    if (query.lms != null) {
      where.is_lms_course = query.lms;
    }
    return where;
  }

  async listCourses(query: CourseListQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where = this.courseWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.course.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  /**
   * PATCH /courses/:id/lms — port of Course::add_to_lms. is_add=1 marks the
   * course as an LMS course, otherwise removes it; either way stamps `added_at`.
   * When `is_add` is omitted, flips the current value (toggle).
   */
  async toggleCourseLms(id: number, dto: ToggleLmsDto) {
    const course = await this.getCourse(id);
    const next =
      dto.is_add != null ? dto.is_add : course.is_lms_course === 1 ? 0 : 1;
    return this.prisma.course.update({
      where: { id },
      data: { is_lms_course: next, added_at: new Date(), updated_at: new Date() },
    });
  }

  /**
   * PATCH /courses/:id/status — port of Course::change_status. Sets the course
   * status (Int? column in the schema) and bumps updated_at.
   */
  async updateCourseStatus(id: number, dto: UpdateCourseStatusDto) {
    await this.getCourse(id);
    return this.prisma.course.update({
      where: { id },
      data: { status: dto.status, updated_at: new Date() },
    });
  }

  /**
   * GET /courses/knowledge-base — port of Course::knowledge_base. Returns the
   * active courses grouped by university, each course decorated with its
   * `university_name`. Built in two bulk queries (courses + universities) to
   * resolve names without an N+1. Universities are looked up by id; a missing
   * university yields 'Unknown', matching the legacy fallback.
   */
  async coursesKnowledgeBase() {
    const courses = await this.prisma.course.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const universityIds = [
      ...new Set(
        courses
          .map((c) => c.university_id)
          .filter((u): u is number => u != null),
      ),
    ];
    const universities =
      universityIds.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: universityIds }, deleted_at: null },
            select: { id: true, title: true },
          })
        : [];
    const nameById = new Map(universities.map((u) => [u.id, u.title]));

    // Preserve insertion order while grouping by university_id.
    const grouped = new Map<
      number | null,
      { university_id: number | null; university_name: string; courses: unknown[] }
    >();
    for (const course of courses) {
      const uid = course.university_id ?? null;
      const universityName =
        uid != null ? (nameById.get(uid) ?? 'Unknown') : 'Unknown';
      const decorated = { ...course, university_name: universityName };
      const bucket = grouped.get(uid);
      if (bucket) {
        bucket.courses.push(decorated);
      } else {
        grouped.set(uid, {
          university_id: uid,
          university_name: universityName,
          courses: [decorated],
        });
      }
    }

    return [...grouped.values()];
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

  /**
   * Derive the number of intakes from the free-form `university.intakes` Text
   * blob. The legacy column is a textarea blob with no fixed format, so we parse
   * leniently:
   *   - a JSON array -> its length
   *   - otherwise -> count of non-empty tokens split on commas/newlines/pipes
   *   - null / empty / unparseable -> 0
   */
  private deriveIntakesCount(raw: string | null | undefined): number {
    if (raw == null) return 0;
    const trimmed = raw.trim();
    if (trimmed === '') return 0;

    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter(
            (v) => v != null && String(v).trim() !== '',
          ).length;
        }
      } catch {
        // fall through to delimiter-based counting
      }
    }

    return trimmed
      .split(/[\n,|]+/)
      .map((s) => s.trim())
      .filter((s) => s !== '').length;
  }

  /**
   * GET /universities — paginated catalog of active universities, each item
   * decorated with:
   *   - tagged_courses_count: number of active (deleted_at null) `course` rows
   *     whose university_id = university.id, resolved in ONE bulk groupBy (no
   *     N+1).
   *   - intakes_count: derived from the row's free-form `intakes` Text blob.
   *
   * Keeps the exact { items, total, page, limit } envelope; only ADDS fields to
   * each item (existing fields are preserved).
   */
  async listUniversities(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [rows, total] = await Promise.all([
      this.prisma.university.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.university.count({ where: { deleted_at: null } }),
    ]);

    // Collect the page's university ids and resolve tagged-course counts in a
    // single bulk groupBy keyed by course.university_id.
    const universityIds = rows.map((u) => u.id);
    const courseCounts =
      universityIds.length > 0
        ? await this.prisma.course.groupBy({
            by: ['university_id'],
            where: {
              university_id: { in: universityIds },
              deleted_at: null,
            },
            _count: { _all: true },
          })
        : [];
    const taggedCountByUniversityId = new Map<number, number>(
      courseCounts
        .filter(
          (c): c is typeof c & { university_id: number } =>
            c.university_id != null,
        )
        .map((c) => [c.university_id, c._count._all]),
    );

    const items = rows.map((university) => ({
      ...university,
      tagged_courses_count: taggedCountByUniversityId.get(university.id) ?? 0,
      intakes_count: this.deriveIntakesCount(university.intakes),
    }));

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

  async listSubjects(query: SubjectListQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where: Prisma.subjectsWhereInput = { deleted_at: null };
    if (query.course_id !== undefined) {
      where.course_id = query.course_id;
    }
    const [items, total] = await Promise.all([
      this.prisma.subjects.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.subjects.count({ where }),
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

  async listSemesters(query: SemesterListQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    // Ports Semester::fetch_semesters (?course_id) and
    // fetch_semester_by_university_id (?university_id); both are real columns.
    const where: {
      deleted_at: null;
      course_id?: number;
      university_id?: number;
    } = { deleted_at: null };
    if (query.course_id != null) {
      where.course_id = query.course_id;
    }
    if (query.university_id != null) {
      where.university_id = query.university_id;
    }
    const [items, total] = await Promise.all([
      this.prisma.semester.findMany({
        where,
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.semester.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  /**
   * GET /semesters/:id/fee — port of Semester::fetch_semesters_amount, which
   * returned the `semester_fee` for a semester. 404 when the semester is
   * missing/soft-deleted.
   */
  async getSemesterFee(id: number) {
    const semester = await this.prisma.semester.findFirst({
      where: { id, deleted_at: null },
      select: { id: true, semester_fee: true },
    });
    if (!semester) {
      throw new NotFoundException('Semester not found!');
    }
    return { id: semester.id, semester_fee: semester.semester_fee };
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

  /**
   * Bulk-scheduling context for a course: for every subject in the course,
   * resolve the teachers and the enrolled students. Port of
   * Demo_sessions::get_subjects_teachers_students_by_course().
   *
   * Returns `[{ subject, teachers: [], students: [] }]`. 404 when the course is
   * missing/soft-deleted.
   *
   * Schema notes:
   *  - teachers_subjects has NO subject_id column in the current schema (only
   *    user_id + course_id), so teachers are resolved per-course and the same
   *    course teacher list appears on each subject — matching the existing
   *    teachersByCourseIds() / subjectsWithTeachers() behavior.
   *  - students come from the `enrol` table (legacy Enrol_model), which DOES
   *    carry subject_id, so students are resolved per-subject.
   */
  async scheduleContext(courseId: number) {
    await this.getCourse(courseId); // 404 if missing/soft-deleted

    const [subjects, teacherMap] = await Promise.all([
      this.prisma.subjects.findMany({
        where: { course_id: courseId, deleted_at: null },
        orderBy: { id: 'asc' },
      }),
      this.teachersByCourseIds([courseId]),
    ]);

    const teachers = teacherMap.get(courseId) ?? [];

    // Resolve students per subject from the enrol table, batched to avoid N+1.
    const enrolments = await this.prisma.enrol.findMany({
      where: { course_id: courseId, deleted_at: null },
      select: { user_id: true, subject_id: true },
    });

    const studentIds = [
      ...new Set(
        enrolments
          .map((e) => e.user_id)
          .filter((u): u is number => u != null),
      ),
    ];
    const students = studentIds.length
      ? await this.prisma.users.findMany({
          where: {
            id: { in: studentIds },
            role_id: STUDENT_ROLE_ID,
            deleted_at: null,
          },
          select: { id: true, name: true },
        })
      : [];
    const studentById = new Map(students.map((s) => [s.id, s]));

    // Group student ids by subject.
    const studentsBySubject = new Map<number, Array<{ id: number; name: string | null }>>();
    for (const e of enrolments) {
      if (e.subject_id == null || e.user_id == null) continue;
      const student = studentById.get(e.user_id);
      if (!student) continue; // user_id is not an active student
      const bucket = studentsBySubject.get(e.subject_id) ?? [];
      if (!bucket.some((s) => s.id === student.id)) {
        bucket.push(student);
      }
      studentsBySubject.set(e.subject_id, bucket);
    }

    return subjects.map((subject) => ({
      subject,
      teachers,
      students: studentsBySubject.get(subject.id) ?? [],
    }));
  }

  // ---------------------------------------------------------------------------
  // college  -> /colleges  (full CRUD; soft delete)
  // ---------------------------------------------------------------------------

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

  private async getCollege(id: number) {
    const college = await this.prisma.college.findFirst({
      where: { id, deleted_at: null },
    });
    if (!college) {
      throw new NotFoundException('College not found!');
    }
    return college;
  }

  async createCollege(dto: CreateCollegeDto) {
    const now = new Date();
    return this.prisma.college.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateCollege(id: number, dto: UpdateCollegeDto) {
    await this.getCollege(id);
    return this.prisma.college.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteCollege(id: number) {
    await this.getCollege(id);
    return this.prisma.college.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // countries  -> /countries  (full CRUD; PK is country_id, not id)
  //
  // ADAPTED: the legacy Country controller wrote `title`/`short_description`, but
  // Country_model maps to the `countries` table whose real columns are `country`,
  // `short_code`, `phonecode` (those legacy column names don't exist). We target
  // the real schema columns. The PK is `country_id`.
  // ---------------------------------------------------------------------------

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

  private async getCountry(id: number) {
    const country = await this.prisma.countries.findFirst({
      where: { country_id: id, deleted_at: null },
    });
    if (!country) {
      throw new NotFoundException('Country not found!');
    }
    return country;
  }

  async createCountry(dto: CreateCountryDto) {
    const now = new Date();
    return this.prisma.countries.create({
      data: {
        country: dto.country,
        short_code: dto.short_code ?? null,
        phonecode: dto.phonecode,
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateCountry(id: number, dto: UpdateCountryDto) {
    await this.getCountry(id);
    return this.prisma.countries.update({
      where: { country_id: id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteCountry(id: number) {
    await this.getCountry(id);
    return this.prisma.countries.update({
      where: { country_id: id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // states  -> /states  (read-only list with optional ?country filter)
  //
  // The `states` table has a `country` VarChar column (NOT country_id), so the
  // filter is a string match on that column — mirrors how the legacy lookups
  // scoped states by country name.
  // ---------------------------------------------------------------------------

  async listStates(query: StatesListQueryDto): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const where: { deleted_at: null; country?: string } = { deleted_at: null };
    if (query.country != null && query.country !== '') {
      where.country = query.country;
    }
    const [items, total] = await Promise.all([
      this.prisma.states.findMany({
        where,
        orderBy: { state_name: 'asc' },
        skip,
        take,
      }),
      this.prisma.states.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  // ---------------------------------------------------------------------------
  // document_type  -> /document-types  (full CRUD; soft delete)
  // ---------------------------------------------------------------------------

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

  private async getDocumentType(id: number) {
    const documentType = await this.prisma.document_type.findFirst({
      where: { id, deleted_at: null },
    });
    if (!documentType) {
      throw new NotFoundException('Document type not found!');
    }
    return documentType;
  }

  async createDocumentType(dto: CreateDocumentTypeDto) {
    const now = new Date();
    return this.prisma.document_type.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateDocumentType(id: number, dto: UpdateDocumentTypeDto) {
    await this.getDocumentType(id);
    return this.prisma.document_type.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteDocumentType(id: number) {
    await this.getDocumentType(id);
    return this.prisma.document_type.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // group_courses  -> /group-courses  (full CRUD; course_ids is a JSON LongText)
  //
  // Ports the App\Group_course controller + GroupCourse_model::getGroupsWithCourses.
  // `course_ids` is stored as a JSON-encoded array of course ids (json_encode in
  // legacy). List/read decode it and decorate each group with the referenced
  // courses (id, title, university_id, university_title) — built without an N+1.
  // ---------------------------------------------------------------------------

  /** Parse the JSON `course_ids` LongText into a numeric id array (lenient). */
  private parseCourseIds(raw: string | null | undefined): number[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n));
    } catch {
      return [];
    }
  }

  /**
   * Resolve the given course ids to { id, title, university_id, university_title }
   * in two bulk queries (courses + their universities), preserving the requested
   * order. Mirrors GroupCourse_model::getGroupsWithCourses' left join to
   * university. Used to decorate group-course rows.
   */
  private async coursesForGroup(courseIds: number[]) {
    if (courseIds.length === 0) return [];
    const courses = await this.prisma.course.findMany({
      where: { id: { in: courseIds }, deleted_at: null },
      select: { id: true, title: true, university_id: true },
    });
    const universityIds = [
      ...new Set(
        courses
          .map((c) => c.university_id)
          .filter((u): u is number => u != null),
      ),
    ];
    const universities =
      universityIds.length > 0
        ? await this.prisma.university.findMany({
            where: { id: { in: universityIds }, deleted_at: null },
            select: { id: true, title: true },
          })
        : [];
    const uniTitleById = new Map(universities.map((u) => [u.id, u.title]));
    const courseById = new Map(courses.map((c) => [c.id, c]));

    // Keep the order the ids were stored in; drop ids that no longer resolve.
    return courseIds
      .map((id) => courseById.get(id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .map((c) => ({
        id: c.id,
        title: c.title,
        university_id: c.university_id,
        university_title:
          c.university_id != null
            ? (uniTitleById.get(c.university_id) ?? null)
            : null,
      }));
  }

  /** Decorate a raw group_courses row with its resolved `courses` array. */
  private async decorateGroupCourse(group: {
    course_ids: string | null;
    [key: string]: unknown;
  }) {
    const ids = this.parseCourseIds(group.course_ids);
    const courses = await this.coursesForGroup(ids);
    return { ...group, courses };
  }

  async listGroupCourses(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [rows, total] = await Promise.all([
      this.prisma.group_courses.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.group_courses.count({ where: { deleted_at: null } }),
    ]);
    const items = await Promise.all(
      rows.map((row) => this.decorateGroupCourse(row)),
    );
    return this.paginated(items, total, page, limit);
  }

  private async getGroupCourseRow(id: number) {
    const group = await this.prisma.group_courses.findFirst({
      where: { id, deleted_at: null },
    });
    if (!group) {
      throw new NotFoundException('Group course not found!');
    }
    return group;
  }

  async createGroupCourse(dto: CreateGroupCourseDto) {
    const now = new Date();
    const created = await this.prisma.group_courses.create({
      data: {
        group_name: dto.group_name,
        description: dto.description ?? null,
        // Stored as a JSON-encoded array, mirroring legacy json_encode($courseIds).
        course_ids: JSON.stringify(dto.course_ids),
        created_at: now,
        updated_at: now,
      },
    });
    return this.decorateGroupCourse(created);
  }

  async updateGroupCourse(id: number, dto: UpdateGroupCourseDto) {
    await this.getGroupCourseRow(id);
    const data: {
      group_name?: string;
      description?: string | null;
      course_ids?: string;
      updated_at: Date;
    } = { updated_at: new Date() };
    if (dto.group_name !== undefined) data.group_name = dto.group_name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.course_ids !== undefined) {
      data.course_ids = JSON.stringify(dto.course_ids);
    }
    const updated = await this.prisma.group_courses.update({
      where: { id },
      data,
    });
    return this.decorateGroupCourse(updated);
  }

  async deleteGroupCourse(id: number) {
    await this.getGroupCourseRow(id);
    return this.prisma.group_courses.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---------------------------------------------------------------------------
  // universities knowledge-base  -> /universities/knowledge-base
  //
  // Lists active universities decorated with their country info. The
  // `university.country_id` column is a free-form Text blob that may hold one or
  // more comma-separated country ids, so we resolve every referenced id against
  // the `countries` table (PK country_id) in one bulk query and attach a
  // `countries` array per university.
  // ---------------------------------------------------------------------------

  async universitiesKnowledgeBase() {
    const universities = await this.prisma.university.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'desc' },
    });

    // country_id is a Text blob possibly holding several comma-separated ids.
    const parseCountryIds = (raw: string | null | undefined): number[] =>
      (raw ?? '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

    const allCountryIds = [
      ...new Set(universities.flatMap((u) => parseCountryIds(u.country_id))),
    ];
    const countries =
      allCountryIds.length > 0
        ? await this.prisma.countries.findMany({
            where: { country_id: { in: allCountryIds }, deleted_at: null },
            select: { country_id: true, country: true, short_code: true },
          })
        : [];
    const countryById = new Map(countries.map((c) => [c.country_id, c]));

    return universities.map((university) => ({
      ...university,
      countries: parseCountryIds(university.country_id)
        .map((cid) => countryById.get(cid))
        .filter((c): c is NonNullable<typeof c> => c != null),
    }));
  }

  // ---------------------------------------------------------------------------
  // visa_type  -> /visa-types
  // TODO(phase-3): The legacy `visa_type` lookup table (App\Visa_type controller,
  // Visa_type_model -> table `visa_type`) is NOT present in prisma/schema.prisma,
  // so there is no `prisma.visa_type` delegate. List + full CRUD therefore throw
  // Full CRUD mirroring document_type (soft-delete + manual JS-Date timestamps).
  // ---------------------------------------------------------------------------

  async listVisaTypes(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [items, total] = await Promise.all([
      this.prisma.visa_type.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'asc' },
        skip,
        take,
      }),
      this.prisma.visa_type.count({ where: { deleted_at: null } }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  private async getVisaType(id: number) {
    const visaType = await this.prisma.visa_type.findFirst({
      where: { id, deleted_at: null },
    });
    if (!visaType) {
      throw new NotFoundException('Visa type not found!');
    }
    return visaType;
  }

  async createVisaType(dto: CreateVisaTypeDto) {
    const now = new Date();
    return this.prisma.visa_type.create({
      data: { ...dto, created_at: now, updated_at: now },
    });
  }

  async updateVisaType(id: number, dto: UpdateVisaTypeDto) {
    await this.getVisaType(id);
    return this.prisma.visa_type.update({
      where: { id },
      data: { ...dto, updated_at: new Date() },
    });
  }

  async deleteVisaType(id: number) {
    await this.getVisaType(id);
    return this.prisma.visa_type.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }

  // ---- intakes (admission cycles) ----------------------------------------

  async listIntakes(query: Pagination): Promise<Paginated<unknown>> {
    const { page, limit, skip, take } = this.resolvePaging(query);
    const [rows, total] = await Promise.all([
      this.prisma.intake.findMany({
        where: { deleted_at: null },
        orderBy: { id: 'desc' },
        skip,
        take,
      }),
      this.prisma.intake.count({ where: { deleted_at: null } }),
    ]);
    // No intake<->university/course mapping tables yet, so counts are 0.
    const items = rows.map((r) => ({
      ...r,
      mapped_universities: 0,
      mapped_courses: 0,
    }));
    return this.paginated(items, total, page, limit);
  }

  private async getIntake(id: number) {
    const intake = await this.prisma.intake.findFirst({
      where: { id, deleted_at: null },
    });
    if (!intake) {
      throw new NotFoundException('Intake not found!');
    }
    return intake;
  }

  async createIntake(dto: CreateIntakeDto) {
    const now = new Date();
    return this.prisma.intake.create({
      data: {
        name: dto.name ?? null,
        month: dto.month ?? null,
        year: dto.year ?? null,
        start_date: dto.start_date ? new Date(dto.start_date) : null,
        closing_date: dto.closing_date ? new Date(dto.closing_date) : null,
        status: dto.status ?? 'Open',
        created_at: now,
        updated_at: now,
      },
    });
  }

  async updateIntake(id: number, dto: UpdateIntakeDto) {
    await this.getIntake(id);
    return this.prisma.intake.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.month !== undefined ? { month: dto.month } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.start_date !== undefined
          ? { start_date: dto.start_date ? new Date(dto.start_date) : null }
          : {}),
        ...(dto.closing_date !== undefined
          ? { closing_date: dto.closing_date ? new Date(dto.closing_date) : null }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updated_at: new Date(),
      },
    });
  }

  async deleteIntake(id: number) {
    await this.getIntake(id);
    return this.prisma.intake.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
  }
}
