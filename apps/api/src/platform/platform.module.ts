import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

/**
 * Platform administration module: users admin, roles, permissions,
 * role-permissions, settings, notifications. Imported into app.module.ts.
 * PrismaService is injected from the @Global() PrismaModule.
 */
@Module({
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
