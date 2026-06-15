import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SmsService } from './sms.service';

const OTP_DIGITS = 4;
const OTP_MIN = 10 ** (OTP_DIGITS - 1); // 1000
const OTP_MAX = 10 ** OTP_DIGITS; // 10000 (exclusive upper bound for randomInt)

/**
 * OTP issuing/verification against the `users.otp` column.
 *
 * Ports the intent of app/Services/Otp_service.php::generate_otp +
 * send_sms_otp, with the hardcoded bypass phone numbers and the '1234'
 * shortcut REMOVED. Lives in IntegrationsModule (not AuthModule) so auth's
 * files are untouched.
 */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Find the user by phone, generate a 4-digit OTP, persist it on users.otp,
   * and attempt to SMS it (no-op when SMS is unconfigured).
   */
  async send(phone: string): Promise<{ sent: boolean; reason?: string }> {
    const user = await this.prisma.users.findFirst({
      where: { phone, deleted_at: null },
      select: { id: true, phone: true },
    });

    if (!user || !user.phone) {
      throw new NotFoundException('No account found for this phone number');
    }

    // Cryptographically-strong 4-digit OTP (1000-9999).
    const otp = String(randomInt(OTP_MIN, OTP_MAX));

    await this.prisma.users.update({
      where: { id: user.id },
      data: { otp, updated_at: new Date() },
    });

    const result = await this.sms.sendOtp(user.phone, otp);
    return { sent: result.sent, reason: result.reason };
  }

  /**
   * Compare the supplied OTP against users.otp; clear it on success.
   */
  async verify(phone: string, otp: string): Promise<{ verified: boolean }> {
    const user = await this.prisma.users.findFirst({
      where: { phone, deleted_at: null },
      select: { id: true, otp: true },
    });

    if (!user) {
      throw new NotFoundException('No account found for this phone number');
    }

    if (!user.otp) {
      throw new BadRequestException('No OTP pending for this account');
    }

    if (user.otp !== otp) {
      return { verified: false };
    }

    // Clear the OTP so it cannot be replayed.
    await this.prisma.users.update({
      where: { id: user.id },
      data: { otp: null, updated_at: new Date() },
    });

    return { verified: true };
  }
}
