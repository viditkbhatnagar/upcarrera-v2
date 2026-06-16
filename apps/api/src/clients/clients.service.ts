import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';

/** Legacy role id for clients (Clients.php hard-codes role_id = 8). */
const CLIENT_ROLE_ID = 8;
const BCRYPT_ROUNDS = 10;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Port of CI4 App\Controllers\App\Clients.
 *
 * A client is a `users` row with role_id = 8 PLUS a `clients` profile row
 * (clients.user_id = users.id). The legacy schema uses manual timestamp columns
 * (no auto timestamps), so created_at/updated_at are set by hand, and "delete"
 * stamps deleted_at instead of removing the row.
 *
 * The user-level fields (name, contact, login, partnership_status, country)
 * live on `users`; the business profile (business_name, consultant_type,
 * commission_model, address, university/course id lists, agreement, dates) lives
 * on `clients`. `clients.university` / `clients.course` are LongText columns
 * holding json_encode'd id arrays (legacy `json_encode($post['university'])`).
 */
@Injectable()
export class ClientsService {
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

  /** Never leak password hashes in API responses. */
  private stripSecrets<
    T extends { password?: string | null; prev_password?: string | null },
  >(user: T): Omit<T, 'password' | 'prev_password'> {
    const { password, prev_password, ...rest } = user;
    return rest;
  }

  // ===========================================================================
  // Clients CRUD (users where role_id = 8 + a clients profile row)
  // ===========================================================================

  /**
   * GET /clients — paginated role_id=8 users joined to their clients profile and
   * resolved country. Honours the legacy index() filters: partnership_status
   * (users.partnership_status) and country_id (users.country_id).
   * Port of Clients::index.
   */
  async findAll(query: ListClientsDto) {
    const pg = this.normalizePagination(query.page, query.limit);

    const where = {
      deleted_at: null,
      role_id: CLIENT_ROLE_ID,
      ...(query.partnership_status
        ? { partnership_status: query.partnership_status }
        : {}),
      ...(query.country_id !== undefined ? { country_id: query.country_id } : {}),
    };

    const [users, total] = await Promise.all([
      this.prisma.users.findMany({
        where,
        skip: pg.skip,
        take: pg.limit,
        orderBy: { id: 'desc' },
      }),
      this.prisma.users.count({ where }),
    ]);

    const items = await this.attachProfiles(users);

    return {
      items,
      total,
      page: pg.page,
      limit: pg.limit,
    };
  }

  /** Re-validate a client user exists (role_id=8, not soft-deleted) or 404. */
  private async getClientUserOrThrow(id: number) {
    const user = await this.prisma.users.findFirst({
      where: { id, deleted_at: null, role_id: CLIENT_ROLE_ID },
    });
    if (!user) {
      throw new NotFoundException('Client not found!');
    }
    return user;
  }

  /**
   * GET /clients/:id — the user row + its clients profile (with decoded
   * university/course id lists) + resolved country. Port of Clients::view, which
   * joined countries and clients onto the users row.
   */
  async findOne(id: number) {
    const user = await this.getClientUserOrThrow(id);

    const profile = await this.prisma.clients.findFirst({
      where: { user_id: id, deleted_at: null },
      orderBy: { client_id: 'desc' },
    });

    const country = user.country_id
      ? await this.prisma.countries.findUnique({
          where: { country_id: user.country_id },
          select: { country_id: true, country: true },
        })
      : null;

    return {
      ...this.stripSecrets(user),
      country: country?.country ?? null,
      profile: profile ? this.decorateProfile(profile) : null,
    };
  }

  /**
   * POST /clients — create a role_id=8 user (bcrypt password) plus its clients
   * profile row. Port of Clients::add, including the duplicate (code+phone) /
   * email guard. The legacy welcome-email / file-upload steps are omitted (no
   * EmailService / StorageService is wired into this module per the brief;
   * profile_picture / agreement are accepted as already-stored paths instead).
   */
  async create(dto: CreateClientDto, actorUserId: number) {
    await this.assertNoDuplicate(dto.code, dto.phone, dto.email, undefined);

    const now = new Date();
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.users.create({
      data: {
        name: dto.name,
        username: dto.username,
        password: hashed,
        code: dto.code ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        country_id: dto.country_id ?? null,
        profile_picture: dto.profile_picture ?? null,
        partnership_status: dto.partnership_status ?? null,
        status: dto.status ?? 1,
        role_id: CLIENT_ROLE_ID,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });

    const profile = await this.prisma.clients.create({
      data: {
        user_id: user.id,
        business_name: dto.business_name ?? null,
        consultant_type: dto.consultant_type ?? null,
        business_category: dto.business_category ?? null,
        city: dto.city ?? null,
        state: dto.state ?? null,
        // clients.address is a NOT-NULL Text column.
        address: dto.address ?? '',
        languages: dto.languages ?? null,
        whatsapp: dto.whatsapp ?? null,
        website: dto.website ?? null,
        commission_model: dto.commission_model ?? null,
        agreement: dto.agreement ?? null,
        university: this.encodeIds(dto.university),
        course: this.encodeIds(dto.course),
        start_date: dto.start_date ? new Date(dto.start_date) : null,
        end_date: dto.end_date ? new Date(dto.end_date) : null,
        created_by: actorUserId,
        updated_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });

    return {
      ...this.stripSecrets(user),
      profile: this.decorateProfile(profile),
    };
  }

  /**
   * PATCH /clients/:id — partial update of both the users row and its clients
   * profile (port of Clients::edit). Re-hashes the password only when a new,
   * non-empty one is supplied. Creates the profile row if it is somehow missing.
   */
  async update(id: number, dto: UpdateClientDto, actorUserId: number) {
    await this.getClientUserOrThrow(id); // 404 if missing / not a client
    await this.assertNoDuplicate(dto.code, dto.phone, dto.email, id);

    const now = new Date();

    // --- users update -------------------------------------------------------
    const userData: Record<string, unknown> = {
      updated_by: actorUserId,
      updated_at: now,
    };
    const userScalarKeys: (keyof UpdateClientDto)[] = [
      'name',
      'username',
      'code',
      'phone',
      'email',
      'country_id',
      'profile_picture',
      'partnership_status',
      'status',
    ];
    for (const key of userScalarKeys) {
      if (dto[key] !== undefined) {
        userData[key] = dto[key];
      }
    }
    if (dto.password !== undefined && dto.password !== '') {
      userData.password = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const user = await this.prisma.users.update({
      where: { id },
      data: userData,
    });

    // --- clients profile update --------------------------------------------
    const profileData = this.buildProfileData(dto, actorUserId, now);

    const existingProfile = await this.prisma.clients.findFirst({
      where: { user_id: id, deleted_at: null },
      orderBy: { client_id: 'desc' },
    });

    let profile;
    if (existingProfile) {
      profile = await this.prisma.clients.update({
        where: { client_id: existingProfile.client_id },
        data: profileData,
      });
    } else {
      // No profile yet (legacy edit assumed one existed); create it so the
      // client always has a backing profile after an update.
      profile = await this.prisma.clients.create({
        data: {
          user_id: id,
          address: '',
          created_by: actorUserId,
          created_at: now,
          ...profileData,
        },
      });
    }

    return {
      ...this.stripSecrets(user),
      profile: this.decorateProfile(profile),
    };
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  /**
   * Duplicate guard mirroring the legacy add()/edit(): a clash on (code+phone)
   * OR on email (excluding the row being edited) raises a 409. Only checks a
   * field when it was supplied.
   */
  private async assertNoDuplicate(
    code: number | undefined,
    phone: string | undefined,
    email: string | undefined,
    excludeId: number | undefined,
  ) {
    const notSelf = excludeId !== undefined ? { id: { not: excludeId } } : {};

    const dupPhone =
      phone !== undefined && phone !== ''
        ? await this.prisma.users.count({
            where: {
              code: code ?? undefined,
              phone,
              deleted_at: null,
              ...notSelf,
            },
          })
        : 0;

    const dupEmail =
      email !== undefined && email !== ''
        ? await this.prisma.users.count({
            where: { email, deleted_at: null, ...notSelf },
          })
        : 0;

    if (dupPhone > 0 || dupEmail > 0) {
      throw new ConflictException('User already exists!');
    }
  }

  /** Build the clients-profile update payload from only the supplied fields. */
  private buildProfileData(
    dto: UpdateClientDto,
    actorUserId: number,
    now: Date,
  ): Record<string, unknown> {
    const data: Record<string, unknown> = {
      updated_by: actorUserId,
      updated_at: now,
    };

    const scalarKeys: (keyof UpdateClientDto)[] = [
      'business_name',
      'consultant_type',
      'business_category',
      'city',
      'state',
      'address',
      'languages',
      'whatsapp',
      'website',
      'commission_model',
      'agreement',
    ];
    for (const key of scalarKeys) {
      if (dto[key] !== undefined) {
        data[key] = dto[key];
      }
    }

    if (dto.university !== undefined) {
      data.university = this.encodeIds(dto.university);
    }
    if (dto.course !== undefined) {
      data.course = this.encodeIds(dto.course);
    }
    if (dto.start_date !== undefined) {
      data.start_date = dto.start_date ? new Date(dto.start_date) : null;
    }
    if (dto.end_date !== undefined) {
      data.end_date = dto.end_date ? new Date(dto.end_date) : null;
    }

    return data;
  }

  /** Attach each user's clients profile (decoded) for the list endpoint. */
  private async attachProfiles<
    T extends {
      id: number;
      country_id: number | null;
      password?: string | null;
      prev_password?: string | null;
    },
  >(users: T[]) {
    const userIds = users.map((u) => u.id);
    const profiles =
      userIds.length > 0
        ? await this.prisma.clients.findMany({
            where: { user_id: { in: userIds }, deleted_at: null },
            orderBy: { client_id: 'desc' },
          })
        : [];

    // Keep the most recent profile per user_id (matches the join's single row).
    const profileByUser = new Map<number, (typeof profiles)[number]>();
    for (const p of profiles) {
      if (p.user_id != null && !profileByUser.has(p.user_id)) {
        profileByUser.set(p.user_id, p);
      }
    }

    const countryIds = [
      ...new Set(
        users
          .map((u) => u.country_id)
          .filter((cid): cid is number => cid != null),
      ),
    ];
    const countries =
      countryIds.length > 0
        ? await this.prisma.countries.findMany({
            where: { country_id: { in: countryIds } },
            select: { country_id: true, country: true },
          })
        : [];
    const countryById = new Map(countries.map((c) => [c.country_id, c.country]));

    return users.map((u) => {
      const profile = profileByUser.get(u.id) ?? null;
      return {
        ...this.stripSecrets(u),
        country: u.country_id != null ? (countryById.get(u.country_id) ?? null) : null,
        profile: profile ? this.decorateProfile(profile) : null,
      };
    });
  }

  /** Add decoded university_ids / course_ids beside the raw JSON columns. */
  private decorateProfile<
    T extends { university?: string | null; course?: string | null },
  >(profile: T) {
    return {
      ...profile,
      university_ids: this.decodeIds(profile.university),
      course_ids: this.decodeIds(profile.course),
    };
  }

  /** Encode an id list to the legacy JSON LongText column (null when absent). */
  private encodeIds(ids: number[] | undefined): string | null {
    if (ids === undefined) {
      return null;
    }
    return JSON.stringify([...new Set(ids)]);
  }

  /** Decode a legacy JSON LongText id column to a number[] (tolerant of junk). */
  private decodeIds(raw: string | null | undefined): number[] {
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
    } catch {
      return [];
    }
  }
}
