import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Nightly data hygiene for the shared legacy MySQL database.
 *
 * The still-live old PHP CRM can write legacy '0000-00-00' zero-dates. Prisma
 * rejects those on read ("invalid datetime value with day/month zero"), which
 * breaks any new-CRM screen that loads such a row. This job re-discovers every
 * nullable date/datetime column each run and NULLs any zero-date value (a
 * zero-date carries no information — NULL is the correct representation).
 *
 * Idempotent and safe: it only ever turns invalid zero-dates into NULL, never
 * touches real dates, and the old CRM renders NULL and 0000-00-00 identically
 * (blank). $executeRaw returns only an affected-row count, so reading the
 * zero-dates here does not trip Prisma's date deserialization.
 */
@Injectable()
export class DataHygieneService {
  private readonly logger = new Logger(DataHygieneService.name);

  private static readonly ZERO_DATES = "('0000-00-00', '0000-00-00 00:00:00')";
  private static readonly SAFE_IDENTIFIER = /^[A-Za-z0-9_]+$/;

  constructor(private readonly prisma: PrismaService) {}

  /** 02:30 every day (server-local India time). */
  @Cron('30 2 * * *', { name: 'zero-date-sweep', timeZone: 'Asia/Kolkata' })
  async sweepZeroDates(): Promise<{ total: number; columns: number }> {
    const columns = await this.prisma.$queryRaw<
      Array<{ TABLE_NAME: string; COLUMN_NAME: string }>
    >`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND DATA_TYPE IN ('date', 'datetime')
        AND IS_NULLABLE = 'YES'
    `;

    let total = 0;
    let touched = 0;
    for (const { TABLE_NAME: table, COLUMN_NAME: column } of columns) {
      // Identifiers come from the DB catalog, but validate before interpolation.
      if (
        !DataHygieneService.SAFE_IDENTIFIER.test(table) ||
        !DataHygieneService.SAFE_IDENTIFIER.test(column)
      ) {
        continue;
      }
      try {
        const affected = await this.prisma.$executeRawUnsafe(
          `UPDATE \`${table}\` SET \`${column}\` = NULL ` +
            `WHERE \`${column}\` IN ${DataHygieneService.ZERO_DATES}`,
        );
        if (affected > 0) {
          total += affected;
          touched += 1;
          this.logger.log(`zero-date sweep: ${table}.${column} -> ${affected} nulled`);
        }
      } catch (err) {
        this.logger.warn(
          `zero-date sweep skipped ${table}.${column}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `zero-date sweep complete: ${total} value(s) across ${touched} column(s)`,
    );
    return { total, columns: touched };
  }
}
