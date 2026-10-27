import { Module } from '@nestjs/common';
import { ExternalRefereesController } from './external-referees.controller';
import { ExternalRefereesService } from './external-referees.service';

// PrismaModule is @Global().
@Module({
  controllers: [ExternalRefereesController],
  providers: [ExternalRefereesService],
})
export class ExternalRefereesModule {}
