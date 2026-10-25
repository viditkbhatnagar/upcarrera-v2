import { Module } from '@nestjs/common';
import { CounsellorResourcesController } from './counsellor-resources.controller';
import { CounsellorResourcesService } from './counsellor-resources.service';

/** Counsellor Resources. PrismaService comes from the @Global PrismaModule. */
@Module({
  controllers: [CounsellorResourcesController],
  providers: [CounsellorResourcesService],
})
export class CounsellorResourcesModule {}
