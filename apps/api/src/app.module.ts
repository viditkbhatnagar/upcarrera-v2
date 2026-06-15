import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  providers: [
    // Global JWT guard — every route is protected unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Global role guard — enforces @Roles() at the controller layer
    // (CI4 only gated permissions in views; we move it server-side).
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
