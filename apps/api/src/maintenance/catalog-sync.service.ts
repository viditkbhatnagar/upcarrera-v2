import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nightly catalog drift catcher (IN04).
 *
 * The LMS / legacy PHP can still create `course` rows with a `university_id` that
 * the CRM's tagging API never sees. This job re-runs migration 002's idempotent
 * backfill (with source='sync') so any such course appears as a tagged
 * university_course within a day.
 *
 * DML-only (one INSERT ... SELECT ... NOT EXISTS), so the app's DML-only DB user
 * can run it, and it is safe to repeat: the NOT EXISTS guard makes a second run
 * insert nothing. It writes ONLY university_course and never touches
 * course.university_id (the mapping tables are the source of truth, not that
 * legacy column). Mirrors DataHygieneService's cron pattern.
 */
@Injectable()
export class CatalogSyncService {
  private readonly logger = new Logger(CatalogSyncService.name);

  /** Fixed SQL, no interpolation — the same statement migration 002 ships. */
  private static readonly SYNC_SQL =
    'INSERT INTO `university_course` ' +
    '(`university_id`, `course_id`, `university_course_name`, `status`, `source`, `created_at`, `updated_at`) ' +
    "SELECT c.`university_id`, c.`id`, NULL, 1, 'sync', NOW(), NOW() " +
    'FROM `course` c ' +
    'JOIN `university` u ON u.`id` = c.`university_id` AND u.`deleted_at` IS NULL ' +
    'WHERE c.`deleted_at` IS NULL AND c.`university_id` > 0 ' +
    'AND NOT EXISTS (SELECT 1 FROM `university_course` x ' +
    'WHERE x.`university_id` = c.`university_id` AND x.`course_id` = c.`id`)';

  constructor(private readonly prisma: PrismaService) {}

  /** 03:00 every day (server-local India time). */
  @Cron('0 3 * * *', { name: 'catalog-sync', timeZone: 'Asia/Kolkata' })
  async syncLegacyTags(): Promise<{ inserted: number }> {
    try {
      const inserted = await this.prisma.$executeRawUnsafe(
        CatalogSyncService.SYNC_SQL,
      );
      if (inserted > 0) {
        this.logger.log(`catalog sync: ${inserted} tagged-course row(s) inserted`);
      }
      return { inserted };
    } catch (err) {
      this.logger.warn(`catalog sync skipped: ${(err as Error).message}`);
      return { inserted: 0 };
    }
  }
}
