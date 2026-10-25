import { Module } from '@nestjs/common';
import { TrainingController } from './training.controller';
import { TrainingService } from './training.service';

/** Counsellor Training Center. PrismaService comes from the @Global PrismaModule. */
@Module({
  controllers: [TrainingController],
  providers: [TrainingService],
})
export class TrainingModule {}
