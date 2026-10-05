import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/** Legacy user_role id for students — they share this login with the mobile app. */
const STUDENT_ROLE_ID = 4;
/** users.status value for a deactivated account (1 = active; NULL = legacy, treated as active). */
const INACTIVE_STATUS = 0;

/**
 * Port of CI4 Users_model::login_username_app() + jwt_helper::generate_auth_token().
 * NOTE: the legacy hardcoded master-password backdoor is intentionally NOT ported.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.users.findFirst({
      where: { username, deleted_at: null },
    });
    if (!user) {
      throw new UnauthorizedException('User not found!');
    }

    // Existing PHP password_hash() bcrypt ($2y$) hashes verify unchanged with bcryptjs.
    const ok = await bcrypt.compare(password, user.password ?? '');
    if (!ok) {
      throw new UnauthorizedException('Invalid password!');
    }

    // Deactivated STAFF cannot sign in (Phase 1 spec 1.1: "Inactive users can't log
    // in, and their records stay with the team"). Before this, status was never
    // checked, so the 13 counsellors marked inactive in production kept full
    // access to the CRM.
    //
    // Scoped to staff on purpose. Students (role 4) share this endpoint with the
    // mobile app, and 146 of them have status 0 — dropouts, cancelled and passed-out
    // students who may still need their records. Locking them out is a business
    // decision about the LMS, not a CRM fix, so their behaviour is unchanged.
    //
    // NULL is treated as active: legacy rows predate the column being populated.
    // Checked AFTER the password, so the account's state is only revealed to
    // someone who already knows its password.
    if (user.role_id !== STUDENT_ROLE_ID && user.status === INACTIVE_STATUS) {
      throw new UnauthorizedException(
        'This account has been deactivated. Contact your administrator.',
      );
    }

    const snapshot = this.toSnapshot(user);
    const auth_token = await this.jwt.signAsync({ sub: user.id, data: snapshot });
    return { ...snapshot, auth_token };
  }

  private toSnapshot(user: {
    id: number;
    role_id: number | null;
    name: string | null;
    username: string | null;
    email: string | null;
    phone: string | null;
    profile_picture: string | null;
  }) {
    return {
      id: user.id,
      role_id: user.role_id,
      name: user.name,
      username: user.username,
      email: user.email,
      phone: user.phone,
      profile_picture: user.profile_picture,
    };
  }
}
