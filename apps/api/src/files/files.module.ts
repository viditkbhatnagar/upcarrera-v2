import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

/**
 * File upload + secure download module.
 *
 * PrismaService comes from the @Global() PrismaModule (see app.module.ts), so
 * it is not re-declared here — mirrors LeadsModule/AuthModule.
 *
 * StorageService is exported so other features (e.g. resources, finance
 * invoices) can persist files through the same abstraction later.
 */
@Module({
  controllers: [FilesController],
  providers: [FilesService, StorageService],
  exports: [StorageService],
})
export class FilesModule {}
