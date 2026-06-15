import {
  ConflictException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { ListStudentsDto } from './dto/list-students.dto';
import { ListApplicationsDto } from './dto/list-applications.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Port of CI4 App/Students + App/Application read/write CRUD.
 * Legacy uses manual timestamps and soft-delete (deleted_at IS NULL), both honoured here.
 */
@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /students — paginate + optional filter by admission_status.
  async listStudents(query: ListStudentsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      ...(query.admission_status !== undefined
        ? { admission_status: query.admission_status }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.students.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.students.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // GET /students/:id
  async getStudent(id: number) {
    const student = await this.prisma.students.findFirst({
      where: { id, deleted_at: null },
    });
    if (!student) {
      throw new NotFoundException('Student not found!');
    }
    return student;
  }

  // POST /students
  async createStudent(dto: CreateStudentDto) {
    const now = new Date();
    return this.prisma.students.create({
      data: {
        ...this.toStudentData(dto),
        // student_id, address and consultant_id are required (NOT NULL) columns.
        student_id: dto.student_id,
        address: dto.address,
        consultant_id: dto.consultant_id,
        created_at: now,
        updated_at: now,
      },
    });
  }

  // PATCH /students/:id
  async updateStudent(id: number, dto: UpdateStudentDto) {
    await this.getStudent(id); // 404 if missing or already soft-deleted
    return this.prisma.students.update({
      where: { id },
      data: {
        ...this.toStudentData(dto),
        updated_at: new Date(),
      },
    });
  }

  // DELETE /students/:id — soft delete (set deleted_at = now).
  async deleteStudent(id: number) {
    await this.getStudent(id);
    await this.prisma.students.update({
      where: { id },
      data: { deleted_at: new Date() },
    });
    return { id };
  }

  // GET /students/:id/documents
  async getStudentDocuments(id: number) {
    await this.getStudent(id);
    return this.prisma.student_document.findMany({
      where: { student_id: id, deleted_at: null },
      orderBy: { student_document_id: 'desc' },
    });
  }

  // GET /students/:id/qualifications
  async getStudentQualifications(id: number) {
    await this.getStudent(id);
    // NOTE: qualification.deleted_at is an Int? in the legacy schema (not a timestamp);
    // "not deleted" is still represented as NULL.
    return this.prisma.qualification.findMany({
      where: { student_id: id, deleted_at: null },
      orderBy: { qualification_id: 'desc' },
    });
  }

  // GET /applications — paginate.
  async listApplications(query: ListApplicationsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = { deleted_at: null };

    const [items, total] = await Promise.all([
      this.prisma.applications.findMany({
        where,
        skip,
        take: limit,
        orderBy: { application_id: 'desc' },
      }),
      this.prisma.applications.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  // GET /applications/:id
  async getApplication(applicationId: number) {
    const application = await this.prisma.applications.findFirst({
      where: { application_id: applicationId, deleted_at: null },
    });
    if (!application) {
      throw new NotFoundException('Application not found!');
    }
    return application;
  }

  /**
   * POST /applications/:id/convert — application -> student saga.
   * Port of App/Controllers/App/Application::convert().
   *
   * One interactive transaction performs, atomically:
   *   1. users            — a role_id=4 (student) account, password = bcrypt(phone)
   *   2. student_payments — a 'Registration Fee' / 'Paid' row (legacy student_fee)
   *   3. students         — the student profile row (student_id = new user id),
   *                         with adm_pipeline derived from the creator's role
   *   4. qualification    — stamp the new student_id onto the application's rows
   *   5. student_document — stamp the new student_id onto the application's rows
   *   6. applications     — flag converted (is_converted=1, converted_by, converted_at)
   *
   * Returns { user_id, student_id }.
   */
  async convertApplication(applicationId: number, actorUserId: number) {
    const application = await this.getApplication(applicationId); // 404 if missing/deleted

    if (application.is_converted === 1) {
      throw new ConflictException('Application is already converted!');
    }

    const STUDENT_ROLE_ID = 4;
    const CONSULTANT_ROLE_ID = 6;
    const CLIENT_ROLE_ID = 8;

    return this.prisma.$transaction(async (tx) => {
      const now = new Date();

      // Password defaults to the applicant's phone (legacy behaviour).
      const hashedPassword = await bcrypt.hash(application.phone ?? '', 10);

      // 1. users row (role_id = 4 student)
      const user = await tx.users.create({
        data: {
          name: application.name ?? null,
          email: application.email ?? null,
          code: application.code ?? null,
          phone: application.phone ?? null,
          university_id: application.university_id ?? null,
          gender: application.gender ?? null,
          country_id: application.country_id ?? null,
          profile_picture: application.cropped_image ?? null,
          dob: application.dob ?? null,
          role_id: STUDENT_ROLE_ID,
          status: 1,
          password: hashedPassword,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 2. registration fee — legacy student_fee == student_payments table.
      await tx.student_payments.create({
        data: {
          installment_details: 'Registration Fee',
          amount: application.amount ?? null,
          paid_date: application.paid_date ?? null,
          payment_mode: application.payment_mode ?? null,
          payment_to: application.payment_to ?? null,
          status: 'Paid',
          student_id: user.id,
          created_by: application.created_by ?? actorUserId,
          created_at: application.created_at ?? now,
        },
      });

      // The admission pipeline depends on the role of whoever created the application.
      const creator = application.created_by
        ? await tx.users.findUnique({
            where: { id: application.created_by },
            select: { role_id: true },
          })
        : null;
      const creatorRoleId = creator?.role_id ?? null;

      let admPipeline = 'consultant';
      let consultantId = application.created_by ?? actorUserId;
      let pipelineUser = application.pipeline_user ?? null;

      if (creatorRoleId === CONSULTANT_ROLE_ID) {
        admPipeline = 'consultant';
        consultantId = application.created_by ?? actorUserId;
        pipelineUser = application.created_by ?? null;
      } else if (creatorRoleId === CLIENT_ROLE_ID) {
        admPipeline = 'client';
        pipelineUser = application.created_by ?? null;
      }

      // Derive age in whole years from the applicant's DOB, when present.
      const age = application.dob
        ? Math.floor(
            (now.getTime() - new Date(application.dob).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null;

      // 3. students profile row (student_id = new user id)
      await tx.students.create({
        data: {
          student_id: user.id,
          age,
          enrollment_id: application.enrollment_id ?? null,
          application_id: application.custom_application_id ?? null,
          abc_id: application.abc_id ?? null,
          dob: application.dob ?? null,
          nationality: application.nationality ?? null,
          second_code:
            application.second_code != null
              ? String(application.second_code)
              : null,
          second_phone: application.second_phone ?? null,
          whatsapp_no: application.whatsapp_no ?? null,
          state: application.state ?? null,
          district: application.district ?? null,
          // address is a NOT NULL column.
          address: application.address ?? '',
          session_id: application.session_id ?? null,
          source: application.source ?? null,
          admission_status:
            application.admission_status != null
              ? Number(application.admission_status)
              : null,
          // consultant_id is a NOT NULL column.
          consultant_id: consultantId,
          specialisation_id: application.specialisation_id ?? null,
          course_id: application.course_id ?? null,
          enrollment_date: application.enrollment_date ?? null,
          referred_by: application.created_by ?? null,
          adm_pipeline: admPipeline,
          pipeline_user: pipelineUser,
          created_by: actorUserId,
          updated_by: actorUserId,
          created_at: now,
          updated_at: now,
        },
      });

      // 4. stamp the new student onto the application's qualification rows.
      await tx.qualification.updateMany({
        where: { application_id: application.application_id },
        data: {
          student_id: user.id,
          updated_at: now,
          updated_by: actorUserId,
        },
      });

      // 5. stamp the new student onto the application's document rows.
      await tx.student_document.updateMany({
        where: { application_id: application.application_id },
        data: {
          student_id: user.id,
          updated_at: now,
          updated_by: actorUserId,
        },
      });

      // 6. mark the application converted.
      await tx.applications.update({
        where: { application_id: application.application_id },
        data: {
          is_converted: 1,
          converted_by: actorUserId,
          converted_at: now,
          updated_by: actorUserId,
          updated_at: now,
        },
      });

      return { user_id: user.id, student_id: user.id };
    });
  }

  // POST /students/:id/documents — document upload.
  // Legacy: file move + student_document insert.
  uploadDocument(_id: number): never {
    // TODO(phase-3): port document upload (file storage + student_document insert).
    throw new NotImplementedException('Document upload — phase 3');
  }

  /**
   * Maps DTO fields to the Prisma `students` shape, converting date strings to Date
   * objects and dropping the required-column fields handled explicitly by the caller.
   */
  private toStudentData(dto: CreateStudentDto | UpdateStudentDto) {
    const { dob, enrollment_date, ...rest } = dto;
    // student_id/address/consultant_id are set explicitly on create; for update they
    // pass through `rest` only when present. Date strings are converted to Date objects.
    return {
      ...rest,
      ...(dob !== undefined ? { dob: new Date(dob) } : {}),
      ...(enrollment_date !== undefined
        ? { enrollment_date: new Date(enrollment_date) }
        : {}),
    };
  }
}
