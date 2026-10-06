import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../integrations/email.service';
import { EmailTemplatesService } from '../integrations/email-templates.service';
import { AuditService } from '../workflow/audit.service';

/** One-time code: 6 digits, short-lived, hard attempt + issuance caps. */
const OTP_TTL_MINUTES = 10;
const OTP_EXPIRY_MS = OTP_TTL_MINUTES * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5; // guesses allowed per code before it is burned
const ISSUE_CAP_24H = 5; // anti email-bomb, per user
const DAY_MS = 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;
/** Students share the login endpoint with the mobile app; recovery is staff-only. */
const STUDENT_ROLE_ID = 4;

/**
 * Staff self-serve password reset (migration 004). Security model:
 *   - the 6-digit code is emailed; the DB stores only HMAC-SHA256(secret, user||code)
 *     (M5). A DB leak alone is useless, verification is O(1) + timing-safe, and
 *     there is no bcrypt CPU cost per guess (no unauth DoS vector).
 *   - one active code per user; <= 5 codes / 24h; code burned after 5 wrong tries.
 *     The attempt counter is an ATOMIC conditional increment, so concurrent guesses
 *     can never exceed the cap (H1).
 *   - NO account enumeration: requestReset runs entirely in the background so the
 *     HTTP response is the same fixed 200 in constant time whether or not the
 *     account exists (H2); resetWithOtp returns one generic error for every
 *     account/code failure and spends a dummy compare so its timing does not leak.
 *   - a successful reset stamps users.password_changed_at, which the JwtStrategy
 *     uses to invalidate every session issued before the reset.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);
  /** Deliberately identical for the unknown-user and bad-code paths. */
  private static readonly GENERIC_INVALID =
    'That code is invalid or has expired. Please request a new one.';
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly templates: EmailTemplatesService,
    private readonly audit: AuditService,
  ) {
    // The OTP HMAC key. JWT_SECRET is already required + validated at boot
    // (JwtStrategy refuses to start without it), so reuse it as the pepper.
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new Error('JWT_SECRET is required for PasswordResetService (OTP HMAC key).');
    }
    this.pepper = secret;
  }

  /**
   * Step 1: issue + email a one-time code. Returns IMMEDIATELY and does all work
   * (lookup, create, send) in the background so the response time never reveals
   * whether the account exists (H2). Never throws — failures are logged only.
   */
  requestReset(identifier: string, ip: string | null): void {
    void this.doRequestReset(identifier, ip).catch((err) => {
      this.logger.error(`password-reset request failed: ${(err as Error).message}`);
    });
  }

  private async doRequestReset(identifier: string, ip: string | null): Promise<void> {
    const user = await this.findActiveUser(identifier);
    // No account, a student account, or no email on file -> stop silently.
    if (!user || user.role_id === STUDENT_ROLE_ID || !user.email?.trim()) return;

    const now = new Date();
    const since = new Date(now.getTime() - DAY_MS);
    const issued24h = await this.prisma.password_reset.count({
      where: { user_id: user.id, created_at: { gte: since } },
    });
    if (issued24h >= ISSUE_CAP_24H) {
      this.logger.warn(`Password-reset issuance cap hit for user ${user.id}`);
      return; // no enumeration, no email-bomb
    }

    // One active code at a time: retire any still-live codes before issuing.
    await this.prisma.password_reset.updateMany({
      where: { user_id: user.id, consumed_at: null, revoked_at: null },
      data: { revoked_at: now },
    });

    const code = this.generateOtp();
    const toEmail = user.email.trim();
    const row = await this.prisma.password_reset.create({
      data: {
        user_id: user.id,
        otp_hash: this.hmac(user.id, code),
        expires_at: new Date(now.getTime() + OTP_EXPIRY_MS),
        sent_to_email: toEmail,
        email_status: 'pending',
        last_ip: ip,
        created_at: now,
      },
    });

    try {
      const rendered = this.templates.render('password-reset-otp', {
        first_name: this.firstName(user.name),
        email: toEmail,
        otp_code: code,
        otp_expiry_minutes: OTP_TTL_MINUTES,
        request_time: this.formatRequestTime(now),
      });
      await this.email.sendEmail({
        to: toEmail,
        name: user.name ?? 'there',
        subject: rendered.subject,
        html: rendered.html,
        saveToSentItems: false,
      });
      await this.prisma.password_reset.update({
        where: { id: row.id },
        data: { email_status: 'sent' },
      });
    } catch (err) {
      await this.prisma.password_reset
        .update({
          where: { id: row.id },
          data: {
            email_status: 'failed',
            email_error: (err as Error).message.slice(0, 250),
            revoked_at: new Date(),
          },
        })
        .catch(() => undefined);
      this.logger.error(`Password-reset email failed for user ${user.id}: ${(err as Error).message}`);
      return;
    }

    await this.auditSafe({
      action: 'password_reset_requested',
      entity: 'users',
      entityId: user.id,
      actorId: user.id,
      actorRoleId: user.role_id ?? null,
      actorType: 'anonymous',
      ip,
    });
  }

  /**
   * Step 2: verify the code and set the new password. Throws a BadRequest with the
   * SAME generic message for an unknown user, a missing/expired/consumed/burned
   * code, and a wrong code — none reveal whether the account exists.
   */
  async resetWithOtp(
    identifier: string,
    otp: string,
    newPassword: string,
    ip: string | null,
  ): Promise<void> {
    const now = new Date();
    const user = await this.findActiveUser(identifier);
    if (!user || user.role_id === STUDENT_ROLE_ID) {
      this.dummyCompare();
      throw new BadRequestException(PasswordResetService.GENERIC_INVALID);
    }

    const code = await this.prisma.password_reset.findFirst({
      where: { user_id: user.id, consumed_at: null, revoked_at: null, expires_at: { gt: now } },
      orderBy: { id: 'desc' },
    });
    if (!code) {
      this.dummyCompare();
      throw new BadRequestException(PasswordResetService.GENERIC_INVALID);
    }

    // H1: reserve ONE attempt atomically BEFORE the compare. The conditional
    // `attempt_count < MAX` + `increment` is applied under the row lock, so N
    // concurrent guesses can never consume more than MAX attempts total.
    const reserved = await this.prisma.password_reset.updateMany({
      where: {
        id: code.id,
        consumed_at: null,
        revoked_at: null,
        expires_at: { gt: now },
        attempt_count: { lt: MAX_VERIFY_ATTEMPTS },
      },
      data: { attempt_count: { increment: 1 } },
    });
    if (reserved.count !== 1) {
      this.dummyCompare();
      throw new BadRequestException(PasswordResetService.GENERIC_INVALID);
    }

    const match = this.verify(user.id, otp, code.otp_hash);
    if (!match) {
      // Burn the code once the cap is reached so the 6-digit space cannot be walked.
      await this.prisma.password_reset.updateMany({
        where: { id: code.id, revoked_at: null, attempt_count: { gte: MAX_VERIFY_ATTEMPTS } },
        data: { revoked_at: now },
      });
      throw new BadRequestException(PasswordResetService.GENERIC_INVALID);
    }

    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      // Consume THIS code only if still live (guards a double-submit race).
      const consumed = await tx.password_reset.updateMany({
        where: { id: code.id, consumed_at: null, revoked_at: null },
        data: { consumed_at: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(PasswordResetService.GENERIC_INVALID);
      }
      await tx.password_reset.updateMany({
        where: { user_id: user.id, id: { not: code.id }, consumed_at: null, revoked_at: null },
        data: { revoked_at: now },
      });
      await tx.users.update({
        where: { id: user.id },
        data: {
          password: hashed,
          prev_password: user.password ?? null,
          // Invalidates every token issued before now (see JwtStrategy).
          password_changed_at: now,
          updated_at: now,
        },
      });
    });

    await this.auditSafe({
      action: 'password_reset',
      entity: 'users',
      entityId: user.id,
      actorId: user.id,
      actorRoleId: user.role_id ?? null,
      actorType: 'anonymous', // unauthenticated action by the account holder
      ip,
    });
  }

  // ---- helpers -------------------------------------------------------------

  private async findActiveUser(identifier: string) {
    const id = identifier.trim();
    if (!id) return null;
    return this.prisma.users.findFirst({
      where: {
        deleted_at: null,
        // Mirror AuthService.login: NULL status is treated as active (M7).
        OR: [{ status: 1 }, { status: null }],
        AND: { OR: [{ email: id }, { username: id }] },
      },
      // Deterministic pick when a value matches more than one row (M7).
      orderBy: { id: 'asc' },
      select: { id: true, name: true, email: true, role_id: true, password: true },
    });
  }

  /** HMAC-SHA256 of the code, keyed by the server pepper and bound to the user. */
  private hmac(userId: number, code: string): string {
    return createHmac('sha256', this.pepper).update(`${userId}:${code}`).digest('hex');
  }

  private verify(userId: number, code: string, storedHash: string): boolean {
    const expected = this.hmac(userId, code);
    try {
      return timingSafeEqual(Buffer.from(expected), Buffer.from(storedHash));
    } catch {
      return false; // length mismatch / malformed stored value
    }
  }

  /** Spend a comparable amount of work on the no-user / no-code paths. */
  private dummyCompare(): void {
    const a = this.hmac(0, '000000');
    try {
      timingSafeEqual(Buffer.from(a), Buffer.from(a));
    } catch {
      /* ignore */
    }
  }

  /** Cryptographically-uniform 6-digit code (000000–999999). */
  private generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private firstName(name: string | null): string {
    const first = (name ?? '').trim().split(/\s+/)[0];
    return first || 'there';
  }

  private formatRequestTime(date: Date): string {
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(date);
  }

  /** Audit is best-effort — a logging hiccup must never fail a reset. */
  private async auditSafe(entry: Parameters<AuditService['record']>[1]): Promise<void> {
    try {
      await this.audit.record(this.prisma, entry);
    } catch (err) {
      this.logger.warn(`password-reset audit skipped: ${(err as Error).message}`);
    }
  }
}
