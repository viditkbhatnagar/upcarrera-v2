import { Module } from '@nestjs/common';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { FilesModule } from '../files/files.module';

/**
 * Resources browser module (folders + files).
 *
 * PrismaService comes from the @Global() PrismaModule, so it is not re-declared.
 * StorageService is consumed through FilesModule (which exports it) — we import
 * FilesModule rather than re-providing StorageService so uploads share the same
 * single storage abstraction instance/config as the files module.
 *
 * Register this module in app.module.ts's `imports` array.
 */
@Module({
  imports: [FilesModule],
  controllers: [ResourcesController],
  providers: [ResourcesService],
})
export class ResourcesModule {}
