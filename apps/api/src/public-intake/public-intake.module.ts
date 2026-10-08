import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { PublicIntakeController } from './public-intake.controller';
import { PublicIntakeService } from './public-intake.service';

/**
 * Self-serve public application intake (online admission funnel), separate from the
 * counsellor-initiated magic-link flow. Phase 1: the read-only catalogue. The public
 * submit endpoint (which creates an unassigned application + stores documents) is
 * added in phase 2. PrismaModule is @Global, so no imports are needed yet.
 */
@Module({
  imports: [FilesModule], // StorageService for document uploads
  controllers: [PublicIntakeController],
  providers: [PublicIntakeService],
})
export class PublicIntakeModule {}
