import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Port of CI4 Users_model::login_username_app() + jwt_helper::generate_auth_token().
 * NOTE: the legacy `|| $password == 'upcarrera@2024'` backdoor is intentionally NOT ported.
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
