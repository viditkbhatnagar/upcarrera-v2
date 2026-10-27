import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExternalRefereeDto } from './dto/create-external-referee.dto';

const LIST_LIMIT = 200;

@Injectable()
export class ExternalRefereesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Non-deleted referees, newest first; `search` matches name/email/phone. */
  list(search?: string) {
    const term = search?.trim();
    return this.prisma.external_referee.findMany({
      where: {
        deleted_at: null,
        ...(term
          ? {
              OR: [
                { name: { contains: term } },
                { email: { contains: term } },
                { phone: { contains: term } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: LIST_LIMIT,
    });
  }

  async create(dto: CreateExternalRefereeDto, actorUserId: number) {
    const email = dto.email.toLowerCase();
    const duplicate = await this.prisma.external_referee.findFirst({
      where: { email, deleted_at: null },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('An external referee with this email already exists');
    }
    const now = new Date();
    return this.prisma.external_referee.create({
      data: {
        name: dto.name,
        email,
        phone: dto.phone,
        state: dto.state,
        district: dto.district,
        created_by: actorUserId,
        created_at: now,
        updated_at: now,
      },
    });
  }
}
