import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ListTelecallersDto } from './dto/list-telecallers.dto';
import { CreateTelecallerDto } from './dto/create-telecaller.dto';
import { UpdateTelecallerDto } from './dto/update-telecaller.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { ListSalesTeamsDto } from './dto/list-sales-teams.dto';
import { CreateSalesTeamDto } from './dto/create-sales-team.dto';
import { UpdateSalesTeamDto } from './dto/update-sales-team.dto';

/** Legacy role ids (login_helper.php). */
const TELECALLER_ROLE_ID = 2;
const STUDENT_ROLE_ID = 4;
const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Port of CI4 App\Controllers\App\{Sales, Telecallers} + Models\Sales_model.
 *
 * - Telecallers are `users` rows with role_id=2.
 * - Sales teams live in the `sales_team` table; its `members` column is a JSON
 *   string (LongText) of user ids, parsed/stringified here. leader/university_id/
 *   course_id are VarChar columns (strings), status is the only Int column.
 * - The legacy schema uses manual timestamp columns (no auto timestamps), so we
 *   set created_at/updated_at by hand and soft-delete by stamping deleted_at.
 *
 * Revenue note: the legacy performance/insights summed `students.fee`, but that
 * column does not exist in this schema. The faithful revenue source here is the
 * `invoice` table (the lead->student conversion saga bills each student via
 * invoices). Per member we sum invoice.payable_amount across that member's
 * students (students.consultant_id = memberId, role_id=4), preserving the
 * legacy per-team / per-member loop structure exactly.
 */
@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private normalizePagination(page?: number, limit?: number) {
    const safePage = page && page > 0 ? page : DEFAULT_PAGE;
    const safeLimit = limit && limit > 0 ? limit : DEFAULT_LIMIT;
    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  // ====================================================================
  // Telecallers (users where role_id = 2)
  // ====================================================================

  async findAllTelecallers(query: ListTelecallersDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    // Mirrors Telecallers::index search across name/phone/email.
    const where = {
      deleted_at: null,
      role_id: TELECALLER_ROLE_ID,
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search } },
              { phone: { contains: query.search } },
              { email: { contains: query.search } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      items: items.map((u) => this.stripSecrets(u)),
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  async findOneTelecaller(id: number) {
    const telecaller = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: TELECALLER_ROLE_ID },
    });
    if (!telecaller) {
      throw new NotFoundException('Telecaller not found!');
    }
    return this.stripSecrets(telecaller);
  }

  /**
   * Port of Telecallers::add. Legacy guarded against duplicate
   * code+phone / email / username before inserting; we keep that guard and
   * surface it as a 409 rather than the legacy flash message.
   */
  async createTelecaller(dto: CreateTelecallerDto, userId: number) {
    await this.assertUserUnique({
      username: dto.username,
      email: dto.email,
      code: dto.code,
      phone: dto.phone,
    });

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const telecaller = await this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        code: dto.code ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        profile_picture: dto.profile_picture ?? null,
        role_id: TELECALLER_ROLE_ID,
        status: 1,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });

    return this.stripSecrets(telecaller);
  }

  /** Port of Telecallers::edit — partial profile update (no password change). */
  async updateTelecaller(id: number, dto: UpdateTelecallerDto, userId: number) {
    await this.findOneTelecaller(id); // 404 if missing / not a telecaller

    const now = new Date();
    const data: Record<string, unknown> = {
      updated_by: userId,
      updated_at: now,
    };

    const assignable: (keyof UpdateTelecallerDto)[] = [
      'name',
      'email',
      'code',
      'phone',
      'profile_picture',
    ];
    for (const key of assignable) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }

    const telecaller = await this.prisma.users.update({ where: { id }, data });
    return this.stripSecrets(telecaller);
  }

  // ====================================================================
  // User password / username reset
  // ====================================================================

  /**
   * Port of Sales::edit_password + Telecallers::reset_password. Optionally
   * renames the user (with a uniqueness check excluding self), then resets the
   * password: the OLD hash is preserved in prev_password and the new password
   * is bcrypt-hashed. Sets updated_by / updated_at.
   */
  async updatePassword(id: number, dto: UpdatePasswordDto, userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null },
    });
    if (!user) {
      throw new NotFoundException('User not found!');
    }

    // Username uniqueness guard (legacy: id != $id check).
    if (dto.username !== undefined && dto.username !== '') {
      const clash = await this.prisma.users.findFirst({
        where: { username: dto.username, id: { not: id }, deleted_at: null },
        select: { id: true },
      });
      if (clash) {
        throw new ConflictException('Username Already Exists');
      }
    }

    const now = new Date();
    const data: Record<string, unknown> = {
      // Preserve the previous hash before overwriting (legacy prev_password).
      prev_password: user.password ?? null,
      password: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      updated_by: userId,
      updated_at: now,
    };
    if (dto.username !== undefined && dto.username !== '') {
      data.username = dto.username;
    }

    const updated = await this.prisma.users.update({ where: { id }, data });
    return this.stripSecrets(updated);
  }

  // ====================================================================
  // Sales teams (sales_team table)
  // ====================================================================

  async findAllTeams(query: ListSalesTeamsDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    // Mirrors Sales::index filters. leader/university_id/course_id are VarChar.
    const where = {
      deleted_at: null,
      ...(query.search ? { name: { contains: query.search } } : {}),
      ...(query.course_id ? { course_id: query.course_id } : {}),
      ...(query.university_id ? { university_id: query.university_id } : {}),
      ...(query.leader ? { leader: query.leader } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.sales_team.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.sales_team.count({ where }),
    ]);

    return {
      items: items.map((t) => this.withParsedMembers(t)),
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  async findOneTeam(id: number) {
    const team = await this.prisma.sales_team.findFirst({
      where: { id, deleted_at: null },
    });
    if (!team) {
      throw new NotFoundException('Sales Team not found!');
    }
    return this.withParsedMembers(team);
  }

  /** Port of Sales::add — members[] is stored as a JSON string. */
  async createTeam(dto: CreateSalesTeamDto, userId: number) {
    const now = new Date();
    const team = await this.prisma.sales_team.create({
      data: {
        name: dto.name,
        leader: dto.leader ?? null,
        members:
          dto.members !== undefined ? JSON.stringify(dto.members) : null,
        university_id: dto.university_id ?? null,
        course_id: dto.course_id ?? null,
        status: dto.status ?? null,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });
    return this.withParsedMembers(team);
  }

  /** Port of Sales::edit — partial update; re-stringifies members when given. */
  async updateTeam(id: number, dto: UpdateSalesTeamDto, userId: number) {
    await this.findOneTeam(id); // 404 if missing / soft-deleted

    const now = new Date();
    const data: Record<string, unknown> = {
      updated_by: userId,
      updated_at: now,
    };

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.leader !== undefined) data.leader = dto.leader;
    if (dto.members !== undefined) data.members = JSON.stringify(dto.members);
    if (dto.university_id !== undefined) data.university_id = dto.university_id;
    if (dto.course_id !== undefined) data.course_id = dto.course_id;
    if (dto.status !== undefined) data.status = dto.status;

    const team = await this.prisma.sales_team.update({ where: { id }, data });
    return this.withParsedMembers(team);
  }

  /** Soft delete — stamp deleted_at/deleted_by (Sales::delete -> remove()). */
  async removeTeam(id: number, userId: number) {
    await this.findOneTeam(id); // 404 if missing / already soft-deleted

    const now = new Date();
    await this.prisma.sales_team.update({
      where: { id },
      data: { deleted_at: now, deleted_by: userId, updated_at: now },
    });
    return { id };
  }

  // ====================================================================
  // Performance + insights
  // ====================================================================

  /**
   * Port of Sales::performance. For each (non-deleted) team, sum revenue and
   * count students across the team's members, then derive a success_percentage
   * against the total student population. Mirrors the legacy member loop, but
   * sources revenue from invoices (see class note) instead of the missing
   * students.fee column.
   *
   * Returns each team with { members (parsed), total_amount, success_percentage }.
   */
  async performance(query: ListSalesTeamsDto) {
    const where = {
      deleted_at: null,
      ...(query.search ? { name: { contains: query.search } } : {}),
      ...(query.course_id ? { course_id: query.course_id } : {}),
      ...(query.university_id ? { university_id: query.university_id } : {}),
      ...(query.leader ? { leader: query.leader } : {}),
    };

    const [teams, overallStudentCount] = await Promise.all([
      this.prisma.sales_team.findMany({ where, orderBy: { id: 'desc' } }),
      this.prisma.users.count({
        where: { role_id: STUDENT_ROLE_ID, deleted_at: null },
      }),
    ]);

    const results: Array<
      Record<string, unknown> & {
        total_amount: number;
        success_percentage: number;
      }
    > = [];
    for (const team of teams) {
      const memberIds = this.parseMemberIds(team.members);

      let totalAmount = 0;
      let totalStudents = 0;
      for (const memberId of memberIds) {
        const { revenue, studentCount } =
          await this.memberRevenue(memberId);
        totalAmount += revenue;
        totalStudents += studentCount;
      }

      const successPercentage =
        overallStudentCount > 0
          ? Math.round((totalStudents / overallStudentCount) * 100 * 100) / 100
          : 0;

      results.push({
        ...this.withParsedMembers(team),
        total_amount: totalAmount,
        success_percentage: successPercentage,
      });
    }

    return results;
  }

  /**
   * Port of Sales::insights. Like performance(), but additionally returns a
   * per-member revenue breakdown for each team (member name + revenue), plus
   * the team totals (total_admission, total_amount).
   */
  async insights() {
    const teams = await this.prisma.sales_team.findMany({
      where: { deleted_at: null },
      orderBy: { id: 'desc' },
    });

    const results: Array<
      Record<string, unknown> & {
        total_admission: number;
        total_amount: number;
        members_details: Array<{ id: number; name: string; revenue: number }>;
      }
    > = [];
    for (const team of teams) {
      const memberIds = this.parseMemberIds(team.members);

      let totalAmount = 0;
      let totalStudents = 0;
      const memberDetails: Array<{
        id: number;
        name: string;
        revenue: number;
      }> = [];
      for (const memberId of memberIds) {
        const { revenue, studentCount } = await this.memberRevenue(memberId);
        const member = await this.prisma.users.findFirst({
          where: { id: memberId },
          select: { name: true },
        });

        totalAmount += revenue;
        totalStudents += studentCount;
        memberDetails.push({
          id: memberId,
          name: member?.name ?? '',
          revenue,
        });
      }

      results.push({
        ...this.withParsedMembers(team),
        total_admission: totalStudents,
        total_amount: totalAmount,
        members_details: memberDetails,
      });
    }

    return results;
  }

  // ====================================================================
  // Helpers
  // ====================================================================

  /**
   * Sum invoice.payable_amount and count students owned by one member.
   * A "member's student" = a students row with consultant_id = memberId whose
   * linked users row is a (non-deleted) student (role_id=4), mirroring the
   * legacy join `students.student_id = users.id AND users.role_id = 4`.
   */
  private async memberRevenue(
    memberId: number,
  ): Promise<{ revenue: number; studentCount: number }> {
    const students = await this.prisma.students.findMany({
      where: { consultant_id: memberId, deleted_at: null },
      select: { student_id: true },
    });
    if (students.length === 0) {
      return { revenue: 0, studentCount: 0 };
    }

    const studentUserIds = students.map((s) => s.student_id);

    // Keep only ids that map to a live role_id=4 user (legacy join condition).
    const studentUsers = await this.prisma.users.findMany({
      where: {
        id: { in: studentUserIds },
        role_id: STUDENT_ROLE_ID,
        deleted_at: null,
      },
      select: { id: true },
    });
    const validIds = studentUsers.map((u) => u.id);
    if (validIds.length === 0) {
      return { revenue: 0, studentCount: 0 };
    }

    const agg = await this.prisma.invoice.aggregate({
      where: { student_id: { in: validIds }, deleted_at: null },
      _sum: { payable_amount: true },
    });

    return {
      revenue: agg._sum.payable_amount ?? 0,
      studentCount: validIds.length,
    };
  }

  /** Parse the sales_team.members JSON string into numeric user ids. */
  private parseMemberIds(members: string | null): number[] {
    const parsed = this.safeParseMembers(members);
    return parsed
      .map((m) => Number(m))
      .filter((n) => !Number.isNaN(n));
  }

  /** Parse members JSON, tolerating null / malformed values (returns []). */
  private safeParseMembers(members: string | null): unknown[] {
    if (!members) return [];
    try {
      const parsed = JSON.parse(members);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** Return a team row with `members` replaced by the parsed array. */
  private withParsedMembers<T extends { members: string | null }>(team: T) {
    return { ...team, members: this.safeParseMembers(team.members) };
  }

  /**
   * Duplicate guard for telecaller creation (legacy Telecallers::add checked
   * code+phone / email / username separately). Throws 409 on any collision.
   */
  private async assertUserUnique(fields: {
    username: string;
    email?: string;
    code?: number;
    phone?: string;
  }) {
    const ors: Record<string, unknown>[] = [{ username: fields.username }];
    if (fields.email) ors.push({ email: fields.email });
    if (fields.code !== undefined && fields.phone) {
      ors.push({ code: fields.code, phone: fields.phone });
    }

    const existing = await this.prisma.users.findFirst({
      where: { deleted_at: null, OR: ors },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('User already exists');
    }
  }

  /** Strip secret hashes before returning a users row. */
  private stripSecrets<
    T extends {
      password?: string | null;
      prev_password?: string | null;
      zoom_password?: string | null;
    },
  >(user: T): Omit<T, 'password' | 'prev_password' | 'zoom_password'> {
    const { password, prev_password, zoom_password, ...rest } = user;
    return rest;
  }
}
