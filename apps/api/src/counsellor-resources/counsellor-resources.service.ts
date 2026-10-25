import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCounsellorResourceDto,
  UpdateCounsellorResourceDto,
} from './dto/counsellor-resource.dto';

const LIVE = { deleted_at: null } as const;

/** Counsellor Resources: the read side plus minimal admin CRUD. */
@Injectable()
export class CounsellorResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every active resource in display order plus the folder list (one folder per
   * category, with its file count and latest update). The client groups by
   * `category`, so the folder page needs no second request.
   */
  async list() {
    const rows = await this.prisma.counsellor_resource.findMany({
      where: { ...LIVE, status: true },
      orderBy: [{ category: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
    const items = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      type: r.type,
      file_url: r.file_url,
      category: r.category,
      file_size_bytes: r.file_size_bytes,
      updated_at: r.updated_at ?? r.created_at,
    }));

    const folders = new Map<string, { name: string; count: number; updated_at: Date | null }>();
    for (const it of items) {
      const f = folders.get(it.category) ?? { name: it.category, count: 0, updated_at: null };
      f.count += 1;
      if (it.updated_at && (!f.updated_at || it.updated_at > f.updated_at)) f.updated_at = it.updated_at;
      folders.set(it.category, f);
    }
    return { items, folders: [...folders.values()], total: items.length };
  }

  /* ----------------------------- admin ----------------------------- */

  /** Every non-deleted resource, active or not, flat. */
  async listAll() {
    const items = await this.prisma.counsellor_resource.findMany({
      where: LIVE,
      orderBy: [{ category: 'asc' }, { sort_order: 'asc' }, { id: 'asc' }],
    });
    return { items, total: items.length };
  }

  create(dto: CreateCounsellorResourceDto, userId: number) {
    const now = new Date();
    return this.prisma.counsellor_resource.create({
      data: { ...dto, created_by: userId, updated_by: userId, created_at: now, updated_at: now },
    });
  }

  async update(id: number, dto: UpdateCounsellorResourceDto, userId: number) {
    await this.requireExisting(id);
    return this.prisma.counsellor_resource.update({
      where: { id },
      data: { ...dto, updated_by: userId, updated_at: new Date() },
    });
  }

  async remove(id: number, userId: number) {
    await this.requireExisting(id);
    await this.prisma.counsellor_resource.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: userId },
    });
    return { id, deleted: true };
  }

  private async requireExisting(id: number) {
    const row = await this.prisma.counsellor_resource.findFirst({
      where: { id, ...LIVE },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Resource not found');
  }
}
