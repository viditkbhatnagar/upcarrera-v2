import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInstitutionDto } from './dto/create-institution.dto';
import { UpdateInstitutionDto } from './dto/update-institution.dto';
import { ListInstitutionsDto } from './dto/list-institutions.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const BCRYPT_ROUNDS = 10;

/** Institutions are `users` rows with role_id=5 (legacy convention). */
const INSTITUTION_ROLE_ID = 5;

/**
 * Port of CI4 App/Controllers/App/Institutions. Institutions are `users` rows
 * with role_id=5, associated with a `university` via users.university_id.
 *
 * Conventions enforced everywhere:
 *  - Lists & reads filter `deleted_at: null` and `role_id: 5` (soft delete).
 *  - Delete = stamp `deleted_at` with a JS Date (no hard delete) — the existing
 *    codebase convention; legacy did a model `remove()`.
 *  - Create/update stamp `created_at` / `updated_at` manually.
 *  - Secret hashes are stripped from every response.
 */
@Injectable()
export class InstitutionsService {
  constructor(private readonly prisma: PrismaService) {}

  // GET /institutions — paginate + legacy search (name/phone/email) + university_id filter.
  async listInstitutions(query: ListInstitutionsDto) {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const skip = (page - 1) * limit;

    const where = {
      deleted_at: null,
      role_id: INSTITUTION_ROLE_ID,
      ...(query.university_id !== undefined
        ? { university_id: query.university_id }
        : {}),
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
        skip,
        take: limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      items: items.map((u) => this.stripSecrets(u)),
      total,
      page,
      limit,
    };
  }

  // Internal read — 404 if missing, soft-deleted, or not a role_id=5 user.
  private async findInstitution(id: number) {
    const institution = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: INSTITUTION_ROLE_ID },
    });
    if (!institution) {
      throw new NotFoundException('Institution not found!');
    }
    return institution;
  }

  // GET /institutions/:id
  async getInstitution(id: number) {
    return this.stripSecrets(await this.findInstitution(id));
  }

  /**
   * POST /institutions — port of Institutions::add. Guards against duplicate
   * code+phone / email / username (legacy checked each separately) and surfaces
   * a 409 rather than the legacy flash message. Password is bcrypt-hashed.
   */
  async createInstitution(dto: CreateInstitutionDto, userId: number) {
    await this.assertUserUnique({
      username: dto.username,
      email: dto.email,
      code: dto.code,
      phone: dto.phone,
    });

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const institution = await this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        university_id: dto.university_id ?? null,
        institution_id: dto.institution_id ?? null,
        code: dto.code ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        profile_picture: dto.profile_picture ?? null,
        role_id: INSTITUTION_ROLE_ID,
        status: 1,
        created_by: userId,
        updated_by: userId,
        created_at: now,
        updated_at: now,
      },
    });

    return this.stripSecrets(institution);
  }

  /** PATCH /institutions/:id — port of Institutions::edit (profile only, no password). */
  async updateInstitution(id: number, dto: UpdateInstitutionDto, userId: number) {
    await this.findInstitution(id); // 404 if missing / not an institution

    const data: Record<string, unknown> = {
      updated_by: userId,
      updated_at: new Date(),
    };

    const assignable: (keyof UpdateInstitutionDto)[] = [
      'name',
      'university_id',
      'institution_id',
      'code',
      'phone',
      'email',
      'profile_picture',
    ];
    for (const key of assignable) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }

    const institution = await this.prisma.users.update({ where: { id }, data });
    return this.stripSecrets(institution);
  }

  /**
   * PATCH /institutions/:id/password — port of Institutions::reset_password.
   * Optionally renames the user (uniqueness check excluding self), then resets
   * the password: the OLD hash is preserved in prev_password and the new one is
   * bcrypt-hashed. Sets updated_by / updated_at.
   */
  async resetPassword(id: number, dto: ResetPasswordDto, userId: number) {
    const institution = await this.findInstitution(id);

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
      prev_password: institution.password ?? null,
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

  // DELETE /institutions/:id — soft delete (set deleted_at = now).
  async deleteInstitution(id: number, userId: number) {
    await this.findInstitution(id);
    await this.prisma.users.update({
      where: { id },
      data: { deleted_at: new Date(), deleted_by: userId },
    });
    return { id };
  }

  /**
   * GET /users/:id/university — fetch the university associated with a user.
   * Resolves the user's university_id, then loads the (non-deleted) university.
   * Returns null when the user has no university association.
   */
  async getUserUniversity(userId: number) {
    const user = await this.prisma.users.findFirst({
      where: { id: userId, deleted_at: null },
      select: { university_id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found!');
    }
    if (user.university_id == null) {
      return null;
    }
    return this.prisma.university.findFirst({
      where: { id: user.university_id, deleted_at: null },
    });
  }

  /**
   * Duplicate guard for institution creation (legacy Institutions::add checked
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
