import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTrainingVideoDto, UpdateTrainingVideoDto } from './dto/training-video.dto';

const LIVE = { deleted_at: null } as const;

/** Training Center: the counsellor read side plus minimal admin CRUD. */
@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active videos in display order, each flagged with the caller's completion. */
  async list(userId: number) {
    const [videos, done] = await Promise.all([
      this.prisma.training_video.findMany({
        where: { ...LIVE, status: true },
        orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.training_video_completion.findMany({
        where: { user_id: userId },
        select: { video_id: true, completed_at: true },
      }),
    ]);
    const completedAt = new Map(done.map((d) => [d.video_id, d.completed_at]));

    const items = videos.map((v) => ({
      id: v.id,
      title: v.title,
      description: v.description,
      category: v.category,
      video_url: v.video_url,
      thumbnail_url: v.thumbnail_url,
      duration_seconds: v.duration_seconds,
      completed: completedAt.has(v.id),
      completed_at: completedAt.get(v.id) ?? null,
    }));

    const counts = new Map<string, number>();
    for (const v of items) counts.set(v.category, (counts.get(v.category) ?? 0) + 1);
    const categories = [...counts].map(([name, count]) => ({ name, count }));

    return { items, categories, total: items.length, completed: items.filter((i) => i.completed).length };
  }

  async markComplete(userId: number, videoId: number) {
    await this.requireActive(videoId);
    await this.prisma.training_video_completion.createMany({
      data: [{ video_id: videoId, user_id: userId, completed_at: new Date() }],
      skipDuplicates: true,
    });
    return { id: videoId, completed: true };
  }

  async unmarkComplete(userId: number, videoId: number) {
    await this.requireActive(videoId);
    await this.prisma.training_video_completion.deleteMany({
      where: { video_id: videoId, user_id: userId },
    });
    return { id: videoId, completed: false };
  }

  /* ----------------------------- admin ----------------------------- */

  create(dto: CreateTrainingVideoDto, userId: number) {
    const now = new Date();
    return this.prisma.training_video.create({
      data: { ...dto, created_by: userId, updated_by: userId, created_at: now, updated_at: now },
    });
  }

  async update(id: number, dto: UpdateTrainingVideoDto, userId: number) {
    await this.requireExisting(id);
    return this.prisma.training_video.update({
      where: { id },
      data: { ...dto, updated_by: userId, updated_at: new Date() },
    });
  }

  async remove(id: number, userId: number) {
    await this.requireExisting(id);
    await this.prisma.training_video.update({
      where: { id },
      data: { deleted_at: new Date(), updated_by: userId },
    });
    return { id, deleted: true };
  }

  private async requireExisting(id: number) {
    const row = await this.prisma.training_video.findFirst({ where: { id, ...LIVE }, select: { id: true } });
    if (!row) throw new NotFoundException('Training video not found');
  }

  private async requireActive(id: number) {
    const row = await this.prisma.training_video.findFirst({
      where: { id, status: true, ...LIVE },
      select: { id: true },
    });
    if (!row) throw new NotFoundException('Training video not found');
  }
}
